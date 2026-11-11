import { describe, expect, it } from 'vitest';
import { toAnswerSource } from '../../src/rag/retrieval/to-answer-source';

describe('toAnswerSource', () => {
  it('uses the chunk id as source id and keeps document, page and text', () => {
    expect(
      toAnswerSource({ chunkId: 'c1', documentId: 'd1', page: 4, text: 'Hola', score: 0.8 }),
    ).toEqual({ id: 'c1', documentId: 'd1', page: 4, text: 'Hola' });
  });
});
