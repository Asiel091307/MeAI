import { expect, test, vi } from 'vitest';
import { createOpenAiCompatibleEmbeddingProvider } from '../../src/rag/providers/openai-compatible-embeddings';

function jsonResponse(vectors: unknown[], shuffle = false): Response {
  const data = vectors.map((embedding, index) => ({ object: 'embedding', index, embedding }));
  if (shuffle) data.reverse();
  return new Response(JSON.stringify({ data }), { status: 200 });
}

test('sends the request to {baseUrl}/embeddings with bearer key and dimensions', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse([[3, 4]]));
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'secret-key',
    model: 'embed-1',
    dimensions: 2,
    fetch: fetchFn,
  });

  const vector = await provider.embed('hola');

  const [url, init] = fetchFn.mock.calls[0];
  expect(String(url)).toBe('https://api.example.com/v1/embeddings');
  expect(init?.method).toBe('POST');
  expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer secret-key' });
  expect(JSON.parse(String(init?.body))).toEqual({ model: 'embed-1', input: ['hola'], dimensions: 2 });
  expect(vector).toEqual([0.6, 0.8]);
});

test('omits Authorization without a key and dimensions when not a number', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse([[1, 0, 0]]));
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'nomic',
    dimensions: null,
    fetch: fetchFn,
  });

  await provider.embed('hola');

  const init = fetchFn.mock.calls[0][1];
  expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(String(init?.body))).toEqual({ model: 'nomic', input: ['hola'] });
});

test('splits documents in batches of 100 and keeps the input order', async () => {
  const inputs = Array.from({ length: 205 }, (_, i) => `t${i}`);
  const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
    const { input } = JSON.parse(String(init?.body)) as { input: string[] };
    return jsonResponse(input.map((text) => [Number(text.slice(1)) + 1, 0]), true);
  });
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    dimensions: null,
    fetch: fetchFn,
  });

  const vectors = await provider.embedDocuments(inputs);

  expect(fetchFn).toHaveBeenCalledTimes(3);
  expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).input.length)).toEqual([100, 100, 5]);
  expect(vectors).toHaveLength(205);
});

test('sorts by the index the server reports', async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse([[1, 0], [0, 1]], true));
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    dimensions: null,
    fetch: fetchFn,
  });
  expect(await provider.embedDocuments(['a', 'b'])).toEqual([
    [1, 0],
    [0, 1],
  ]);
});

test('empty input returns [] without a request', async () => {
  const fetchFn = vi.fn<typeof fetch>();
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    dimensions: null,
    fetch: fetchFn,
  });
  expect(await provider.embedDocuments([])).toEqual([]);
  expect(fetchFn).not.toHaveBeenCalled();
});

test('rejects wrong size, mismatched sizes, zero and non-numeric vectors', async () => {
  const make = (vectors: unknown[], dimensions: number | null) =>
    createOpenAiCompatibleEmbeddingProvider({
      baseUrl: 'http://x/v1',
      apiKey: '',
      model: 'm',
      dimensions,
      fetch: vi.fn<typeof fetch>(async () => jsonResponse(vectors)),
    });

  await expect(make([[1, 2, 3]], 2).embed('a')).rejects.toThrow(/wrong size/);
  await expect(make([[1, 2], [1, 2, 3]], null).embedDocuments(['a', 'b'])).rejects.toThrow(/different sizes/);
  await expect(make([[0, 0]], null).embed('a')).rejects.toThrow(/zero vector/);
  await expect(make([['x', 1]], null).embed('a')).rejects.toThrow(/numeric/);
});

test('rejects a response with the wrong number of vectors', async () => {
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://x/v1',
    apiKey: '',
    model: 'm',
    dimensions: null,
    fetch: vi.fn<typeof fetch>(async () => jsonResponse([[1, 0]])),
  });
  await expect(provider.embedDocuments(['a', 'b'])).rejects.toThrow(/1 vectors for 2 inputs/);
});

test('HTTP errors include status and message but never the key', async () => {
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl: 'http://x/v1',
    apiKey: 'secret-key',
    model: 'm',
    dimensions: null,
    fetch: vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { message: 'Bad key secret-key' } }), { status: 401 }),
    ),
  });
  const error = (await provider.embed('a').catch((e: Error) => e)) as Error;
  expect(error.message).toContain('401');
  expect(error.message).toContain('Bad key [redacted]');
  expect(error.message).not.toContain('secret-key');
});
