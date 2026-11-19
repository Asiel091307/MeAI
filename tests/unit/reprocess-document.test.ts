import { beforeEach, expect, test, vi } from 'vitest';
import type { Document, StartReprocessingResult } from '../../src/db/contracts';
import type { ProcessDocumentDeps } from '../../src/documents/process-document';
import { reprocessDocument } from '../../src/documents/reprocess-document';
import { extractPdfPageTexts } from '../../src/rag/ingestion/pdf-page-texts';

vi.mock('../../src/rag/ingestion/pdf-page-texts', () => ({ extractPdfPageTexts: vi.fn() }));

const extract = vi.mocked(extractPdfPageTexts);

const document: Document = {
  id: 'doc-1',
  name: 'notas.pdf',
  pdfBytes: Uint8Array.from([1, 2, 3]),
  status: 'processing',
  error: null,
  activeVersionId: 'old-version',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function createDeps(startResult: StartReprocessingResult) {
  const calls = {
    started: [] as string[],
    versionsCreated: 0,
    findById: 0,
    published: [] as [string, string][],
  };
  const deps: ProcessDocumentDeps & {
    reprocessing: { startReprocessing(id: string): Promise<StartReprocessingResult> };
  } = {
    reprocessing: {
      startReprocessing: async (id) => {
        calls.started.push(id);
        return startResult;
      },
    },
    documents: {
      findById: async () => {
        calls.findById += 1;
        return document;
      },
    },
    versions: {
      create: async (documentId, embeddingModel) => {
        calls.versionsCreated += 1;
        return {
          id: 'version-2',
          documentId,
          status: 'processing',
          createdAt: new Date(),
          embeddingModel,
          embeddingDimensions: null,
        };
      },
    },
    chunks: { save: async () => {} },
    publication: {
      publish: async (documentId, versionId) => {
        calls.published.push([documentId, versionId]);
      },
      fail: async () => {},
    },
    embeddings: { embedDocuments: async (texts) => texts.map(() => [1, 0]) },
    embeddingModel: 'test-model',
    config: { chunkSize: 1000, chunkOverlap: 200, retrievalTopK: 5 },
  };
  return { deps, calls };
}

beforeEach(() => {
  extract.mockReset();
  extract.mockResolvedValue([{ page: 1, text: 'Texto' }]);
});

test('a missing document is reported and the pipeline never starts', async () => {
  const { deps, calls } = createDeps('not_found');

  const result = await reprocessDocument('doc-1', deps);

  expect(result).toEqual({
    status: 'not_found',
    reason: 'El documento no existe o ya fue eliminado.',
  });
  expect(calls.versionsCreated).toBe(0);
  expect(calls.findById).toBe(0);
});

test('a document already processing is reported and the pipeline never starts', async () => {
  const { deps, calls } = createDeps('already_processing');

  const result = await reprocessDocument('doc-1', deps);

  expect(result).toEqual({
    status: 'already_processing',
    reason: 'El documento ya se está procesando. Espera a que termine.',
  });
  expect(calls.versionsCreated).toBe(0);
  expect(calls.findById).toBe(0);
});

test('a started reprocessing runs the pipeline and publishes the new version', async () => {
  const { deps, calls } = createDeps('started');

  const result = await reprocessDocument('doc-1', deps);

  expect(result).toEqual({ status: 'available' });
  expect(calls.started).toEqual(['doc-1']);
  expect(calls.versionsCreated).toBe(1);
  expect(calls.published).toEqual([['doc-1', 'version-2']]);
});
