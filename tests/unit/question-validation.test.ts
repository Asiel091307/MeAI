import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import {
  MAX_QUESTION_LENGTH,
  runValidatedQuestionSearch,
  validateQuestion,
} from '../../src/rag/answering/question-validation';
import type { EmbeddingProvider } from '../../src/rag/providers/embeddings';

test('the question length limit is 1000 characters', () => {
  expect(MAX_QUESTION_LENGTH).toBe(1000);
});

test('a non-empty question of between 1 and 1000 characters is accepted', () => {
  expect(validateQuestion('¿Qué dice el documento?')).toEqual({ valid: true });
  expect(validateQuestion('a')).toEqual({ valid: true });
  expect(validateQuestion('a'.repeat(MAX_QUESTION_LENGTH))).toEqual({ valid: true });
});

test('an empty question is rejected with an explanatory message in Spanish', () => {
  expect(validateQuestion('')).toEqual({
    valid: false,
    reason: 'La pregunta no puede estar vacía. Escribe una pregunta para consultar tus documentos.',
  });
});

test('a whitespace-only question is rejected with an explanatory message in Spanish', () => {
  expect(validateQuestion('   \t\n  ')).toEqual({
    valid: false,
    reason: 'La pregunta no puede estar vacía. Escribe una pregunta para consultar tus documentos.',
  });
});

test('a question longer than 1000 characters is rejected with the exceeded limit in Spanish', () => {
  expect(validateQuestion('a'.repeat(MAX_QUESTION_LENGTH + 1))).toEqual({
    valid: false,
    reason: 'La pregunta tiene 1001 caracteres y supera el límite de 1000 caracteres.',
  });
});

test('invalid questions are rejected before calling embeddings or search', async () => {
  const embed = vi.fn<EmbeddingProvider['embed']>(async () => [0.1, 0.2]);
  const search = vi.fn(async (_vector: readonly number[]) => ['chunk-1']);

  for (const invalid of ['', '   \n\t ', 'x'.repeat(MAX_QUESTION_LENGTH + 1)]) {
    const result = await runValidatedQuestionSearch(invalid, { embed }, search);
    expect(result.ok).toBe(false);
  }

  expect(embed).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});

test('a valid question invokes embeddings and search', async () => {
  const embed = vi.fn<EmbeddingProvider['embed']>(async () => [0.5, -0.5]);
  const search = vi.fn(async (vector: readonly number[]) => [{ id: 'chunk-1', vector }]);

  const result = await runValidatedQuestionSearch('¿Cuándo se presenta la solicitud?', { embed }, search);

  expect(result).toEqual({
    ok: true,
    results: [{ id: 'chunk-1', vector: [0.5, -0.5] }],
  });
  expect(embed).toHaveBeenCalledTimes(1);
  expect(embed).toHaveBeenCalledWith('¿Cuándo se presenta la solicitud?');
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith([0.5, -0.5]);
});

test('question validation module does not import React or HTTP modules', async () => {
  const source = await readFile(
    new URL('../../src/rag/answering/question-validation.ts', import.meta.url),
    'utf8',
  );
  const imports = ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName);

  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^(react|next|node:http)/);
  }
});

