import { expect, test, vi } from 'vitest';
import { createReprocessDocumentHandler } from '../../app/api/documents/[id]/reprocess/reprocess-document-handler';
import type { DocumentStatus, StartReprocessingResult } from '../../src/db/contracts';
import { createDependentQueryCoordinator } from '../../src/rag/answering/dependent-query-cancellation';

const AVAILABLE_ID = '11111111-2222-3333-4444-555555555555';
const FAILED_ID = '22222222-3333-4444-5555-666666666666';
const MISSING_ID = '99999999-8888-7777-6666-555555555555';

test('POST /api/documents/:id/reprocess returns 202 with status processing for available or failed documents and notifies coordinator', async () => {
  const states = new Map<string, DocumentStatus>([
    [AVAILABLE_ID, 'available'],
    [FAILED_ID, 'failed'],
  ]);

  const coordinator = createDependentQueryCoordinator();
  const notifySpy = vi.spyOn(coordinator, 'notifyDocumentReprocessing');
  const startBackgroundProcessing = vi.fn();

  const handler = createReprocessDocumentHandler(
    {
      async startReprocessing(id: string): Promise<StartReprocessingResult> {
        const current = states.get(id);
        if (!current) return 'not_found';
        if (current === 'processing') return 'already_processing';
        states.set(id, 'processing');
        return 'started';
      },
    },
    startBackgroundProcessing,
    coordinator,
  );

  // 1. Available document -> 202 Accepted
  const availRes = await handler(
    new Request(`http://localhost/api/documents/${AVAILABLE_ID}/reprocess`, { method: 'POST' }),
    { params: Promise.resolve({ id: AVAILABLE_ID }) },
  );
  expect(availRes.status).toBe(202);
  expect(await availRes.json()).toEqual({
    document: { id: AVAILABLE_ID, status: 'processing' },
  });
  expect(notifySpy).toHaveBeenCalledWith(AVAILABLE_ID);
  expect(startBackgroundProcessing).toHaveBeenCalledWith(AVAILABLE_ID);

  // 2. Failed document -> 202 Accepted
  const failedRes = await handler(
    new Request(`http://localhost/api/documents/${FAILED_ID}/reprocess`, { method: 'POST' }),
    { params: Promise.resolve({ id: FAILED_ID }) },
  );
  expect(failedRes.status).toBe(202);
  expect(await failedRes.json()).toEqual({
    document: { id: FAILED_ID, status: 'processing' },
  });
  expect(notifySpy).toHaveBeenCalledWith(FAILED_ID);
  expect(startBackgroundProcessing).toHaveBeenCalledWith(FAILED_ID);
});

test('POST /api/documents/:id/reprocess returns 404 when the document does not exist', async () => {
  const startBackgroundProcessing = vi.fn();
  const handler = createReprocessDocumentHandler(
    {
      startReprocessing: async () => 'not_found',
    },
    startBackgroundProcessing,
  );

  const res = await handler(
    new Request(`http://localhost/api/documents/${MISSING_ID}/reprocess`, { method: 'POST' }),
    { params: Promise.resolve({ id: MISSING_ID }) },
  );

  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.error).toContain('no existe');
  expect(startBackgroundProcessing).not.toHaveBeenCalled();
});

test('POST /api/documents/:id/reprocess returns 409 when the document is already processing', async () => {
  const handler = createReprocessDocumentHandler({
    startReprocessing: async () => 'already_processing',
  });

  const res = await handler(
    new Request(`http://localhost/api/documents/${AVAILABLE_ID}/reprocess`, { method: 'POST' }),
    { params: Promise.resolve({ id: AVAILABLE_ID }) },
  );

  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error).toContain('ya se está procesando');
});
