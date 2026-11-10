import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

const specUrl = new URL('../../docs/specs/002-proveedores-ia/spec.md', import.meta.url);

test('spec 002 includes a dated embeddings comparison table for OpenAI and Gemini with official links (T23)', async () => {
  const content = await readFile(specUrl, 'utf8');

  expect(content).toMatch(/\b2026-\d{2}-\d{2}\b/);
  expect(content).toContain('Comparación de proveedores para Embeddings (T23');
  expect(content).toContain('text-embedding-3-small');
  expect(content).toContain('gemini-embedding-001');
  expect(content).toContain('Nivel gratuito');
  expect(content).toContain('Precio');
  expect(content).toContain('Límites');
  expect(content).toContain('Privacidad');
  expect(content).toContain('Dimensiones');
  expect(content).toContain('Calidad esperada');
  expect(content).toContain('https://platform.openai.com/docs/guides/embeddings');
  expect(content).toContain('https://ai.google.dev/gemini-api/docs/embeddings');
});

test('spec 002 includes a dated generation comparison table for OpenAI and Gemini with official links (T23a)', async () => {
  const content = await readFile(specUrl, 'utf8');

  expect(content).toContain('Comparación de proveedores para Generación (T23a');
  expect(content).toContain('gpt-4o-mini');
  expect(content).toContain('gemini-3.8-flash');
  expect(content).toContain('https://platform.openai.com/docs/models');
  expect(content).toContain('https://ai.google.dev/gemini-api/docs/text-generation');
});

test('spec 002 records the approved separate decisions for embeddings and generation (T24)', async () => {
  const content = await readFile(specUrl, 'utf8');

  expect(content).toContain('EMBEDDING_PROVIDER');
  expect(content).toContain('GENERATION_PROVIDER');
  expect(content).toContain('EMBEDDING_PROVIDER=gemini');
  expect(content).toContain('EMBEDDING_MODEL=gemini-embedding-001');
  expect(content).toContain('EMBEDDING_DIMENSIONS=1536');
  expect(content).toContain('GENERATION_PROVIDER=gemini');
  expect(content).toContain('GENERATION_MODEL=gemini-3.5-flash-lite');
  expect(content).not.toContain('GENERATION_MODEL=gemini-2.5-flash');
  expect(content).toContain('Riesgo aceptado (RNF-7)');
  expect(content).toContain('Aprobada por el usuario el `2026-11-09`');
});

