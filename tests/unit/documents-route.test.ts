import { readFile } from 'node:fs/promises';
import { afterEach, expect, test } from 'vitest';
import {
  createGetDocumentsHandler,
  EMPTY_DOCUMENTS_MESSAGE,
  setDocumentListRepositoryForTesting,
} from '../../app/api/documents/list-documents-handler';
import { dynamic, GET } from '../../app/api/documents/route';
import type { DocumentMetadata } from '../../src/db/contracts';

afterEach(() => {
  setDocumentListRepositoryForTesting(null);
});

test('GET /api/documents is force-dynamic so document status is never cached', () => {
  expect(dynamic).toBe('force-dynamic');
});

test('GET /api/documents returns 200 with an empty list and a Spanish prompt to upload the first PDF', async () => {
  setDocumentListRepositoryForTesting({
    async list() {
      return [];
    },
  });

  const response = await GET();
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(body).toEqual({
    documents: [],
    message: EMPTY_DOCUMENTS_MESSAGE,
  });
  expect(body.message).toContain('PDF');
});

test('GET /api/documents returns documents with current status and error without exposing PDF binaries', async () => {
  const stored: DocumentMetadata[] = [
    {
      id: 'doc-1',
      name: 'manual.pdf',
      status: 'processing',
      error: null,
      activeVersionId: null,
      createdAt: new Date('2026-11-08T10:00:00.000Z'),
    },
    {
      id: 'doc-2',
      name: 'protegido.pdf',
      status: 'failed',
      error: 'El PDF está protegido y no se pudieron contar sus páginas.',
      activeVersionId: null,
      createdAt: new Date('2026-11-08T10:05:00.000Z'),
    },
  ];

  const handler = createGetDocumentsHandler({
    async list() {
      return stored.map((doc) => ({
        ...doc,
        // Even if an upstream object carried binary properties, the route must strip them.
        pdfBytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
        pdf_bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]),
      })) as unknown as DocumentMetadata[];
    },
  });

  const firstResponse = await handler();
  const firstBody = await firstResponse.json();

  expect(firstResponse.status).toBe(200);
  expect(firstBody).toEqual({
    documents: [
      {
        id: 'doc-1',
        name: 'manual.pdf',
        status: 'processing',
        error: null,
        activeVersionId: null,
        createdAt: '2026-11-08T10:00:00.000Z',
      },
      {
        id: 'doc-2',
        name: 'protegido.pdf',
        status: 'failed',
        error: 'El PDF está protegido y no se pudieron contar sus páginas.',
        activeVersionId: null,
        createdAt: '2026-11-08T10:05:00.000Z',
      },
    ],
    message: null,
  });

  for (const item of firstBody.documents) {
    expect(item).not.toHaveProperty('pdfBytes');
    expect(item).not.toHaveProperty('pdf_bytes');
  }

  // Simulate state transition processing -> available and verify updated status is returned.
  stored[0] = {
    ...stored[0],
    status: 'available',
    activeVersionId: 'ver-1',
  };

  const secondResponse = await handler();
  const secondBody = await secondResponse.json();

  expect(secondResponse.status).toBe(200);
  expect(secondBody.documents[0]).toEqual({
    id: 'doc-1',
    name: 'manual.pdf',
    status: 'available',
    error: null,
    activeVersionId: 'ver-1',
    createdAt: '2026-11-08T10:00:00.000Z',
  });
});

test('GET /api/documents route files do not contain direct SQL queries', async () => {
  for (const file of ['route.ts', 'list-documents-handler.ts']) {
    const source = await readFile(
      new URL(`../../app/api/documents/${file}`, import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  }
});

