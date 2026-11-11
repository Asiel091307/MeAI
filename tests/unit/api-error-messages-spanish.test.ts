import { describe, expect, test, vi } from 'vitest';
import { createPostChatAnswersHandler } from '../../app/api/chat/answers/chat-answers-handler';
import { createDeleteDocumentHandler } from '../../app/api/documents/[id]/delete-document-handler';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import type { DocumentMetadata } from '../../src/db/contracts';
import {
  CONCURRENT_QUESTION_REASON,
  createActiveQuestionGuard,
} from '../../src/rag/answering/active-question-guard';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';
import { createBlankPdf } from '../helpers/pdf-fixtures';

// RNF-1: every error the API returns is a non-empty message in Spanish. Each case names a
// Spanish phrase that must appear, instead of guessing the language automatically.
const ID = '11111111-2222-3333-4444-555555555555';
const routeContext = { params: Promise.resolve({ id: ID }) };

const availableDocument: DocumentMetadata = {
  id: ID,
  name: 'manual.pdf',
  status: 'available',
  error: null,
  activeVersionId: 'ver-1',
  createdAt: new Date('2026-11-10T10:00:00Z'),
};

async function errorOf(response: Response, status: number): Promise<string> {
  expect(response.status).toBe(status);
  const { error } = await response.json();
  expect(typeof error).toBe('string');
  expect(error.trim().length).toBeGreaterThan(0);
  return error;
}

function upload(bytes: Uint8Array, name = 'documento.pdf'): Request {
  const formData = new FormData();
  formData.append('file', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), name);
  return new Request('http://localhost/api/documents', { method: 'POST', body: formData });
}

describe('POST /api/documents', () => {
  const create = vi.fn();
  const handler = createPostDocumentHandler({ create });

  test('400 without a file', async () => {
    const request = new Request('http://localhost/api/documents', { method: 'POST', body: 'no es un formulario' });
    expect(await errorOf(await handler(request), 400)).toMatch(/No se ha proporcionado ningún archivo/);
  });

  test('400 for a file that is not a PDF', async () => {
    expect(await errorOf(await handler(upload(new TextEncoder().encode('hola'))), 400)).toMatch(
      /no es un PDF\. Solo se admiten/,
    );
  });

  test('400 for a PDF over 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode('%PDF-1.4'));
    expect(await errorOf(await handler(upload(big)), 400)).toMatch(/supera el límite de 10 MB/);
  });

  test('400 for a PDF over 100 pages', async () => {
    expect(await errorOf(await handler(upload(createBlankPdf(101))), 400)).toMatch(
      /tiene 101 páginas y supera el límite/,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/documents/:id', () => {
  test('404 when the document does not exist', async () => {
    const handler = createDeleteDocumentHandler({ delete: async () => false });
    const response = await handler(new Request('http://localhost', { method: 'DELETE' }), routeContext);
    expect(await errorOf(response, 404)).toMatch(/no existe o ya fue eliminado/);
  });

  test('500 when the deletion fails, without exposing the internal error', async () => {
    const handler = createDeleteDocumentHandler({
      delete: async () => {
        throw new Error('connection refused');
      },
    });
    const response = await handler(new Request('http://localhost', { method: 'DELETE' }), routeContext);
    const message = await errorOf(response, 500);
    expect(message).toMatch(/No se pudo eliminar el documento/);
    expect(message).not.toMatch(/connection refused/);
  });
});

describe('POST /api/documents/:id/reprocess', () => {
  test('404 when the document does not exist', async () => {
    const handler = createReprocessDocumentHandler({ startReprocessing: async () => 'not_found' });
    const response = await handler(new Request('http://localhost', { method: 'POST' }), routeContext);
    expect(await errorOf(response, 404)).toMatch(/no existe o ya fue eliminado/);
  });

  test('409 when the document is already being processed', async () => {
    const handler = createReprocessDocumentHandler({ startReprocessing: async () => 'already_processing' });
    const response = await handler(new Request('http://localhost', { method: 'POST' }), routeContext);
    expect(await errorOf(response, 409)).toMatch(/ya se está procesando/);
  });
});

describe('POST /api/chat/answers', () => {
  function chatHandler(overrides: Partial<Parameters<typeof createPostChatAnswersHandler>[0]> = {}) {
    return createPostChatAnswersHandler({
      documents: { list: async () => [availableDocument] },
      embeddings: { embed: async () => [0.1] },
      search: { searchSimilar: async () => [] },
      generator: { stream: vi.fn() },
      topK: 5,
      guard: createActiveQuestionGuard(),
      coordinator: createDependentQueryCoordinator(),
      ...overrides,
    });
  }
  const ask = (body: string) =>
    new Request('http://localhost/api/chat/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

  test('400 for invalid JSON', async () => {
    expect(await errorOf(await chatHandler()(ask('{no es json')), 400)).toMatch(/formato JSON válido/);
  });

  test('400 for an empty question', async () => {
    expect(await errorOf(await chatHandler()(ask(JSON.stringify({ question: '  ' }))), 400)).toMatch(
      /La pregunta no puede estar vacía/,
    );
  });

  test('400 for a question over 1000 characters', async () => {
    const body = JSON.stringify({ question: 'a'.repeat(1001) });
    expect(await errorOf(await chatHandler()(ask(body)), 400)).toMatch(/supera el límite de 1000 caracteres/);
  });

  test('400 when no document is available', async () => {
    const handler = chatHandler({ documents: { list: async () => [] } });
    const response = await handler(ask(JSON.stringify({ question: '¿Hola?' })));
    expect(await errorOf(response, 400)).toMatch(/Primero debe procesarse un documento/);
  });

  test('409 when another question is in progress', async () => {
    const guard = createActiveQuestionGuard();
    guard.beginSearching();
    const response = await chatHandler({ guard })(ask(JSON.stringify({ question: '¿Hola?' })));
    const message = await errorOf(response, 409);
    expect(message).toBe(CONCURRENT_QUESTION_REASON);
    expect(message).toMatch(/Ya hay una pregunta en curso/);
  });

  test('500 when the availability of the documents cannot be checked', async () => {
    const handler = chatHandler({
      documents: {
        list: async () => {
          throw new Error('db down');
        },
      },
    });
    const message = await errorOf(await handler(ask(JSON.stringify({ question: '¿Hola?' }))), 500);
    expect(message).toMatch(/No se pudo comprobar la disponibilidad de tus documentos/);
    expect(message).not.toMatch(/db down/);
  });
});
