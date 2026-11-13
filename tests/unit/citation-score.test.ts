import { expect, test } from 'vitest';
import { resolveCitations } from '../../src/rag/answering/citation-validation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';
import { toAnswerSource } from '../../src/rag/retrieval/to-answer-source';

// Spec 004, RF-004-6: the similarity found by the search travels with every citation.
const chunk: RetrievedChunk = {
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  page: 3,
  text: 'La solicitud se presenta en septiembre.',
  score: 0.8734,
};

test('toAnswerSource keeps the search score', () => {
  expect(toAnswerSource(chunk)).toEqual({
    id: 'chunk-1',
    documentId: 'doc-1',
    page: 3,
    text: 'La solicitud se presenta en septiembre.',
    score: 0.8734,
  });
});

test('resolveCitations keeps the score of each cited source and still drops invented ids', () => {
  const sources = [toAnswerSource(chunk), toAnswerSource({ ...chunk, chunkId: 'chunk-2', page: 4, score: 0.61 })];

  const citations = resolveCitations(['chunk-2', 'invented', 'chunk-1'], sources, new Map([['doc-1', 'becas.pdf']]));

  expect(citations.map(({ chunkId, page, score }) => ({ chunkId, page, score }))).toEqual([
    { chunkId: 'chunk-2', page: 4, score: 0.61 },
    { chunkId: 'chunk-1', page: 3, score: 0.8734 },
  ]);
  expect(citations.every(({ documentName }) => documentName === 'becas.pdf')).toBe(true);
});
