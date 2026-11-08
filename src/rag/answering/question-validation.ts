import type { EmbeddingProvider } from '../providers/embeddings';

export const MAX_QUESTION_LENGTH = 1000;

export type QuestionValidation = { valid: true } | { valid: false; reason: string };

export type ValidatedSearchResult<T> =
  | { ok: true; results: T }
  | { ok: false; reason: string };

export function validateQuestion(question: string): QuestionValidation {
  if (question.trim().length === 0) {
    return {
      valid: false,
      reason: 'La pregunta no puede estar vacía. Escribe una pregunta para consultar tus documentos.',
    };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      reason: `La pregunta tiene ${question.length} caracteres y supera el límite de ${MAX_QUESTION_LENGTH} caracteres.`,
    };
  }
  return { valid: true };
}

export async function runValidatedQuestionSearch<T>(
  question: string,
  embeddings: EmbeddingProvider,
  search: (vector: readonly number[]) => Promise<T>,
): Promise<ValidatedSearchResult<T>> {
  const validation = validateQuestion(question);
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }

  const vector = await embeddings.embed(question);
  const results = await search(vector);
  return { ok: true, results };
}

