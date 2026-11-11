import { expect, test, vi } from 'vitest';
import {
  type ChatTurn,
  contextualizeFollowUpQuestion,
  invalidateDeletedDocumentCitations,
} from '../../src/rag/answering/conversation-context';
import {
  createDependentQueryCoordinator,
  DELETED_DOCUMENT_CANCELLATION_REASON,
  REPROCESSING_DOCUMENT_CANCELLATION_REASON,
  streamCancellableAnswer,
} from '../../src/rag/answering/dependent-query-cancellation';
import type { AnswerEvent, AnswerGenerator } from '../../src/rag/providers/generation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';

test('T57: preserves previous visible messages when a document is deleted, marks its citations unavailable, and excludes its content from follow-up context', () => {
  const history: ChatTurn[] = [
    {
      id: 'turn-1',
      role: 'user',
      content: '¿Qué dice el reglamento eliminado sobre las faltas?',
    },
    {
      id: 'turn-2',
      role: 'assistant',
      content: 'Con tres faltas se pierde el derecho a examen.',
      citations: [
        {
          chunkId: 'chunk-del-1',
          documentId: 'doc-eliminado',
          documentName: 'reglamento-viejo.pdf',
          page: 5,
          text: 'Con tres faltas se pierde el derecho a examen.',
          available: true,
        },
      ],
    },
    {
      id: 'turn-3',
      role: 'user',
      content: '¿Y qué dice el calendario vigente sobre las vacaciones?',
    },
    {
      id: 'turn-4',
      role: 'assistant',
      content: 'Las vacaciones inician el 20 de diciembre.',
      citations: [
        {
          chunkId: 'chunk-act-1',
          documentId: 'doc-vigente',
          documentName: 'calendario.pdf',
          page: 1,
          text: 'Las vacaciones inician el 20 de diciembre.',
          available: true,
        },
      ],
    },
  ];

  const updatedHistory = invalidateDeletedDocumentCitations(history, 'doc-eliminado');

  // Previous messages remain visible in the session
  expect(updatedHistory).toHaveLength(4);
  expect(updatedHistory[1].content).toBe('Con tres faltas se pierde el derecho a examen.');

  // Citations of the deleted document are marked as unavailable
  expect(updatedHistory[1].citations?.[0].available).toBe(false);

  // Citations of other documents remain available
  expect(updatedHistory[3].citations?.[0].available).toBe(true);

  // Follow-up contextualization ignores turns backed only by the deleted document
  const contextualized = contextualizeFollowUpQuestion(
    '¿Cuándo terminan?',
    updatedHistory,
    new Set(['doc-eliminado']),
  );

  expect(contextualized.searchQuery).not.toContain('reglamento eliminado');
  expect(contextualized.searchQuery).toContain('vacaciones');
});

test('T58: cancels an in-progress generation when its source document is deleted, discards partial text, and avoids emitting a final answer', async () => {
  const coordinator = createDependentQueryCoordinator();

  const chunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-1',
      documentId: 'doc-borrado',
      page: 2,
      text: 'Texto del documento que será eliminado.',
      score: 0.91,
    },
  ];

  const generator: AnswerGenerator = {
    async *stream(): AsyncIterable<AnswerEvent> {
      yield { type: 'text', text: 'Texto provisional parcial antes de borrar...' };
      // While generating, the user deletes doc-borrado
      coordinator.notifyDocumentDeleted('doc-borrado');
      yield { type: 'text', text: 'Continuación que no debe publicarse.' };
      yield { type: 'final', citations: ['chunk-1'] };
    },
  };

  const events = [];
  for await (const event of streamCancellableAnswer({
    question: '¿Qué dice el documento?',
    coordinator,
    search: async () => ({ ok: true, chunks }),
    generator,
  })) {
    events.push(event);
  }

  // Must not emit a final answer event
  expect(events.find((e) => e.type === 'final')).toBeUndefined();

  // Must emit an error/cancellation event instructing the client to discard partial text
  const errorEvent = events.find((e) => e.type === 'error');
  expect(errorEvent).toEqual({
    type: 'error',
    error: DELETED_DOCUMENT_CANCELLATION_REASON,
    retryable: true,
    discardPartialText: true,
  });
});

test('T58: cancels an in-progress search when a document is deleted before generation begins', async () => {
  const coordinator = createDependentQueryCoordinator();
  const generatorStream = vi.fn();

  const events = [];
  for await (const event of streamCancellableAnswer({
    question: '¿Qué dice el documento?',
    coordinator,
    search: async () => {
      coordinator.notifyDocumentDeleted('doc-borrado');
      return {
        ok: true,
        chunks: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-borrado',
            page: 1,
            text: 'Contenido borrado',
            score: 0.9,
          },
        ],
      };
    },
    generator: { stream: generatorStream },
  })) {
    events.push(event);
  }

  expect(generatorStream).not.toHaveBeenCalled();
  expect(events.find((e) => e.type === 'final')).toBeUndefined();
  expect(events.at(-1)).toEqual({
    type: 'error',
    error: DELETED_DOCUMENT_CANCELLATION_REASON,
    retryable: true,
    discardPartialText: true,
  });
});

test('T64: cancels an in-progress answer when a dependent document starts reprocessing, discards partial text, and does not publish answer from old version', async () => {
  const coordinator = createDependentQueryCoordinator();

  const chunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-v1',
      documentId: 'doc-reproc',
      page: 1,
      text: 'Texto de la versión anterior v1.',
      score: 0.95,
    },
  ];

  const generator: AnswerGenerator = {
    async *stream(): AsyncIterable<AnswerEvent> {
      yield { type: 'text', text: 'Según la versión anterior, el dato es X...' };
      // Reprocessing starts while the answer is being generated
      coordinator.notifyDocumentReprocessing('doc-reproc');
      yield { type: 'final', citations: ['chunk-v1'] };
    },
  };

  const events = [];
  for await (const event of streamCancellableAnswer({
    question: '¿Cuál es el dato?',
    coordinator,
    search: async () => ({ ok: true, chunks }),
    generator,
  })) {
    events.push(event);
  }

  // Must not publish a final answer based on the previous version
  expect(events.find((e) => e.type === 'final')).toBeUndefined();

  // Must emit an error instructing to discard partial text and informing the user in Spanish
  expect(events.at(-1)).toEqual({
    type: 'error',
    error: REPROCESSING_DOCUMENT_CANCELLATION_REASON,
    retryable: true,
    discardPartialText: true,
  });
});
