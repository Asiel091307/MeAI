export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}
