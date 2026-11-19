import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { deleteDocument } from '../../src/documents/delete-document';

const exec = promisify(execFile);
const migrations = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
  '005_flexible_embeddings.sql',
];
const notFoundReason = 'El documento no existe o ya fue eliminado.';
const errorReason = 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.';

async function withDatabase(run) {
  const container = `meai_t55_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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

// Creates a document with one active version and two chunks with embeddings.
async function seedDocument(repository, pool) {
  const document = await repository.create({
    name: 'notas.pdf',
    pdfBytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
  });
  const { rows } = await pool.query(
    'INSERT INTO document_versions (document_id, status) VALUES ($1, $2) RETURNING id',
    [document.id, 'complete'],
  );
  const versionId = rows[0].id;
  await pool.query('UPDATE documents SET active_version_id = $2 WHERE id = $1', [
    document.id, versionId,
  ]);
  for (const position of [1, 2]) {
    await pool.query(
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
       VALUES ($1, $2, 1, $3, $4, array_fill(0.1::real, ARRAY[1536])::vector)`,
      [document.id, versionId, position, `fragmento ${position}`],
    );
  }
  return { id: document.id, versionId };
}

async function countRows(pool, documentId) {
  const counts = {};
  for (const [label, sql] of [
    ['documents', 'SELECT count(*)::int AS n FROM documents WHERE id = $1'],
    ['versions', 'SELECT count(*)::int AS n FROM document_versions WHERE document_id = $1'],
    ['chunks', 'SELECT count(*)::int AS n FROM chunks WHERE document_id = $1'],
  ]) {
    counts[label] = (await pool.query(sql, [documentId])).rows[0].n;
  }
  return counts;
}

test('deleting a document with versions and chunks reports deleted and leaves no rows', async () => {
  await withDatabase(async (pool) => {
    const repository = createPostgresDocumentRepository(pool);
    const seeded = await seedDocument(repository, pool);
    assert.deepEqual(await countRows(pool, seeded.id), { documents: 1, versions: 1, chunks: 2 });

    assert.deepEqual(await deleteDocument(seeded.id, repository), { status: 'deleted' });

    assert.deepEqual(await countRows(pool, seeded.id), { documents: 0, versions: 0, chunks: 0 });
  });
}, 180_000);

test('deleting the same document twice reports not found the second time', async () => {
  await withDatabase(async (pool) => {
    const repository = createPostgresDocumentRepository(pool);
    const seeded = await seedDocument(repository, pool);

    assert.deepEqual(await deleteDocument(seeded.id, repository), { status: 'deleted' });
    assert.deepEqual(await deleteDocument(seeded.id, repository), {
      status: 'not_found',
      reason: notFoundReason,
    });
  });
}, 180_000);

test('a random UUID that does not exist reports not found', async () => {
  await withDatabase(async (pool) => {
    const repository = createPostgresDocumentRepository(pool);

    assert.deepEqual(await deleteDocument(randomUUID(), repository), {
      status: 'not_found',
      reason: notFoundReason,
    });
  });
}, 180_000);

test('a forced failure reports error and keeps the document, its version and chunks intact', async () => {
  await withDatabase(async (pool) => {
    const repository = createPostgresDocumentRepository(pool);
    const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0xff]);
    const document = await repository.create({ name: 'notas.pdf', pdfBytes });
    const { rows } = await pool.query(
      'INSERT INTO document_versions (document_id, status) VALUES ($1, $2) RETURNING id',
      [document.id, 'complete'],
    );
    const versionId = rows[0].id;
    await pool.query('UPDATE documents SET active_version_id = $2 WHERE id = $1', [
      document.id, versionId,
    ]);
    await pool.query(
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
       VALUES ($1, $2, 1, 1, 'fragmento 1', array_fill(0.1::real, ARRAY[1536])::vector)`,
      [document.id, versionId],
    );

    await pool.query(`
      CREATE FUNCTION block_document_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced failure after chunks were deleted'; END;
      $$ LANGUAGE plpgsql`);
    await pool.query(`
      CREATE TRIGGER block_document_delete BEFORE DELETE ON documents
      FOR EACH ROW EXECUTE FUNCTION block_document_delete()`);

    try {
      const result = await deleteDocument(document.id, repository);
      assert.deepEqual(result, { status: 'error', reason: errorReason });
      assert.ok(!JSON.stringify(result).includes('forced failure'));
    } finally {
      await pool.query('DROP TRIGGER block_document_delete ON documents');
      await pool.query('DROP FUNCTION block_document_delete()');
    }

    assert.deepEqual(await countRows(pool, document.id), { documents: 1, versions: 1, chunks: 1 });
    const restored = await repository.findById(document.id);
    assert.deepEqual(Array.from(restored.pdfBytes), Array.from(pdfBytes));
    assert.equal(restored.activeVersionId, versionId);
  });
}, 180_000);
