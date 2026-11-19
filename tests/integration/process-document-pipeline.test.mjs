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
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';
import { processDocument } from '../../src/documents/process-document';
import { registerDocument } from '../../src/documents/register-document';
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

const blankOcr = { async recognize() { return ''; } };

async function startDatabase() {
  const container = `meai_e2e_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
    `SELECT c.page, c.position, c.text, vector_dims(c.embedding) AS dims
     FROM chunks c JOIN documents d
       ON d.id = c.document_id AND d.active_version_id = c.version_id AND d.status = 'available'
     WHERE c.document_id = $1 ORDER BY c.page, c.position`,
    [documentId],
  );
  return result.rows;
}

test('a registered PDF is read, chunked, embedded and published with page origins', async () => {
  const { container, pool } = await startDatabase();
  try {
    const pdf = createTextPdf([
      'La solicitud se presenta en septiembre.',
      'El plazo termina en octubre.',
    ]);
    const registered = await registerDocument(createPostgresDocumentRepository(pool), {
      name: 'tramite.pdf', bytes: pdf,
    });
    assert.equal(registered.registered, true);
    const documentId = registered.document.id;

    const result = await processDocument(documentId, dependencies(pool));

    assert.deepEqual(result, { status: 'available' });
    const document = await createPostgresDocumentRepository(pool).findById(documentId);
    assert.equal(document?.status, 'available');
    assert.equal(document?.error, null);
    assert.notEqual(document?.activeVersionId, null);
    const chunks = await queryableChunks(pool, documentId);
    assert.deepEqual(chunks.map(({ page, position }) => [page, position]), [[1, 1], [2, 1]]);
    assert.match(chunks[0].text, /septiembre/);
    assert.match(chunks[1].text, /octubre/);
    assert.ok(chunks.every(({ dims }) => dims === 1536));
  } finally {
    await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);

test('an unreadable PDF and an embeddings outage both end failed, with nothing queryable', async () => {
  const { container, pool } = await startDatabase();
  try {
    const documents = createPostgresDocumentRepository(pool);
    const blank = await registerDocument(documents, { name: 'vacio.pdf', bytes: createBlankPdf(2) });
    const text = await registerDocument(documents, {
      name: 'notas.pdf', bytes: createTextPdf(['Texto legible.']),
    });

    const unreadable = await processDocument(blank.document.id, dependencies(pool, { ocr: blankOcr }));
    const outage = await processDocument(text.document.id, dependencies(pool, {
      embeddings: { async embedDocuments() { throw new Error('HTTP 503'); } },
    }));

    assert.deepEqual(unreadable, {
      status: 'failed', reason: 'No se pudo leer texto en las páginas 1 y 2.',
    });
    assert.equal(outage.status, 'failed');
    assert.match(outage.reason, /embeddings/);
    assert.doesNotMatch(outage.reason, /503/);
    for (const [id, reason] of [[blank.document.id, unreadable.reason], [text.document.id, outage.reason]]) {
      const document = await documents.findById(id);
      assert.equal(document?.status, 'failed');
      assert.equal(document?.error, reason);
      assert.deepEqual(await queryableChunks(pool, id), []);
    }
    const leftovers = await pool.query(
      'SELECT (SELECT count(*) FROM document_versions)::int AS versions, (SELECT count(*) FROM chunks)::int AS chunks',
    );
    assert.deepEqual(leftovers.rows[0], { versions: 0, chunks: 0 });
  } finally {
    await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);
