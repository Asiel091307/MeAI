import { describe, expect, test } from 'vitest';
import {
  createGeminiEmbeddingProvider,
  loadGeminiEmbeddingProvider,
} from '../../src/rag/providers/gemini-embeddings';

const API_KEY = 'test-key-do-not-leak-123';
const MODEL = 'gemini-embedding-001';
const BASE_URL = 'https://example.test/v1beta';

interface RecordedCall {
  url: string;
  init: RequestInit;
  body: any;
}

// Fake fetch: records calls and answers every request with a vector built by `vectorFor`.
function createFakeFetch(options: {
  dimensions: number;
  vectorFor?: (text: string) => number[];
  respond?: () => Response;
}) {
  const calls: RecordedCall[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url: String(url), init, body });
    if (options.respond) return options.respond();
    const vectorFor = options.vectorFor
      ?? ((text: string) => Array.from({ length: options.dimensions }, (_, i) => text.length + i + 1));
    if (String(url).endsWith(':batchEmbedContents')) {
      const embeddings = body.requests.map((r: any) => ({ values: vectorFor(r.content.parts[0].text) }));
      return new Response(JSON.stringify({ embeddings }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ embedding: { values: vectorFor(body.content.parts[0].text) } }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { calls, fakeFetch };
}

function norm(vector: readonly number[]) {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

function makeProvider(fake: ReturnType<typeof createFakeFetch>, dimensions = 4) {
  return createGeminiEmbeddingProvider({
    apiKey: API_KEY, model: MODEL, dimensions, fetch: fake.fakeFetch, baseUrl: BASE_URL,
  });
}

describe('createGeminiEmbeddingProvider', () => {
  test('embed sends a RETRIEVAL_QUERY embedContent request with the key in a header', async () => {
    const fake = createFakeFetch({ dimensions: 4 });
    await makeProvider(fake).embed('Â¿QuÃ© dice el documento?');

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.url).toBe(`${BASE_URL}/models/${MODEL}:embedContent`);
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(API_KEY);
    expect(headers['Content-Type']).toBe('application/json');
    expect(call.url).not.toContain(API_KEY);
    expect(call.body).toEqual({
      model: `models/${MODEL}`,
      content: { parts: [{ text: 'Â¿QuÃ© dice el documento?' }] },
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 4,
    });
  });

  test('embedDocuments sends one RETRIEVAL_DOCUMENT batchEmbedContents request', async () => {
    const fake = createFakeFetch({ dimensions: 4 });
    const vectors = await makeProvider(fake).embedDocuments(['uno', 'dos']);

    expect(vectors).toHaveLength(2);
    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call.url).toBe(`${BASE_URL}/models/${MODEL}:batchEmbedContents`);
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['x-goog-api-key']).toBe(API_KEY);
    expect(call.body).toEqual({
      requests: ['uno', 'dos'].map((text) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 4,
      })),
    });
  });

  test('returns L2-normalized vectors', async () => {
    const fake = createFakeFetch({ dimensions: 4, vectorFor: () => [3, 4, 0, 0] });
    const provider = makeProvider(fake);

    const query = await provider.embed('pregunta');
    const [document] = await provider.embedDocuments(['fragmento']);

    expect(query[0]).toBeCloseTo(0.6);
    expect(query[1]).toBeCloseTo(0.8);
    expect(norm(query)).toBeCloseTo(1, 10);
    expect(norm(document)).toBeCloseTo(1, 10);
  });

  test('empty input makes no request', async () => {
    const fake = createFakeFetch({ dimensions: 4 });
    expect(await makeProvider(fake).embedDocuments([])).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  test('splits large inputs into ordered batches', async () => {
    const fake = createFakeFetch({
      dimensions: 2,
      // First component encodes the chunk index so order can be checked after normalization.
      vectorFor: (text) => [Number(text), 1],
    });
    const texts = Array.from({ length: 250 }, (_, i) => String(i));
    const vectors = await makeProvider(fake, 2).embedDocuments(texts);

    expect(fake.calls.length).toBeGreaterThan(1);
    for (const call of fake.calls) expect(call.body.requests.length).toBeLessThanOrEqual(100);
    expect(fake.calls.flatMap((c) => c.body.requests.map((r: any) => r.content.parts[0].text))).toEqual(texts);
    expect(vectors).toHaveLength(250);
    vectors.forEach((vector, i) => {
      expect(vector[0] / vector[1]).toBeCloseTo(i);
    });
  });

  test('throws when a vector has the wrong number of dimensions', async () => {
    const fake = createFakeFetch({ dimensions: 4, vectorFor: () => [1, 2, 3] });
    const provider = makeProvider(fake);
    await expect(provider.embed('x')).rejects.toThrow(/expected 4.*got 3/i);
    await expect(provider.embedDocuments(['x'])).rejects.toThrow(/expected 4.*got 3/i);
  });

  test('throws when the batch returns a different number of vectors', async () => {
    const fake = createFakeFetch({
      dimensions: 4,
      respond: () => new Response(JSON.stringify({ embeddings: [{ values: [1, 0, 0, 0] }] }), { status: 200 }),
    });
    await expect(makeProvider(fake).embedDocuments(['a', 'b'])).rejects.toThrow(/1.*2/);
  });

  test('throws on a zero vector instead of dividing by zero', async () => {
    const fake = createFakeFetch({ dimensions: 4, vectorFor: () => [0, 0, 0, 0] });
    await expect(makeProvider(fake).embed('x')).rejects.toThrow(/zero/i);
  });

  test.each([
    [429, 'Resource has been exhausted (e.g. check quota).'],
    [400, 'API key not valid. Please pass a valid API key.'],
  ])('HTTP %i throws with status and message but never the key', async (status, message) => {
    const fake = createFakeFetch({
      dimensions: 4,
      respond: () => new Response(
        JSON.stringify({ error: { code: status, message: `${message} key=${API_KEY}`, status: 'X' } }),
        { status },
      ),
    });
    const provider = makeProvider(fake);

    for (const run of [() => provider.embed('x'), () => provider.embedDocuments(['x'])]) {
      const error = await run().then(() => null, (e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain(String(status));
      expect(error!.message).toContain(message);
      expect(error!.message).not.toContain(API_KEY);
      expect(String(error!.stack)).not.toContain(API_KEY);
    }
  });

  test('HTTP error with a non-JSON body still throws without the key', async () => {
    const fake = createFakeFetch({
      dimensions: 4,
      respond: () => new Response('upstream broke', { status: 503 }),
    });
    const error = await makeProvider(fake).embed('x').then(() => null, (e: Error) => e);
    expect(error!.message).toContain('503');
    expect(error!.message).not.toContain(API_KEY);
  });
});

describe('loadGeminiEmbeddingProvider', () => {
  test('uses defaults and the real endpoint with only the key set', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ embedding: { values: Array.from({ length: 1536 }, () => 1) } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    try {
      const provider = loadGeminiEmbeddingProvider({ GEMINI_API_KEY: API_KEY });
      const vector = await provider.embed('hola');
      expect(vector).toHaveLength(1536);
      expect(calls).toEqual([
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });

  test('reads model and dimensions from the environment', async () => {
    const calls: any[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ embedding: { values: [1, 0, 0] } }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const provider = loadGeminiEmbeddingProvider({
        GEMINI_API_KEY: API_KEY,
        EMBEDDING_PROVIDER: 'gemini',
        EMBEDDING_MODEL: 'custom-model',
        EMBEDDING_DIMENSIONS: '3',
      });
      await provider.embed('hola');
      expect(calls[0].url).toContain('/models/custom-model:embedContent');
      expect(calls[0].body.outputDimensionality).toBe(3);
    } finally {
      globalThis.fetch = original;
    }
  });

  test.each([{}, { GEMINI_API_KEY: '' }, { GEMINI_API_KEY: '   ' }])(
    'throws a clear error naming GEMINI_API_KEY when it is missing (%j)',
    (env) => {
      expect(() => loadGeminiEmbeddingProvider(env)).toThrow(/GEMINI_API_KEY/);
    },
  );

  test.each(['0', '-5', '1.5', 'abc', '1e3'])('rejects invalid EMBEDDING_DIMENSIONS %s', (value) => {
    expect(() => loadGeminiEmbeddingProvider({ GEMINI_API_KEY: API_KEY, EMBEDDING_DIMENSIONS: value }))
      .toThrow(/EMBEDDING_DIMENSIONS/);
  });

  test('rejects an EMBEDDING_PROVIDER other than gemini', () => {
    expect(() => loadGeminiEmbeddingProvider({ GEMINI_API_KEY: API_KEY, EMBEDDING_PROVIDER: 'openai' }))
      .toThrow(/EMBEDDING_PROVIDER/);
  });
});
