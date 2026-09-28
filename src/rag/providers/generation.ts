export interface AnswerSource {
  id: string;
  documentId: string;
  page: number;
  text: string;
}

export type AnswerEvent =
  | { type: 'text'; text: string }
  | { type: 'final'; citations: readonly string[] };

export interface AnswerGenerator {
  stream(question: string, sources: readonly AnswerSource[]): AsyncIterable<AnswerEvent>;
}
