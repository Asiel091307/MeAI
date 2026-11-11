import { afterEach, expect, test, vi } from 'vitest';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import { createGetDocumentsHandler } from '../../app/api/documents/list-documents-handler';

// RNF-1: when the database fails, the user still gets a Spanish message, never an empty 500
// and never the internal error text.
afterEach(() => {
  vi.restoreAllMocks();
});

const internal = new Error('connect ECONNREFUSED postgres://meai:secret@db:5432/meai');

test('listing documents with the database down answers 500 with a Spanish message', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const handler = createGetDocumentsHandler({ list: async () => { throw internal; } });

  const response = await handler();
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(body.error).toBe('No se pudieron cargar tus documentos. Inténtalo de nuevo.');
  expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
});

test('reprocessing with the database down answers 500 with a Spanish message', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const startProcessing = vi.fn();
  const handler = createReprocessDocumentHandler(
    { startReprocessing: async () => { throw internal; } },
    startProcessing,
  );

  const response = await handler(new Request('http://localhost'), {
    params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }),
  });
  const body = await response.json();

  expect(response.status).toBe(500);
  expect(body.error).toBe('No se pudo iniciar el reprocesamiento del documento. Inténtalo de nuevo.');
  expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  expect(startProcessing).not.toHaveBeenCalled();
});
