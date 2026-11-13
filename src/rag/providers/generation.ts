export interface AnswerSource {
  id: string;
  documentId: string;
  page: number;
  text: string;
  // Cosine similarity of this chunk to the question, from the search (spec 004).
  score: number;
}

export type AnswerEvent =
  | { type: 'text'; text: string }
  | { type: 'final'; citations: readonly string[] };

export interface AnswerGenerator {
  stream(question: string, sources: readonly AnswerSource[]): AsyncIterable<AnswerEvent>;
}
