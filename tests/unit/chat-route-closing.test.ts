import { expect, test, vi } from 'vitest';
import {
  createPostChatAnswersHandler,
  parseChatAnswerSseEvents,
} from '../../app/api/chat/answers/chat-answers-handler';
import { createDeleteDocumentHandler } from '../../app/api/documents/[id]/delete-document-handler';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import type { DocumentMetadata } from '../../src/db/contracts';
import { createActiveQuestionGuard } from '../../src/rag/answering/active-question-guard';
import {
  type ChatAnswerStreamEvent,
  createDependentQueryCoordinator,
  DELETED_DOCUMENT_CANCELLATION_REASON,
  REPROCESSING_DOCUMENT_CANCELLATION_REASON,
} from '../../src/rag/answering/dependent-query-cancellation';
import type { AnswerEvent } from '../../src/rag/providers/generation';

const DOCUMENT_ID = '11111111-2222-3333-4444-555555555555';

const availableDocument: DocumentMetadata = {
  id: DOCUMENT_ID,
  name: 'manual.pdf',
  status: 'available',
  error: null,
  activeVersionId: 'ver-1',
  createdAt: new Date('2026-11-10T10:00:00Z'),
};

function chatRequest(question: string, history: unknown[] = []): Request {
  return new Request('http://localhost/api/chat/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
  });
}

// RF-3.4 / CL-8: a follow-up with history still needs an available document.
test('a follow-up question with history and no available documents is rejected without embeddings or generation', async () => {
  const embed = vi.fn();
  const stream = vi.fn();
  const handler = createPostChatAnswersHandler({
    documents: {
      list: async () => [
        { ...availableDocument, status: 'failed', activeVersionId: null, error: 'El PDF está dañado.' },
        { ...availableDocument, id: 'other', status: 'processing', activeVersionId: null },
      ],
    },
    embeddings: { embed },
    search: { searchSimilar: vi.fn() },
    generator: { stream },
    topK: 5,
    guard: createActiveQuestionGuard(),
    coordinator: createDependentQueryCoordinator(),
  });

  const response = await handler(
    chatRequest('¿Y qué más dice?', [
      { id: 'u1', role: 'user', content: '¿Cuándo inicia el semestre?' },
      { id: 'a1', role: 'assistant', content: 'En agosto.', citations: [] },
    ]),
  );

  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(/procesarse un documento/);
  expect(embed).not.toHaveBeenCalled();
  expect(stream).not.toHaveBeenCalled();
});

// Reads SSE events as they arrive so the test can act while the answer is still streaming.
async function readEventsUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stop: (events: ChatAnswerStreamEvent[]) => boolean,
): Promise<ChatAnswerStreamEvent[]> {
  const decoder = new TextDecoder();
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) raw += decoder.decode(value, { stream: true });
    const events = parseChatAnswerSseEvents(raw);
    if (done || stop(events)) return events;
  }
}

async function askWhileGeneratorWaits(
  disturb: (coordinator: ReturnType<typeof createDependentQueryCoordinator>) => Promise<void>,
): Promise<ChatAnswerStreamEvent[]> {
  const coordinator = createDependentQueryCoordinator();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached: () => void = () => {};
  const generatorIsWaiting = new Promise<void>((resolve) => {
    reached = resolve;
  });

  const handler = createPostChatAnswersHandler({
    documents: { list: async () => [availableDocument] },
    embeddings: { embed: async () => [0.1, 0.2] },
    search: {
      searchSimilar: async () => [
        { chunkId: 'chunk-1', documentId: DOCUMENT_ID, page: 1, text: 'El semestre inicia en agosto.', score: 0.9 },
      ],
    },
    generator: {
      async *stream(): AsyncIterable<AnswerEvent> {
        yield { type: 'text', text: 'El semestre inicia ' };
        reached();
        await gate;
        yield { type: 'text', text: 'en agosto.' };
        yield { type: 'final', citations: ['chunk-1'] };
      },
    },
    topK: 5,
    guard: createActiveQuestionGuard(),
    coordinator,
  });

  const response = await handler(chatRequest('¿Cuándo inicia el semestre?'));
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();

  await generatorIsWaiting;
  await disturb(coordinator);
  release();

  return readEventsUntil(reader, () => false);
}

function expectDiscardedWithReason(events: ChatAnswerStreamEvent[], reason: string): void {
  const last = events[events.length - 1];
  expect(last).toMatchObject({ type: 'error', discardPartialText: true, error: reason });
  expect(events.some(({ type }) => type === 'final')).toBe(false);
}

// RF-8.3
test('deleting the cited document while the answer streams ends the stream with a discarding error and no final event', async () => {
  const events = await askWhileGeneratorWaits(async (coordinator) => {
    const remove = createDeleteDocumentHandler({ delete: async () => true }, coordinator);
    const deleted = await remove(
      new Request(`http://localhost/api/documents/${DOCUMENT_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: DOCUMENT_ID }) },
    );
    expect(deleted.status).toBe(204);
  });

  expectDiscardedWithReason(events, DELETED_DOCUMENT_CANCELLATION_REASON);
  expect(DELETED_DOCUMENT_CANCELLATION_REASON).toMatch(/se eliminó un documento/);
});

// RF-9.6
test('reprocessing the cited document while the answer streams ends the stream with a discarding error and no final event', async () => {
  const events = await askWhileGeneratorWaits(async (coordinator) => {
    const reprocess = createReprocessDocumentHandler(
      { startReprocessing: async () => 'started' },
      () => {},
      coordinator,
    );
    const accepted = await reprocess(
      new Request(`http://localhost/api/documents/${DOCUMENT_ID}/reprocess`, { method: 'POST' }),
      { params: Promise.resolve({ id: DOCUMENT_ID }) },
    );
    expect(accepted.status).toBe(202);
  });

  expectDiscardedWithReason(events, REPROCESSING_DOCUMENT_CANCELLATION_REASON);
  expect(REPROCESSING_DOCUMENT_CANCELLATION_REASON).toMatch(/comenzó a reprocesarse/);
});
