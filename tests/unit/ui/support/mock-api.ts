import { vi } from 'vitest';
import type { PublicDocumentItem } from '../../../../app/api/documents/public-document';

// A fake of the MeAI HTTP API for UI tests: routes by method and URL, records every call.
export interface MockApiOptions {
  documents?: PublicDocumentItem[];
  chatEvents?: unknown[];
  uploadResult?: (file: File) => { status: number; body: unknown };
}

export function documentItem(overrides: Partial<PublicDocumentItem> = {}): PublicDocumentItem {
  return {
    id: 'doc-1',
    name: 'becas.pdf',
    status: 'available',
    error: null,
    activeVersionId: 'ver-1',
    createdAt: '2025-03-14T10:00:00.000Z',
    ...overrides,
  };
}

export function sse(events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

export function mockApi(options: MockApiOptions = {}) {
  let documents = [...(options.documents ?? [])];
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];

  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body });

    if (url === '/api/documents' && method === 'GET') {
      return Response.json({ documents, message: null });
    }
    if (url === '/api/documents' && method === 'POST') {
      const file = (init?.body as FormData).get('file') as File;
      const result = options.uploadResult?.(file) ?? {
        status: 201,
        body: { document: documentItem({ id: `doc-${file.name}`, name: file.name, status: 'processing', activeVersionId: null }) },
      };
      return Response.json(result.body, { status: result.status });
    }
    const deleteMatch = /^\/api\/documents\/([^/]+)$/.exec(url);
    if (deleteMatch && method === 'DELETE') {
      documents = documents.filter((doc) => doc.id !== deleteMatch[1]);
      return new Response(null, { status: 204 });
    }
    if (/\/reprocess$/.test(url) && method === 'POST') {
      return Response.json({ document: { status: 'processing' } }, { status: 202 });
    }
    if (url === '/api/chat/answers') {
      return new Response(sse(options.chatEvents ?? []), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return Response.json({ error: 'not mocked' }, { status: 500 });
  });

  return { fetchFn, calls };
}

export function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

export const twoSourceAnswer = [
  { type: 'status', phase: 'searching', message: 'Buscando evidencia…' },
  { type: 'text', text: 'La solicitud se presenta en septiembre.' },
  {
    type: 'final',
    text: 'La solicitud se presenta en septiembre.',
    citations: [
      { chunkId: 'c-1', documentId: 'doc-1', documentName: 'becas.pdf', page: 3, text: 'Del 1 al 30 de septiembre.', score: 0.8734, available: true },
      { chunkId: 'c-2', documentId: 'doc-2', documentName: 'reglas.pdf', page: 7, text: 'Promedio mínimo de 8.5.', score: 0.61, available: true },
    ],
  },
];
