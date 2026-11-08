import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { expect, test, vi } from 'vitest';
import type { DocumentMetadata } from '../../src/db/contracts';
import {
  NO_AVAILABLE_DOCUMENTS_REASON,
  runSearchWhenDocumentsAvailable,
  validateAvailableDocuments,
} from '../../src/rag/answering/available-documents-guard';
import type { EmbeddingProvider } from '../../src/rag/providers/embeddings';

function makeMetadata(
  id: string,
  status: DocumentMetadata['status'],
): DocumentMetadata {
  return {
    id,
    name: `${id}.pdf`,
    status,
    error: status === 'failed' ? 'Error de prueba' : null,
    activeVersionId: status === 'available' ? `ver-${id}` : null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

test('rejects consultation when there are no stored documents with a message in Spanish', () => {
  expect(validateAvailableDocuments([])).toEqual({
    valid: false,
    reason: NO_AVAILABLE_DOCUMENTS_REASON,
  });
  expect(NO_AVAILABLE_DOCUMENTS_REASON).toContain('Primero debe procesarse un documento');
});

test('rejects consultation when all stored documents are processing or failed', () => {
  expect(
    validateAvailableDocuments([
      makeMetadata('doc-1', 'processing'),
      makeMetadata('doc-2', 'failed'),
    ]),
  ).toEqual({
    valid: false,
    reason: NO_AVAILABLE_DOCUMENTS_REASON,
  });
});

test('allows consultation when at least one document is available', () => {
  expect(
    validateAvailableDocuments([
      makeMetadata('doc-1', 'processing'),
      makeMetadata('doc-2', 'available'),
      makeMetadata('doc-3', 'failed'),
    ]),
  ).toEqual({ valid: true });
});

test('prevents querying and returns a Spanish message without invoking search when no documents are available', async () => {
  const embed = vi.fn<EmbeddingProvider['embed']>(async () => [0.1, 0.2]);
  const search = vi.fn(async (_vector: readonly number[]) => ['chunk-1']);

  const emptyDocuments = {
    list: vi.fn(async () => [] as DocumentMetadata[]),
  };
  const emptyResult = await runSearchWhenDocumentsAvailable(
    '¿Qué dice el informe?',
    emptyDocuments,
    { embed },
    search,
  );

  expect(emptyResult).toEqual({
    ok: false,
    reason: 'No hay documentos disponibles para consultar. Primero debe procesarse un documento.',
  });

  const nonAvailableDocuments = {
    list: vi.fn(async () => [
      makeMetadata('doc-1', 'processing'),
      makeMetadata('doc-2', 'failed'),
    ]),
  };
  const nonAvailableResult = await runSearchWhenDocumentsAvailable(
    '¿Qué dice el informe?',
    nonAvailableDocuments,
    { embed },
    search,
  );

  expect(nonAvailableResult).toEqual({
    ok: false,
    reason: 'No hay documentos disponibles para consultar. Primero debe procesarse un documento.',
  });
  expect(embed).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});

test('invokes embeddings and search when an available document exists', async () => {
  const embed = vi.fn<EmbeddingProvider['embed']>(async () => [0.3, 0.7]);
  const search = vi.fn(async (vector: readonly number[]) => [{ chunkId: 'chunk-1', vector }]);
  const documents = {
    list: vi.fn(async () => [
      makeMetadata('doc-1', 'failed'),
      makeMetadata('doc-2', 'available'),
    ]),
  };

  const result = await runSearchWhenDocumentsAvailable(
    '¿Cuál es la fecha límite?',
    documents,
    { embed },
    search,
  );

  expect(result).toEqual({
    ok: true,
    results: [{ chunkId: 'chunk-1', vector: [0.3, 0.7] }],
  });
  expect(documents.list).toHaveBeenCalledTimes(1);
  expect(embed).toHaveBeenCalledWith('¿Cuál es la fecha límite?');
  expect(search).toHaveBeenCalledWith([0.3, 0.7]);
});

test('available documents guard module does not import React or HTTP modules', async () => {
  const source = await readFile(
    new URL('../../src/rag/answering/available-documents-guard.ts', import.meta.url),
    'utf8',
  );
  const imports = ts
    .preProcessFile(source, true, true)
    .importedFiles.map(({ fileName }) => fileName);

  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^(react|next|node:http)/);
  }
});

