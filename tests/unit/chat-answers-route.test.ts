import { expect, test, vi } from 'vitest';
import {
  createPostChatAnswersHandler,
  parseChatAnswerSseEvents,
} from '../../app/api/chat/answers/chat-answers-handler';
import type { DocumentMetadata } from '../../src/db/contracts';
import { createActiveQuestionGuard } from '../../src/rag/answering/active-question-guard';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';
import type { AnswerEvent } from '../../src/rag/providers/generation';
import type { RetrievedChunk } from '../../src/rag/retrieval/contracts';

const availableDocument: DocumentMetadata = {
  id: 'doc-1',
  name: 'manual-academico.pdf',
  status: 'available',
  error: null,
  activeVersionId: 'ver-1',
  createdAt: new Date('2026-11-10T10:00:00Z'),
};

test('POST /api/chat/answers returns 400 when the question is empty or exceeds 1000 characters', async () => {
  const handler = createPostChatAnswersHandler({
    documents: { list: async () => [availableDocument] },
    embeddings: { embed: vi.fn() },
    search: { searchSimilar: vi.fn() },
    generator: { stream: vi.fn() },
    topK: 5,
  });

  const emptyReq = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '   ' }),
  });

  const emptyRes = await handler(emptyReq);
  expect(emptyRes.status).toBe(400);
  const emptyBody = await emptyRes.json();
  expect(emptyBody.error).toContain('vacía');

  const longReq = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'a'.repeat(1001) }),
  });

  const longRes = await handler(longReq);
  expect(longRes.status).toBe(400);
  const longBody = await longRes.json();
  expect(longBody.error).toContain('1000');
});

test('POST /api/chat/answers returns 400 when there are no available documents', async () => {
  const embedSpy = vi.fn();
  const handler = createPostChatAnswersHandler({
    documents: {
      list: async () => [
        { ...availableDocument, status: 'processing', activeVersionId: null },
      ],
    },
    embeddings: { embed: embedSpy },
    search: { searchSimilar: vi.fn() },
    generator: { stream: vi.fn() },
    topK: 5,
  });

  const req = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '¿Cuándo inicia el semestre?' }),
  });

  const res = await handler(req);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('disponible');
  expect(embedSpy).not.toHaveBeenCalled();
});

test('POST /api/chat/answers streams status, progressive text chunks, and final result with resolved citations', async () => {
  const chunks: RetrievedChunk[] = [
    {
      chunkId: 'chunk-p5',
      documentId: 'doc-1',
      page: 5,
      text: 'El semestre inicia el 12 de agosto.',
      score: 0.95,
    },
  ];

  const handler = createPostChatAnswersHandler({
    documents: { list: async () => [availableDocument] },
    embeddings: { embed: async () => [0.1, 0.2, 0.3] },
    search: { searchSimilar: async () => chunks },
    generator: {
      async *stream(): AsyncIterable<AnswerEvent> {
        yield { type: 'text', text: 'El semestre inicia ' };
        yield { type: 'text', text: 'el 12 de agosto.' };
        yield { type: 'final', citations: ['chunk-p5'] };
      },
    },
    topK: 5,
    guard: createActiveQuestionGuard(),
    coordinator: createDependentQueryCoordinator(),
  });

  const req = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '¿Cuándo inicia el semestre?',
      history: [],
    }),
  });

  const res = await handler(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('text/event-stream');

  const rawStream = await res.text();
  const events = parseChatAnswerSseEvents(rawStream);

  expect(events).toEqual([
    {
      type: 'status',
      phase: 'searching',
      message: 'Buscando evidencia en tus documentos disponibles...',
    },
    {
      type: 'status',
      phase: 'generating',
      message: 'Generando respuesta fundamentada...',
    },
    { type: 'text', text: 'El semestre inicia ' },
    { type: 'text', text: 'el 12 de agosto.' },
    {
      type: 'final',
      text: 'El semestre inicia el 12 de agosto.',
      citations: [
        {
          chunkId: 'chunk-p5',
          documentId: 'doc-1',
          documentName: 'manual-academico.pdf',
          page: 5,
          text: 'El semestre inicia el 12 de agosto.',
          available: true,
        },
      ],
    },
  ]);
});

test('POST /api/chat/answers emits a retryable error event and no final event when search or generation fails', async () => {
  const handler = createPostChatAnswersHandler({
    documents: { list: async () => [availableDocument] },
    embeddings: { embed: async () => [0.1, 0.2] },
    search: {
      searchSimilar: async () => [
        {
          chunkId: 'chunk-p5',
          documentId: 'doc-1',
          page: 5,
          text: 'El semestre inicia el 12 de agosto.',
          score: 0.95,
        },
      ],
    },
    generator: {
      async *stream(): AsyncIterable<AnswerEvent> {
        yield { type: 'text', text: 'Texto parcial antes de fallar...' };
        throw new Error('Error de red con proveedor');
      },
    },
    topK: 5,
    guard: createActiveQuestionGuard(),
    coordinator: createDependentQueryCoordinator(),
  });

  const req = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '¿Cuándo inicia el semestre?' }),
  });

  const res = await handler(req);
  expect(res.status).toBe(200);

  const events = parseChatAnswerSseEvents(await res.text());
  expect(events.find((e) => e.type === 'final')).toBeUndefined();

  const errorEvent = events.find((e) => e.type === 'error');
  expect(errorEvent).toEqual({
    type: 'error',
    error: 'No se pudo generar la respuesta en este momento. Inténtalo de nuevo.',
    retryable: true,
    discardPartialText: true,
  });
});

test('POST /api/chat/answers returns 409 when a second question is submitted while another is in progress', async () => {
  const guard = createActiveQuestionGuard();
  guard.beginSearching();

  const handler = createPostChatAnswersHandler({
    documents: { list: async () => [availableDocument] },
    embeddings: { embed: vi.fn() },
    search: { searchSimilar: vi.fn() },
    generator: { stream: vi.fn() },
    topK: 5,
    guard,
  });

  const req = new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Segunda pregunta simultánea' }),
  });

  const res = await handler(req);
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error).toContain('pregunta en curso');
  guard.finish();
});
