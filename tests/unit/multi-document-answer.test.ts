import { expect, test } from 'vitest';
import { collectGroundedAnswerFromChunks } from '../../src/rag/answering/grounded-answer';
import type { AnswerEvent, AnswerGenerator } from '../../src/rag/providers/generation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';

test('combines multiple documents in a single answer and maps each statement to its exact document and page', async () => {
  const retrievedChunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-becas-p3',
      documentId: 'doc-becas',
      page: 3,
      text: 'El promedio mínimo requerido para solicitar la beca es 8.5.',
      score: 0.94,
    },
    {
      chunkId: 'chunk-convocatoria-p7',
      documentId: 'doc-convocatoria',
      page: 7,
      text: 'La fecha límite de entrega de documentos es el 30 de octubre.',
      score: 0.91,
    },
    {
      chunkId: 'chunk-reglamento-p12',
      documentId: 'doc-reglamento',
      page: 12,
      text: 'El comité publica los resultados definitivos en noviembre.',
      score: 0.85,
    },
  ];

  const documentNames = new Map<string, string>([
    ['doc-becas', 'reglas-becas.pdf'],
    ['doc-convocatoria', 'convocatoria-2026.pdf'],
    ['doc-reglamento', 'reglamento-general.pdf'],
  ]);

  const fakeGenerator: AnswerGenerator = {
    async *stream(_question, sources): AsyncIterable<AnswerEvent> {
      // Verify all three documents were passed as sources with their own page numbers
      expect(sources).toHaveLength(3);
      yield {
        type: 'text',
        text: 'El promedio mínimo requerido para solicitar la beca es 8.5. [chunk-becas-p3]\n',
      };
      yield {
        type: 'text',
        text: 'La fecha límite de entrega de documentos es el 30 de octubre. [chunk-convocatoria-p7]',
      };
      yield {
        type: 'final',
        citations: ['chunk-becas-p3', 'chunk-convocatoria-p7'],
      };
    },
  };

  const result = await collectGroundedAnswerFromChunks({
    question: '¿Cuál es el promedio mínimo y la fecha límite de entrega?',
    chunks: retrievedChunks,
    generator: fakeGenerator,
    documentNames,
  });

  expect(result.citations).toEqual([
    {
      chunkId: 'chunk-becas-p3',
      documentId: 'doc-becas',
      documentName: 'reglas-becas.pdf',
      page: 3,
      text: 'El promedio mínimo requerido para solicitar la beca es 8.5.',
      available: true,
    },
    {
      chunkId: 'chunk-convocatoria-p7',
      documentId: 'doc-convocatoria',
      documentName: 'convocatoria-2026.pdf',
      page: 7,
      text: 'La fecha límite de entrega de documentos es el 30 de octubre.',
      available: true,
    },
  ]);

  expect(result.statements).toHaveLength(2);
  expect(result.statements[0]).toEqual({
    statement: 'El promedio mínimo requerido para solicitar la beca es 8.5.',
    valid: true,
    citations: [
      {
        chunkId: 'chunk-becas-p3',
        documentId: 'doc-becas',
        documentName: 'reglas-becas.pdf',
        page: 3,
        text: 'El promedio mínimo requerido para solicitar la beca es 8.5.',
        available: true,
      },
    ],
    rejectedCitationIds: [],
  });

  expect(result.statements[1]).toEqual({
    statement: 'La fecha límite de entrega de documentos es el 30 de octubre.',
    valid: true,
    citations: [
      {
        chunkId: 'chunk-convocatoria-p7',
        documentId: 'doc-convocatoria',
        documentName: 'convocatoria-2026.pdf',
        page: 7,
        text: 'La fecha límite de entrega de documentos es el 30 de octubre.',
        available: true,
      },
    ],
    rejectedCitationIds: [],
  });
});
