import type { DocumentRepository } from '../../db/contracts';
import { validateAvailableDocuments } from '../answering/available-documents-guard';
import { validateQuestion } from '../answering/question-validation';
import type { EmbeddingProvider } from '../providers/embeddings';
import type { ChunkSearchRepository, RetrievedChunk } from './contracts';

export const SEARCH_FAILED_REASON =
  'No se pudo completar la búsqueda en tus documentos. Inténtalo de nuevo.';

export type SearchQuestionResult =
  | { ok: true; chunks: RetrievedChunk[] }
  | { ok: false; reason: string; retryable: boolean };

export interface SearchQuestionDeps {
  documents: Pick<DocumentRepository, 'list'>;
  embeddings: EmbeddingProvider;
  search: ChunkSearchRepository;
  topK: number;
}

// Steps 1-3 of "ask and answer": validate, embed the question, find the nearest chunks.
// On failure the caller must not generate an answer; retryable tells the UI whether the
// same question can simply be sent again.
export async function searchQuestion(
  question: string,
  deps: SearchQuestionDeps,
): Promise<SearchQuestionResult> {
  const questionValidation = validateQuestion(question);
  if (!questionValidation.valid) {
    return { ok: false, reason: questionValidation.reason, retryable: false };
  }

  const availability = validateAvailableDocuments(await deps.documents.list());
  if (!availability.valid) {
    return { ok: false, reason: availability.reason, retryable: false };
  }

  try {
    const vector = await deps.embeddings.embed(question);
    const chunks = await deps.search.searchSimilar(vector, deps.topK);
    return { ok: true, chunks };
  } catch {
    // Internal error text is never shown to the user.
    return { ok: false, reason: SEARCH_FAILED_REASON, retryable: true };
  }
}
