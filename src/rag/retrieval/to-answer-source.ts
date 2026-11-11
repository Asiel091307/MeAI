import type { AnswerSource } from '../providers/generation';
import type { RetrievedChunk } from './contracts';

// The generator cites sources by id, so the chunk id is the source id.
export function toAnswerSource(chunk: RetrievedChunk): AnswerSource {
  return {
    id: chunk.chunkId,
    documentId: chunk.documentId,
    page: chunk.page,
    text: chunk.text,
  };
}
