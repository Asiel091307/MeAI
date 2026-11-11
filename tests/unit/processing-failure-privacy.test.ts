import { describe, expect, test } from 'vitest';
import type { Document } from '../../src/db/contracts';
import { processDocument, type ProcessDocumentDeps } from '../../src/documents/process-document';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { createMixedPdf, createScannedPdf, createTextPdf } from '../helpers/pdf-fixtures';

// RNF-7: the failure reason stored and returned never carries document text or internal details.
const MARKER = 'zafiroultrasecreto';
const INTERNAL = 'postgres://user:hunter2@internal-host:5432/meai';

function setup(pdfBytes: Uint8Array, overrides: Partial<ProcessDocumentDeps> = {}) {
  const document: Document = {
    id: 'doc-1',
    name: 'privado.pdf',
    pdfBytes,
    status: 'processing',
    error: null,
    activeVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const stored: string[] = [];
  const deps: ProcessDocumentDeps = {
    documents: { findById: async () => document },
    versions: {
      create: async (documentId) => ({
        id: 'version-1',
        documentId,
        status: 'processing',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    },
    chunks: { save: async () => {} },
    publication: {
      publish: async () => {},
      fail: async (_documentId, _versionId, reason) => {
        stored.push(reason);
      },
    },
    embeddings: { embedDocuments: async (texts) => texts.map(() => [1, 0]) },
    config: DEFAULT_RAG_CONFIG,
    ...overrides,
  };
  return { deps, stored };
}

async function failWith(pdfBytes: Uint8Array, overrides: Partial<ProcessDocumentDeps>) {
  const { deps, stored } = setup(pdfBytes, overrides);
  const result = await processDocument('doc-1', deps);
  expect(result.status).toBe('failed');
  const reason = (result as { reason: string }).reason;
  expect(stored).toEqual([reason]);
  expect(reason.trim().length).toBeGreaterThan(0);
  expect(reason.toLowerCase()).not.toContain(MARKER);
  expect(reason).not.toContain('hunter2');
  expect(reason).not.toContain('internal-host');
  return reason;
}

describe('failure reasons of processDocument', () => {
  const textPdf = createTextPdf([`Este documento menciona ${MARKER} en su contenido.`]);

  test('embeddings failure whose provider error quotes the document text', async () => {
    const reason = await failWith(textPdf, {
      embeddings: {
        embedDocuments: async () => {
          throw new Error(`quota exceeded for input "${MARKER}" at ${INTERNAL}`);
        },
      },
    });
    expect(reason).toMatch(/No se pudieron generar los embeddings/);
  });

  test('unexpected error while saving chunks', async () => {
    const reason = await failWith(textPdf, {
      chunks: {
        save: async () => {
          throw new Error(`insert failed for chunk "${MARKER}" via ${INTERNAL}`);
        },
      },
    });
    expect(reason).toMatch(/El procesamiento del documento falló/);
  });

  test('OCR provider throwing an error that quotes text', async () => {
    const reason = await failWith(createScannedPdf(['pagina escaneada']), {
      ocr: {
        recognize: async () => {
          throw new Error(`worker crashed reading "${MARKER}" from ${INTERNAL}`);
        },
      },
    });
    expect(reason).toMatch(/El procesamiento del documento falló/);
  });

  test('a scanned page OCR cannot read names the page but not the text of the readable pages', async () => {
    const reason = await failWith(
      createMixedPdf([
        { kind: 'digital', text: `Contenido con ${MARKER}` },
        { kind: 'scanned', text: 'ilegible' },
      ]),
      { ocr: { recognize: async () => '~ ! ?' } },
    );
    expect(reason).toBe('No se pudo leer texto en la página 2.');
  });
});
