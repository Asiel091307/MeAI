// Turns a user question into a vector for semantic search.
export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}

// Turns document chunks into vectors for indexing. Kept separate from questions because
// some models (like Gemini) embed documents and questions with different task types.
export interface DocumentEmbeddingProvider {
  embedDocuments(texts: readonly string[]): Promise<ReadonlyArray<readonly number[]>>;
}
