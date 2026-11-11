import { expect, test, vi } from 'vitest';
import { createDeleteDocumentHandler } from '../../app/api/documents/[id]/delete-document-handler';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';

const VALID_ID = '11111111-2222-3333-4444-555555555555';

test('DELETE /api/documents/:id returns 204 and notifies query coordinator when deletion succeeds', async () => {
  const coordinator = createDependentQueryCoordinator();
  const notifySpy = vi.spyOn(coordinator, 'notifyDocumentDeleted');

  const handler = createDeleteDocumentHandler(
    { delete: async () => true },
    coordinator,
  );

  const response = await handler(
    new Request(`http://localhost/api/documents/${VALID_ID}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: VALID_ID }) },
  );

  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(notifySpy).toHaveBeenCalledWith(VALID_ID);
});

test('DELETE /api/documents/:id returns 404 when the document does not exist or id is malformed', async () => {
  const handler = createDeleteDocumentHandler({ delete: async () => false });

  const notFoundRes = await handler(
    new Request(`http://localhost/api/documents/${VALID_ID}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: VALID_ID }) },
  );

  expect(notFoundRes.status).toBe(404);
  const notFoundBody = await notFoundRes.json();
  expect(notFoundBody.error).toContain('no existe');

  const malformedRes = await handler(
    new Request('http://localhost/api/documents/no-es-uuid', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'no-es-uuid' }) },
  );

  expect(malformedRes.status).toBe(404);
});

test('DELETE /api/documents/:id returns 500 with Spanish message and does not report success when deletion fails', async () => {
  const coordinator = createDependentQueryCoordinator();
  const notifySpy = vi.spyOn(coordinator, 'notifyDocumentDeleted');

  const handler = createDeleteDocumentHandler(
    {
      delete: async () => {
        throw new Error('Fallo de conexión SQL');
      },
    },
    coordinator,
  );

  const response = await handler(
    new Request(`http://localhost/api/documents/${VALID_ID}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: VALID_ID }) },
  );

  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body.error).toContain('No se pudo eliminar el documento');
  expect(notifySpy).not.toHaveBeenCalled();
});
