import { beforeEach, expect, test, vi } from 'vitest';
import type { Document, NewChunk } from '../../src/db/contracts';
import { processDocument, type ProcessDocumentDeps } from '../../src/documents/process-document';
import { extractPdfPageTexts } from '../../src/rag/ingestion/pdf-page-texts';
import { PdfDamagedError } from '../../src/rag/ingestion/pdf-page-count';

vi.mock('../../src/rag/ingestion/pdf-page-texts', () => ({ extractPdfPageTexts: vi.fn() }));

const extract = vi.mocked(extractPdfPageTexts);

const document: Document = {
  id: 'doc-1',
  name: 'notas.pdf',
  pdfBytes: Uint8Array.from([1, 2, 3]),
  status: 'processing',
  error: null,
  activeVersionId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function createDeps(overrides: Partial<ProcessDocumentDeps> = {}) {
  const calls = {
    saved: [] as { documentId: string; versionId: string; chunks: readonly NewChunk[] }[],
    published: [] as [string, string][],
    failed: [] as [string, string, string][],
    embedded: [] as (readonly string[])[],
  };
  const deps: ProcessDocumentDeps = {
    documents: { findById: async (id) => (id === document.id ? document : null) },
    versions: {
      create: async (documentId) => ({
        id: 'version-1',
        documentId,
        status: 'processing',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    },
    chunks: {
      save: async (documentId, versionId, chunks) => {
        calls.saved.push({ documentId, versionId, chunks });
      },
    },
    publication: {
      publish: async (documentId, versionId) => {
        calls.published.push([documentId, versionId]);
      },
      fail: async (documentId, versionId, reason) => {
        calls.failed.push([documentId, versionId, reason]);
      },
    },
    embeddings: {
      embedDocuments: async (texts) => {
        calls.embedded.push(texts);
        return texts.map((_, index) => [index, 0.5]);
      },
    },
    config: { chunkSize: 1000, chunkOverlap: 200, retrievalTopK: 5 },
    ...overrides,
  };
  return { deps, calls };
}

beforeEach(() => {
  extract.mockReset();
});

test('a readable document is chunked, embedded, saved and published once', async () => {
  extract.mockResolvedValue([
    { page: 1, text: 'Primera pagina' },
    { page: 2, text: 'Segunda pagina' },
  ]);
  const { deps, calls } = createDeps();

  const result = await processDocument('doc-1', deps);

  expect(result).toEqual({ status: 'available' });
  expect(calls.saved).toEqual([
    {
      documentId: 'doc-1',
      versionId: 'version-1',
      chunks: [
        { page: 1, position: 1, text: 'Primera pagina', embedding: [0, 0.5] },
        { page: 2, position: 1, text: 'Segunda pagina', embedding: [1, 0.5] },
      ],
    },
  ]);
  expect(calls.published).toEqual([['doc-1', 'version-1']]);
  expect(calls.failed).toEqual([]);
});

test('chunk size and overlap come from the config', async () => {
  extract.mockResolvedValue([{ page: 1, text: 'abcdefghij' }]);
  const { deps, calls } = createDeps({ config: { chunkSize: 4, chunkOverlap: 1, retrievalTopK: 5 } });

  await processDocument('doc-1', deps);

  expect(calls.embedded[0]).toEqual(['abcd', 'defg', 'ghij']);
  expect(calls.saved[0].chunks.map((chunk) => chunk.text)).toEqual(['abcd', 'defg', 'ghij']);
});

test('unreadable pages fail the version with the page reason and publish nothing', async () => {
  extract.mockResolvedValue([
    { page: 1, text: 'Texto legible' },
    { page: 2, text: '' },
  ]);
  const { deps, calls } = createDeps();

  const result = await processDocument('doc-1', deps);

  expect(result).toEqual({ status: 'failed', reason: 'No se pudo leer texto en la página 2.' });
  expect(calls.failed).toEqual([['doc-1', 'version-1', 'No se pudo leer texto en la página 2.']]);
  expect(calls.published).toEqual([]);
  expect(calls.saved).toEqual([]);
});

test('an embeddings error fails the version with an understandable reason', async () => {
  extract.mockResolvedValue([{ page: 1, text: 'Texto legible' }]);
  const { deps, calls } = createDeps({
    embeddings: {
      embedDocuments: async () => {
        throw new Error('429 quota exceeded, key=secret-key');
      },
    },
  });

  const result = await processDocument('doc-1', deps);

  const reason = 'No se pudieron generar los embeddings del documento. Inténtalo de nuevo más tarde.';
  expect(result).toEqual({ status: 'failed', reason });
  expect(calls.failed).toEqual([['doc-1', 'version-1', reason]]);
  expect(JSON.stringify(calls.failed)).not.toContain('secret-key');
  expect(calls.published).toEqual([]);
  expect(calls.saved).toEqual([]);
});

test('a wrong number of vectors fails the version', async () => {
  extract.mockResolvedValue([
    { page: 1, text: 'Uno' },
    { page: 2, text: 'Dos' },
  ]);
  const { deps, calls } = createDeps({
    embeddings: { embedDocuments: async () => [[0.1]] },
  });

  const result = await processDocument('doc-1', deps);

  expect(result).toMatchObject({ status: 'failed' });
  expect(calls.failed).toHaveLength(1);
  expect(calls.published).toEqual([]);
  expect(calls.saved).toEqual([]);
});

test('a damaged PDF fails the version with its own message', async () => {
  extract.mockRejectedValue(new PdfDamagedError());
  const { deps, calls } = createDeps();

  const result = await processDocument('doc-1', deps);

  const reason = new PdfDamagedError().message;
  expect(result).toEqual({ status: 'failed', reason });
  expect(calls.failed).toEqual([['doc-1', 'version-1', reason]]);
  expect(calls.published).toEqual([]);
});

test('an unexpected error uses a generic reason without internal details', async () => {
  extract.mockRejectedValue(new Error('connection string postgres://user:pw@host'));
  const { deps, calls } = createDeps();

  const result = await processDocument('doc-1', deps);

  expect(result).toEqual({
    status: 'failed',
    reason: 'El procesamiento del documento falló. Inténtalo de nuevo.',
  });
  expect(JSON.stringify(calls.failed)).not.toContain('postgres://');
});

test('a missing document throws before creating a version', async () => {
  const create = vi.fn();
  const { deps } = createDeps({ versions: { create } });

  await expect(processDocument('missing', deps)).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
