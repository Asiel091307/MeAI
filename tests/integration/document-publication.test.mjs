import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresPublicationRepository } from '../../src/db/postgres-publication';

const exec = promisify(execFile);
const migrations = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
];

async function withDatabase(run) {
  const container = `meai_t30_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });

  let pool;
  try {
    const { stdout } = await exec('docker', ['port', container, '5432/tcp'], {
      timeout: 30_000,
    });
    const port = Number(/127\.0\.0\.1:(\d+)/.exec(stdout)?.[1]);
    assert.ok(port > 0, `No local database port found: ${stdout}`);
    pool = new Pool({
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
    for (const file of migrations) {
      const migration = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
      await pool.query(migration);
    }
    await run(pool);
  } finally {
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}

async function insertDocument(pool, status = 'processing') {
  const { rows } = await pool.query(
    'INSERT INTO documents (name, pdf_bytes, status) VALUES ($1, $2, $3) RETURNING id',
    ['notas.pdf', Buffer.from([1, 2, 3]), status],
  );
  return rows[0].id;
}

async function insertVersion(pool, documentId, status, chunkTexts = []) {
  const { rows } = await pool.query(
    'INSERT INTO document_versions (document_id, status) VALUES ($1, $2) RETURNING id',
    [documentId, status],
  );
  const versionId = rows[0].id;
  for (const [index, text] of chunkTexts.entries()) {
    await pool.query(
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
       VALUES ($1, $2, 1, $3, $4, array_fill(0.1::real, ARRAY[1536])::vector)`,
      [documentId, versionId, index + 1, text],
    );
  }
  return versionId;
}

// A document that was already published: complete version, active, available.
async function insertPublishedDocument(pool, chunkTexts) {
  const documentId = await insertDocument(pool, 'available');
  const versionId = await insertVersion(pool, documentId, 'complete', chunkTexts);
  await pool.query('UPDATE documents SET active_version_id = $2 WHERE id = $1', [
    documentId, versionId,
  ]);
  return { documentId, versionId };
}

// Queryable = what a search is allowed to see.
async function queryableTexts(pool, documentId) {
  const { rows } = await pool.query(
    `SELECT c.text FROM chunks c
     JOIN documents d ON d.active_version_id = c.version_id AND d.id = c.document_id
     WHERE d.status = 'available' AND d.id = $1
     ORDER BY c.position`,
    [documentId],
  );
  return rows.map((row) => row.text);
}

async function findDocument(pool, documentId) {
  const { rows } = await pool.query(
    'SELECT status, error, active_version_id FROM documents WHERE id = $1',
    [documentId],
  );
  return rows[0];
}

async function count(pool, table, documentId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE document_id = $1`,
    [documentId],
  );
  return rows[0].n;
}

test('T30: chunks are queryable only after the whole version is published, and the previous version disappears', async () => {
  await withDatabase(async (pool) => {
    const publication = createPostgresPublicationRepository(pool);
    const documentId = await insertDocument(pool);
    const first = await insertVersion(pool, documentId, 'processing', ['uno', 'dos']);

    assert.deepEqual(await queryableTexts(pool, documentId), []);

    await publication.publish(documentId, first);

    assert.deepEqual(await queryableTexts(pool, documentId), ['uno', 'dos']);
    assert.deepEqual(await findDocument(pool, documentId), {
      status: 'available', error: null, active_version_id: first,
    });
    const versions = await pool.query('SELECT status FROM document_versions WHERE id = $1', [first]);
    assert.equal(versions.rows[0].status, 'complete');

    // Reprocessing: the second attempt stays invisible until it is published.
    await pool.query("UPDATE documents SET status = 'processing' WHERE id = $1", [documentId]);
    const second = await insertVersion(pool, documentId, 'processing', ['tres']);
    await pool.query("UPDATE documents SET status = 'available' WHERE id = $1", [documentId]);
    assert.deepEqual(await queryableTexts(pool, documentId), ['uno', 'dos']);

    await publication.publish(documentId, second);

    assert.deepEqual(await queryableTexts(pool, documentId), ['tres']);
    assert.equal((await findDocument(pool, documentId)).active_version_id, second);
    assert.equal(await count(pool, 'chunks', documentId), 1);
    assert.equal(await count(pool, 'document_versions', documentId), 1);
  });
}, 180_000);

test('T31: failing without a previous version leaves the document failed with no content', async () => {
  await withDatabase(async (pool) => {
    const publication = createPostgresPublicationRepository(pool);
    const documentId = await insertDocument(pool);
    const versionId = await insertVersion(pool, documentId, 'processing', ['parcial']);

    await publication.fail(documentId, versionId, 'No se pudo leer texto en la página 2.');

    assert.deepEqual(await findDocument(pool, documentId), {
      status: 'failed',
      error: 'No se pudo leer texto en la página 2.',
      active_version_id: null,
    });
    assert.equal(await count(pool, 'chunks', documentId), 0);
    assert.equal(await count(pool, 'document_versions', documentId), 0);
    assert.deepEqual(await queryableTexts(pool, documentId), []);
  });
}, 180_000);

test('T31: failing a reprocessing keeps the previous version active and queryable', async () => {
  await withDatabase(async (pool) => {
    const publication = createPostgresPublicationRepository(pool);
    const { documentId, versionId: previous } = await insertPublishedDocument(pool, ['viejo']);
    await pool.query("UPDATE documents SET status = 'processing' WHERE id = $1", [documentId]);
    const attempt = await insertVersion(pool, documentId, 'processing', ['nuevo']);

    await publication.fail(documentId, attempt, 'No se pudieron generar los embeddings.');

    assert.deepEqual(await findDocument(pool, documentId), {
      status: 'available',
      error: 'No se pudieron generar los embeddings.',
      active_version_id: previous,
    });
    assert.deepEqual(await queryableTexts(pool, documentId), ['viejo']);
    assert.equal(await count(pool, 'chunks', documentId), 1);
    assert.equal(await count(pool, 'document_versions', documentId), 1);
  });
}, 180_000);

test('T32: recovery fails new documents and restores previous versions, publishing no partial data', async () => {
  await withDatabase(async (pool) => {
    const publication = createPostgresPublicationRepository(pool);
    const reason = 'El procesamiento se interrumpió por un reinicio de la aplicación. Vuelve a intentarlo.';

    const interruptedId = await insertDocument(pool);
    await insertVersion(pool, interruptedId, 'processing', ['parcial']);

    const { documentId: restoredId } = await insertPublishedDocument(pool, ['viejo']);
    await pool.query("UPDATE documents SET status = 'processing' WHERE id = $1", [restoredId]);
    await insertVersion(pool, restoredId, 'processing', ['nuevo parcial']);

    const untouched = await insertPublishedDocument(pool, ['intacto']);
    const alreadyFailed = await insertDocument(pool, 'failed');

    const result = await publication.recoverInterrupted(reason);

    assert.deepEqual(result, { failed: [interruptedId], restored: [restoredId] });

    assert.deepEqual(await findDocument(pool, interruptedId), {
      status: 'failed', error: reason, active_version_id: null,
    });
    assert.equal(await count(pool, 'chunks', interruptedId), 0);
    assert.equal(await count(pool, 'document_versions', interruptedId), 0);

    const restored = await findDocument(pool, restoredId);
    assert.equal(restored.status, 'available');
    assert.equal(restored.error, reason);
    assert.deepEqual(await queryableTexts(pool, restoredId), ['viejo']);
    assert.equal(await count(pool, 'chunks', restoredId), 1);
    assert.equal(await count(pool, 'document_versions', restoredId), 1);

    assert.deepEqual(await queryableTexts(pool, untouched.documentId), ['intacto']);
    assert.equal((await findDocument(pool, alreadyFailed)).status, 'failed');

    const stuck = await pool.query("SELECT count(*)::int AS n FROM documents WHERE status = 'processing'");
    assert.equal(stuck.rows[0].n, 0);
    const stuckVersions = await pool.query(
      "SELECT count(*)::int AS n FROM document_versions WHERE status = 'processing'",
    );
    assert.equal(stuckVersions.rows[0].n, 0);
  });
}, 180_000);
