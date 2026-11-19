import { expect, test } from 'vitest';
import { createOpenAiCompatibleAnswerGenerator } from '../../src/rag/providers/openai-compatible-generation';
import { createOpenAiCompatibleEmbeddingProvider } from '../../src/rag/providers/openai-compatible-embeddings';

try {
  process.loadEnvFile('.env');
} catch {}

const baseUrl = process.env.OLLAMA_BASE_URL;

test.skipIf(!baseUrl)('a real OpenAI-compatible server returns unit-length embeddings', async () => {
  const provider = createOpenAiCompatibleEmbeddingProvider({
    baseUrl,
    apiKey: '',
    model: process.env.OLLAMA_EMBEDDING_MODEL,
    dimensions: null,
  });
  const [vector] = await provider.embedDocuments(['El plazo vence el viernes.']);
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  expect(norm).toBeCloseTo(1, 5);
});

test.skipIf(!baseUrl)(
  'a real OpenAI-compatible server streams an answer',
  async () => {
    const generator = createOpenAiCompatibleAnswerGenerator({
      baseUrl,
      apiKey: '',
      model: process.env.OLLAMA_GENERATION_MODEL,
    });
    const events = [];
    for await (const event of generator.stream('¿Cuándo vence el plazo?', [
      { id: 'c1', documentId: 'd1', page: 1, text: 'El plazo vence el viernes.', score: 1 },
    ])) {
      events.push(event);
    }
    expect(events.at(-1)?.type).toBe('final');
  },
  120_000,
);
