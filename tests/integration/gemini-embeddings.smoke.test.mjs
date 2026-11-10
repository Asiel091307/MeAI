import { expect, test } from 'vitest';

try { process.loadEnvFile('.env'); } catch {}

const { loadGeminiEmbeddingProvider } = await import('../../src/rag/providers/gemini-embeddings.ts');

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

// Real network call: needs the user's own GEMINI_API_KEY in .env. Skipped when it is not set.
test.skipIf(!process.env.GEMINI_API_KEY)('Gemini returns normalized 1536-value vectors for a chunk and a question', async () => {
  const provider = loadGeminiEmbeddingProvider();

  const [chunk] = await provider.embedDocuments([
    'La fotosíntesis es el proceso por el cual las plantas convierten la luz solar en energía química.',
  ]);
  const question = await provider.embed('¿Cómo obtienen energía las plantas?');

  for (const vector of [chunk, question]) {
    expect(vector).toHaveLength(1536);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(norm(vector)).toBeCloseTo(1, 5);
  }
});
