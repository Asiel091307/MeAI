import { afterEach, expect, test, vi } from 'vitest';
import { createPostDocumentHandler } from '../../app/api/documents/post-document-handler';
import type { Document, DocumentRepository } from '../../src/db/contracts';
import { startDocumentProcessingInBackground } from '../../src/documents/start-document-processing';
import { createBlankPdf, createDamagedPdf } from '../helpers/pdf-fixtures';

function repository(): Pick<DocumentRepository, 'create'> {
  let count = 0;
  return {
    async create(input) {
      count += 1;
      const document: Document = {
        id: `doc-${count}`,
        name: input.name,
        pdfBytes: input.pdfBytes,
        status: input.status ?? 'processing',
        error: input.error ?? null,
        activeVersionId: null,
        createdAt: new Date('2026-11-10T10:00:00.000Z'),
      };
      return document;
    },
  };
}

function upload(name: string, bytes: Uint8Array): Request {
  const formData = new FormData();
  formData.append('file', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), name);
  return new Request('http://localhost:3000/api/documents', { method: 'POST', body: formData });
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('a registered PDF in processing starts its background processing once', async () => {
  const startProcessing = vi.fn();
  const handler = createPostDocumentHandler(repository(), startProcessing);

  const response = await handler(upload('notas.pdf', createBlankPdf(1)));

  expect(response.status).toBe(201);
  expect(startProcessing).toHaveBeenCalledTimes(1);
  expect(startProcessing).toHaveBeenCalledWith('doc-1');
});

test('a PDF registered as failed or a rejected file never starts processing', async () => {
  const startProcessing = vi.fn();
  const handler = createPostDocumentHandler(repository(), startProcessing);

  const damaged = await handler(upload('danado.pdf', createDamagedPdf()));
  const notPdf = await handler(upload('notas.txt', new TextEncoder().encode('hola')));

  expect(damaged.status).toBe(201);
  expect(notPdf.status).toBe(400);
  expect(startProcessing).not.toHaveBeenCalled();
});

test('background processing never rejects: a failure is logged instead', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const run = vi.fn(async () => {
    throw new Error('database down');
  });

  await startDocumentProcessingInBackground('doc-1', run);

  expect(run).toHaveBeenCalledWith('doc-1');
  expect(error).toHaveBeenCalledTimes(1);
});
