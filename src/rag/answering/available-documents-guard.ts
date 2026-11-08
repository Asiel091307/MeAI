import type { DocumentMetadata, DocumentRepository } from '../../db/contracts';
import type { EmbeddingProvider } from '../providers/embeddings';
import {
  type ValidatedSearchResult,
  validateQuestion,
} from './question-validation';

export const NO_AVAILABLE_DOCUMENTS_REASON =
  'No hay documentos disponibles para consultar. Primero debe procesarse un documento.';

export type AvailableDocumentsValidation = { valid: true } | { valid: false; reason: string };

export function validateAvailableDocuments(
  documents: readonly Pick<DocumentMetadata, 'status'>[],
): AvailableDocumentsValidation {
  const hasAvailable = documents.some((document) => document.status === 'available');
  if (!hasAvailable) {
    return {
      valid: false,
      reason: NO_AVAILABLE_DOCUMENTS_REASON,
    };
  }
  return { valid: true };
}

export async function runSearchWhenDocumentsAvailable<T>(
  question: string,
  documents: Pick<DocumentRepository, 'list'>,
  embeddings: EmbeddingProvider,
  search: (vector: readonly number[]) => Promise<T>,
): Promise<ValidatedSearchResult<T>> {
  const questionValidation = validateQuestion(question);
  if (!questionValidation.valid) {
    return { ok: false, reason: questionValidation.reason };
  }

  const storedDocuments = await documents.list();
  const availability = validateAvailableDocuments(storedDocuments);
  if (!availability.valid) {
    return { ok: false, reason: availability.reason };
  }

  const vector = await embeddings.embed(question);
  const results = await search(vector);
  return { ok: true, results };
}

