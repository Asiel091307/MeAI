import { expect, test } from 'vitest';
import { getDocumentFile } from '../../src/documents/get-document-file';
import type { Document } from '../../src/db/contracts';

const documentId = '3f2b8c1e-9a4d-4e7b-8f1a-2c5d6e7f8a9b';
const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

function storedDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: documentId,
    name: 'Informe anual.pdf',
    pdfBytes,
    status: 'available',
    error: null,
    activeVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function fakeRepository(behaviour: () => Promise<Document | null>) {
  const calls: string[] = [];
  return {
    calls,
    async findById(id: string): Promise<Document | null> {
      calls.push(id);
      return behaviour();
    },
  };
}

test('an existing document returns its name and the exact stored bytes', async () => {
  const documents = fakeRepository(async () => storedDocument());

  const result = await getDocumentFile(documentId, documents);

  expect(result).toEqual({ status: 'found', name: 'Informe anual.pdf', bytes: pdfBytes });
  expect(documents.calls).toEqual([documentId]);
});

test('a failed document is still served, because seeing the file does not make it queryable', async () => {
  const documents = fakeRepository(async () =>
    storedDocument({ status: 'failed', error: 'No se pudo extraer texto.' }),
  );

  const result = await getDocumentFile(documentId, documents);

  expect(result).toEqual({ status: 'found', name: 'Informe anual.pdf', bytes: pdfBytes });
});

test('a document that does not exist is not found', async () => {
  const documents = fakeRepository(async () => null);

  const result = await getDocumentFile(documentId, documents);

  expect(result).toEqual({ status: 'not_found' });
  expect(documents.calls).toEqual([documentId]);
});

test('a document id that is not a UUID is not found and never reaches the repository', async () => {
  const documents = fakeRepository(async () => storedDocument());

  const result = await getDocumentFile('no-es-un-uuid', documents);

  expect(result).toEqual({ status: 'not_found' });
  expect(documents.calls).toEqual([]);
});

test('a repository failure propagates so the route can answer with a Spanish 500', async () => {
  const documents = fakeRepository(async () => {
    throw new Error('connection terminated unexpectedly');
  });

  await expect(getDocumentFile(documentId, documents)).rejects.toThrow(
    'connection terminated unexpectedly',
  );
});
