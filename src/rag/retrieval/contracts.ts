// Contracts for semantic search (phase 3). Shared by lane A (SQL search) and lane B (answers).

// One chunk found for a question, with everything needed to cite it.
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  page: number;
  text: string;
  // Cosine similarity between the question and the chunk: 1 = same direction, higher = closer.
  score: number;
}

export interface ChunkSearchRepository {
  // Nearest chunks by cosine similarity, best first. Only chunks of the active version of
  // documents whose status is 'available' are searched (T40, RF-3, RF-9).
  searchSimilar(queryVector: readonly number[], topK: number): Promise<RetrievedChunk[]>;
}
