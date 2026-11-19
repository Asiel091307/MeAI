import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresChunkRepository } from '../../src/db/postgres-chunks';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createPostgresPublicationRepository } from '../../src/db/postgres-publication';
import { createPostgresReprocessingRepository } from '../../src/db/postgres-reprocessing';
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';
import { processDocument } from '../../src/documents/process-document';
import { registerDocument } from '../../src/documents/register-document';
import { reprocessDocument } from '../../src/documents/reprocess-document';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { createBlankPdf, createTextPdf } from '../helpers/pdf-fixtures';

const exec = promisify(execFile);
const MIGRATIONS = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
  '005_flexible_embeddings.sql',
];

// Deterministic stand-in for Gemini: same text, same unit vector of 1536 values.
const fakeEmbeddings = {
  async embedDocuments(texts) {
    return texts.map((text) => {
      const vector = Array.from({ length: 1536 }, (_, index) => ((text.length + index) % 7) + 1);
      const length = Math.hypot(...vector);
      return vector.map((value) => value / length);
    });
  },
};

const failingEmbeddings = {
  async embedDocuments() {
    throw new Error('HTTP 503');
  },
};

const blankOcr = { async recognize() { return ''; } };

async function startDatabase() {
  const container = `meai_t59_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });
  const { stdout } = await exec('docker', ['port', container, '5432/tcp'], { timeout: 30_000 });
  const port = Number(/127\.0\.0\.1:(\d+)/.exec(stdout)?.[1]);
  const pool = new Pool({
    host: '127.0.0.1', port, user: 'meai', database: 'meai',
    password: 'test-only-password', connectionTimeoutMillis: 1000,
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (error) {
      if (attempt === 119) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  for (const file of MIGRATIONS) {
    await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  return { container, pool };
}

function dependencies(pool, overrides = {}) {
  return {
    reprocessing: createPostgresReprocessingRepository(pool),
    documents: createPostgresDocumentRepository(pool),
    versions: createPostgresVersionRepository(pool),
    chunks: createPostgresChunkRepository(pool),
    publication: createPostgresPublicationRepository(pool),
    embeddings: fakeEmbeddings,
    config: DEFAULT_RAG_CONFIG,
    ...overrides,
  };
}

// Same definition of "queryable" used by the publication tests (T30).
async function queryableChunks(pool, documentId) {
  const result = await pool.query(
    `SELECT c.version_id, c.page, c.position, c.text
     FROM chunks c JOIN documents d
       ON d.id = c.document_id AND d.active_version_id = c.version_id AND d.status = 'available'
     WHERE c.document_id = $1 ORDER BY c.page, c.position`,
    [documentId],
  );
  return result.rows;
}

async function allChunkVersionIds(pool, documentId) {
  const result = await pool.query(
    'SELECT DISTINCT version_id FROM chunks WHERE document_id = $1',
    [documentId],
  );
  return result.rows.map((row) => row.version_id);
}

async function withDatabase(work) {
  const { container, pool } = await startDatabase();
  try {
    await work(pool);
  } finally {
    await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}

const LONG_TEXT = 'Frase de prueba para el reproceso del documento. '.repeat(30);

async function registerAndProcess(pool, pdf, name = 'notas.pdf', overrides = {}) {
  const registered = await registerDocument(createPostgresDocumentRepository(pool), { name, bytes: pdf });
  const documentId = registered.document.id;
  const result = await processDocument(documentId, dependencies(pool, overrides));
  return { documentId, result };
}

test('T59/T60: while reprocessing the document is processing and not queryable, then only the new version is queryable', async () => {
  await withDatabase(async (pool) => {
    const documents = createPostgresDocumentRepository(pool);
    const { documentId, result } = await registerAndProcess(pool, createTextPdf([LONG_TEXT]));
    assert.deepEqual(result, { status: 'available' });
    const before = await documents.findById(documentId);
    const oldVersionId = before?.activeVersionId;
    assert.ok(oldVersionId);
    const oldChunks = await queryableChunks(pool, documentId);
    assert.ok(oldChunks.length > 0);

    let observed;
    const observingEmbeddings = {
      async embedDocuments(texts) {
        const document = await documents.findById(documentId);
        observed = {
          status: document?.status,
          activeVersionId: document?.activeVersionId,
          queryable: await queryableChunks(pool, documentId),
        };
        return fakeEmbeddings.embedDocuments(texts);
      },
    };

    const outcome = await reprocessDocument(
      documentId,
      dependencies(pool, {
        embeddings: observingEmbeddings,
        config: { ...DEFAULT_RAG_CONFIG, chunkSize: 200, chunkOverlap: 20 },
      }),
    );

    assert.deepEqual(outcome, { status: 'available' });
    // T59: during the attempt the old version is still active but nothing is queryable.
    assert.equal(observed.status, 'processing');
    assert.equal(observed.activeVersionId, oldVersionId);
    assert.deepEqual(observed.queryable, []);
    // T60: afterwards only the new complete version exists and is queryable.
    const after = await documents.findById(documentId);
    assert.equal(after?.status, 'available');
    assert.equal(after?.error, null);
    assert.notEqual(after?.activeVersionId, oldVersionId);
    const newChunks = await queryableChunks(pool, documentId);
    assert.ok(newChunks.length > 0);
    assert.ok(newChunks.every((chunk) => !oldChunks.some((old) => old.version_id === chunk.version_id)));
    assert.ok(newChunks.every((chunk) => chunk.version_id === after?.activeVersionId));
    assert.deepEqual(await allChunkVersionIds(pool, documentId), [after?.activeVersionId]);
    const versions = await pool.query('SELECT id, status FROM document_versions WHERE document_id = $1', [documentId]);
    assert.deepEqual(versions.rows, [{ id: after?.activeVersionId, status: 'complete' }]);
  });
}, 180_000);

test('T61: a failed reprocess of an available document keeps the previous version queryable and reports the failure', async () => {
  await withDatabase(async (pool) => {
    const documents = createPostgresDocumentRepository(pool);
    const { documentId } = await registerAndProcess(pool, createTextPdf(['Primera pagina.', 'Segunda pagina.']));
    const before = await documents.findById(documentId);
    const oldChunks = await queryableChunks(pool, documentId);
    assert.equal(oldChunks.length, 2);

    const outcome = await reprocessDocument(
      documentId,
      dependencies(pool, { embeddings: failingEmbeddings }),
    );

    assert.equal(outcome.status, 'failed');
    assert.match(outcome.reason, /embeddings/);
    const after = await documents.findById(documentId);
    assert.equal(after?.status, 'available');
    assert.equal(after?.error, outcome.reason);
    assert.equal(after?.activeVersionId, before?.activeVersionId);
    assert.deepEqual(await queryableChunks(pool, documentId), oldChunks);
    assert.deepEqual(await allChunkVersionIds(pool, documentId), [before?.activeVersionId]);
    const versions = await pool.query('SELECT id FROM document_versions WHERE document_id = $1', [documentId]);
    assert.deepEqual(versions.rows, [{ id: before?.activeVersionId }]);
  });
}, 180_000);

test('T62: a failed document whose retry also fails stays failed with the new cause and nothing queryable', async () => {
  await withDatabase(async (pool) => {
    const documents = createPostgresDocumentRepository(pool);
    const { documentId, result } = await registerAndProcess(
      pool, createBlankPdf(2), 'vacio.pdf', { ocr: blankOcr },
    );
    assert.equal(result.status, 'failed');
    assert.match(result.reason, /No se pudo leer texto/);

    const retry = await reprocessDocument(
      documentId,
      dependencies(pool, { ocr: { async recognize() { throw new Error('ocr down'); } } }),
    );
    assert.equal(retry.status, 'failed');

    const afterOcrFailure = await documents.findById(documentId);
    assert.equal(afterOcrFailure?.status, 'failed');
    assert.equal(afterOcrFailure?.error, retry.reason);
    assert.equal(afterOcrFailure?.activeVersionId, null);
    assert.deepEqual(await queryableChunks(pool, documentId), []);

    const secondRetry = await reprocessDocument(documentId, dependencies(pool, { ocr: blankOcr }));
    assert.deepEqual(secondRetry, {
      status: 'failed', reason: 'No se pudo leer texto en las páginas 1 y 2.',
    });
    const final = await documents.findById(documentId);
    assert.equal(final?.status, 'failed');
    assert.equal(final?.error, secondRetry.reason);
    assert.deepEqual(await queryableChunks(pool, documentId), []);
    const leftovers = await pool.query(
      'SELECT (SELECT count(*) FROM document_versions)::int AS versions, (SELECT count(*) FROM chunks)::int AS chunks',
    );
    assert.deepEqual(leftovers.rows[0], { versions: 0, chunks: 0 });
  });
}, 180_000);

test('a failed document recovers when its retry succeeds', async () => {
  await withDatabase(async (pool) => {
    const { documentId, result } = await registerAndProcess(
      pool, createTextPdf(['Texto legible.']), 'notas.pdf', { embeddings: failingEmbeddings },
    );
    assert.equal(result.status, 'failed');

    const retry = await reprocessDocument(documentId, dependencies(pool));

    assert.deepEqual(retry, { status: 'available' });
    const document = await createPostgresDocumentRepository(pool).findById(documentId);
    assert.equal(document?.status, 'available');
    assert.equal(document?.error, null);
    assert.equal((await queryableChunks(pool, documentId)).length, 1);
  });
}, 180_000);

test('starting twice reports already_processing and an unknown or malformed id reports not_found', async () => {
  await withDatabase(async (pool) => {
    const { documentId } = await registerAndProcess(pool, createTextPdf(['Texto legible.']));
    const reprocessing = createPostgresReprocessingRepository(pool);

    assert.equal(await reprocessing.startReprocessing(documentId), 'started');
    const during = await pool.query('SELECT status, error, active_version_id FROM documents WHERE id = $1', [documentId]);
    assert.equal(during.rows[0].status, 'processing');
    assert.equal(during.rows[0].error, null);
    assert.notEqual(during.rows[0].active_version_id, null);
    assert.deepEqual(await queryableChunks(pool, documentId), []);

    assert.equal(await reprocessing.startReprocessing(documentId), 'already_processing');
    const outcome = await reprocessDocument(documentId, dependencies(pool));
    assert.deepEqual(outcome, {
      status: 'already_processing',
      reason: 'El documento ya se está procesando. Espera a que termine.',
    });

    assert.equal(await reprocessing.startReprocessing(randomUUID()), 'not_found');
    assert.equal(await reprocessing.startReprocessing('not-a-uuid'), 'not_found');
    assert.deepEqual(await reprocessDocument(randomUUID(), dependencies(pool)), {
      status: 'not_found',
      reason: 'El documento no existe o ya fue eliminado.',
    });
  });
}, 180_000);
