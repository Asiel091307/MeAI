import { expect, test, vi } from 'vitest';
import { createGetDocumentFileHandler } from '../../app/api/documents/[id]/file/file-handler';

const VALID_ID = '11111111-2222-3333-4444-555555555555';
const context = { params: Promise.resolve({ id: VALID_ID }) };
const request = () => new Request(`http://localhost/api/documents/${VALID_ID}/file`);

test('GET /api/documents/:id/file returns the exact bytes with the safe headers', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 0, 255, 10, 13]);
  const getFile = vi.fn(async () => ({ status: 'found' as const, name: 'becas.pdf', bytes }));

  const response = await createGetDocumentFileHandler(getFile)(request(), context);

  expect(getFile).toHaveBeenCalledWith(VALID_ID);
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Content-Disposition')).toBe(
    `inline; filename="becas.pdf"; filename*=UTF-8''becas.pdf`,
  );
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Content-Length')).toBe(String(bytes.length));
});

test('a name with accents and quotes is encoded safely', async () => {
  const handler = createGetDocumentFileHandler(async () => ({
    status: 'found',
    name: 'Guía "becas" 2026.pdf',
    bytes: new Uint8Array([1]),
  }));

  const disposition = (await handler(request(), context)).headers.get('Content-Disposition') ?? '';

  expect(disposition).toContain('filename="Gu_a _becas_ 2026.pdf"');
  expect(disposition).toContain(`filename*=UTF-8''Gu%C3%ADa%20%22becas%22%202026.pdf`);
  expect(disposition).not.toMatch(/[^\x20-\x7e]/);
});

test('returns 404 in Spanish when the document does not exist', async () => {
  const handler = createGetDocumentFileHandler(async () => ({ status: 'not_found' }));

  const response = await handler(request(), context);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'El documento no existe o ya fue eliminado.' });
});

test('returns 500 in Spanish without leaking the internal error', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const handler = createGetDocumentFileHandler(async () => {
    throw new Error('Fallo SQL interno');
  });

  const response = await handler(request(), context);

  expect(response.status).toBe(500);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({
    error: 'No se pudo abrir el archivo del documento. Inténtalo de nuevo.',
  });
  expect(text).not.toContain('Fallo SQL');
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
