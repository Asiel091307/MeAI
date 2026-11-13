import { expect, test } from 'vitest';
import {
  resolveCitations,
  validateStatementCitations,
} from '../../src/rag/answering/citation-validation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';
import { toAnswerSource } from '../../src/rag/retrieval/to-answer-source';

const retrievedChunks: RetrievedChunk[] = [
  {
    chunkId: 'chunk-a1',
    documentId: 'doc-reglamento',
    page: 4,
    text: 'Las inscripciones abren el 15 de agosto.',
    score: 0.92,
  },
  {
    chunkId: 'chunk-b2',
    documentId: 'doc-calendario',
    page: 2,
    text: 'El examen final se realiza el 10 de diciembre.',
    score: 0.87,
  },
];

const sources = retrievedChunks.map(toAnswerSource);

test('resolveCitations accepts real retrieved chunk IDs and rejects invented IDs', () => {
  const resolved = resolveCitations(
    ['chunk-a1', 'chunk-inventado-99', 'chunk-b2', 'chunk-a1'],
    sources,
  );

  expect(resolved).toEqual([
    {
      chunkId: 'chunk-a1',
      documentId: 'doc-reglamento',
      page: 4,
      text: 'Las inscripciones abren el 15 de agosto.',
      score: 0.92,
      available: true,
    },
    {
      chunkId: 'chunk-b2',
      documentId: 'doc-calendario',
      page: 2,
      text: 'El examen final se realiza el 10 de diciembre.',
      score: 0.87,
      available: true,
    },
  ]);
});

test('validateStatementCitations validates citations per statement against retrieved sources and rejects fabricated citations', () => {
  const result = validateStatementCitations(
    [
      {
        statement: 'Las inscripciones abren el 15 de agosto.',
        citationIds: ['chunk-a1', 'chunk-falso'],
      },
      {
        statement: 'Afirmación con cita totalmente inventada.',
        citationIds: ['chunk-inexistente'],
      },
    ],
    sources,
  );

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({
    statement: 'Las inscripciones abren el 15 de agosto.',
    valid: true,
    citations: [
      {
        chunkId: 'chunk-a1',
        documentId: 'doc-reglamento',
        page: 4,
        text: 'Las inscripciones abren el 15 de agosto.',
        score: 0.92,
        available: true,
      },
    ],
    rejectedCitationIds: ['chunk-falso'],
  });

  expect(result[1]).toEqual({
    statement: 'Afirmación con cita totalmente inventada.',
    valid: false,
    citations: [],
    rejectedCitationIds: ['chunk-inexistente'],
  });
});
