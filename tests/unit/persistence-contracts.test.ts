import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import ts from 'typescript';
import type {
  Chunk,
  ChunkRepository,
  Document,
  DocumentRepository,
  DocumentVersion,
  DocumentVersionRepository,
} from '../../src/db/contracts';

test('a document use case can depend on persistence types without React or HTTP', async () => {
  const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
  const document: Document = {
    id: 'document-1',
    name: 'notas.pdf',
    pdfBytes: bytes,
    status: 'processing',
    error: null,
    activeVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const version: DocumentVersion = {
    id: 'version-1',
    documentId: document.id,
    status: 'processing',
    createdAt: document.createdAt,
  };
  const chunk: Chunk = {
    id: 'chunk-1', documentId: document.id, versionId: version.id,
    page: 1, position: 1, text: 'Texto del documento',
  };

  const documents: DocumentRepository = {
    create: async ({ name, pdfBytes }) => ({ ...document, name, pdfBytes }),
    findById: async (id) => id === document.id ? document : null,
    list: async () => [{
      id: document.id, name: document.name, status: document.status,
      error: document.error, activeVersionId: document.activeVersionId,
      createdAt: document.createdAt,
    }],
    delete: async () => {},
  };
  const versions: DocumentVersionRepository = {
    create: async () => version,
    setActive: async () => {},
  };
  const chunks: ChunkRepository = {
    save: async () => {},
    findByVersion: async () => [chunk],
  };

  const created = await documents.create({ name: 'notas.pdf', pdfBytes: bytes });
  expect(created.pdfBytes).toEqual(bytes);
  expect(await documents.findById(document.id)).toEqual(document);
  expect(await documents.list()).toEqual([expect.not.objectContaining({ pdfBytes: bytes })]);
  expect((await versions.create(document.id)).documentId).toBe(document.id);
  expect((await chunks.findByVersion(version.id))[0]).toMatchObject({
    documentId: document.id, versionId: version.id, page: 1,
  });
});

test('persistence contracts have no runtime imports from the UI or HTTP layer', async () => {
  const source = await readFile(new URL('../../src/db/contracts.ts', import.meta.url), 'utf8');
  const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
  expect(imports).toEqual([]);
});
