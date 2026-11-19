import { expect, test } from 'vitest';
import { loadAiConfig } from '../../src/rag/providers/ai-config';
import { createAnswerGenerator, createEmbeddingProvider } from '../../src/rag/providers/factory';

// Spec 012, RF-012-1: the configured provider is the one that gets called.
const SECRET = 'sk-factory-secret-123';

function recordingFetch(vector: number[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string> });
    const body = String(url).includes(':embedContent')
      ? { embedding: { values: vector } }
      : { data: [{ index: 0, embedding: vector }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

test('Gemini embeddings use the Gemini endpoint with the configured key', async () => {
  const { calls, fetchFn } = recordingFetch([3, 4]);
  const config = loadAiConfig({ GEMINI_API_KEY: SECRET, EMBEDDING_DIMENSIONS: '2' });
  await expect(createEmbeddingProvider(config, fetchFn).embed('hola')).resolves.toEqual([0.6, 0.8]);
  expect(calls[0].url).toBe(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
  );
  expect(calls[0].headers['x-goog-api-key']).toBe(SECRET);
});

test('openai-compatible embeddings call {base}/embeddings, without a key on a local service', async () => {
  const { calls, fetchFn } = recordingFetch([0, 2]);
  const config = loadAiConfig({
    EMBEDDING_PROVIDER: 'openai-compatible',
    EMBEDDING_BASE_URL: 'http://ollama:11434/v1',
    EMBEDDING_MODEL: 'nomic-embed-text',
  });
  await expect(createEmbeddingProvider(config, fetchFn).embed('hola')).resolves.toEqual([0, 1]);
  expect(calls[0].url).toBe('http://ollama:11434/v1/embeddings');
  expect(calls[0].headers.Authorization).toBeUndefined();
});

test('a missing required key names the variable and never builds the provider', () => {
  expect(() => createEmbeddingProvider(loadAiConfig({}))).toThrow(/GEMINI_API_KEY/);
  expect(() =>
    createAnswerGenerator(loadAiConfig({ GENERATION_PROVIDER: 'openai-compatible' })),
  ).toThrow(/OPENAI_API_KEY/);
});

test('the generator follows GENERATION_PROVIDER', async () => {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    calls.push(String(url));
    return new Response('data: {"choices":[{"delta":{"content":"Hola"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
  }) as unknown as typeof fetch;
  const generator = createAnswerGenerator(
    loadAiConfig({ GENERATION_PROVIDER: 'openai-compatible', OPENAI_API_KEY: SECRET }),
    fetchFn,
  );
  const sources = [{ id: 'S1', documentId: 'd1', page: 1, text: 'Hola mundo', score: 0.9 }];
  const events = [];
  for await (const event of generator.stream('¿Qué dice?', sources)) events.push(event);
  expect(events[0]).toEqual({ type: 'text', text: 'Hola' });
  expect(calls).toEqual(['https://api.openai.com/v1/chat/completions']);
});
