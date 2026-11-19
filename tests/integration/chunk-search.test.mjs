import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresSearchRepository } from '../../src/db/postgres-search';

const exec = promisify(execFile);
const DIMENSIONS = 1536;
const migrations = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
  '005_flexible_embeddings.sql',
];

async function withDatabase(run) {
  const container = `meai_t40_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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

// Vector in the (x, y) plane at the given angle from the query direction (1, 0, ...).
function vectorAtAngle(degrees) {
  const radians = (degrees * Math.PI) / 180;
  const values = new Array(DIMENSIONS).fill(0);
  values[0] = Math.cos(radians);
  values[1] = Math.sin(radians);
  return `[${values.join(',')}]`;
}

const queryVector = (() => {
  const values = new Array(DIMENSIONS).fill(0);
  values[0] = 1;
  return values;
})();

async function insertDocument(pool, name, status) {
  const { rows } = await pool.query(
    'INSERT INTO documents (name, pdf_bytes, status) VALUES ($1, $2, $3) RETURNING id',
    [name, Buffer.from([1, 2, 3]), status],
  );
  return rows[0].id;
}

async function insertVersion(pool, documentId, status, chunks) {
  const { rows } = await pool.query(
    `INSERT INTO document_versions (document_id, status, embedding_model, embedding_dimensions)
     VALUES ($1, $2, 'test-model', ${DIMENSIONS}) RETURNING id`,
    [documentId, status],
  );
  const versionId = rows[0].id;
  const chunkIds = [];
  for (const [index, chunk] of chunks.entries()) {
    const inserted = await pool.query(
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector) RETURNING id`,
      [documentId, versionId, chunk.page, index + 1, chunk.text, vectorAtAngle(chunk.angle)],
    );
    chunkIds.push(inserted.rows[0].id);
  }
  return { versionId, chunkIds };
}

async function activate(pool, documentId, versionId) {
  await pool.query('UPDATE documents SET active_version_id = $2 WHERE id = $1', [
    documentId, versionId,
  ]);
}

test('searches only active versions of available documents, best first', async () => {
  await withDatabase(async (pool) => {
    const available = await insertDocument(pool, 'disponible.pdf', 'available');
    const oldVersion = await insertVersion(pool, available, 'complete', [
      { page: 1, text: 'texto de version vieja', angle: 0 },
    ]);
    const active = await insertVersion(pool, available, 'complete', [
      { page: 3, text: 'lejano', angle: 80 },
      { page: 1, text: 'cercano', angle: 5 },
      { page: 2, text: 'medio', angle: 40 },
    ]);
    await activate(pool, available, active.versionId);

    const processing = await insertDocument(pool, 'procesando.pdf', 'processing');
    const processingVersion = await insertVersion(pool, processing, 'complete', [
      { page: 1, text: 'procesando', angle: 0 },
    ]);
    await activate(pool, processing, processingVersion.versionId);

    const failed = await insertDocument(pool, 'fallido.pdf', 'failed');
    await insertVersion(pool, failed, 'failed', [{ page: 1, text: 'fallido', angle: 0 }]);

    const search = createPostgresSearchRepository(pool, { embeddingModel: 'test-model' });
    const results = await search.searchSimilar(queryVector, 10);

    assert.deepEqual(results.map((r) => r.text), ['cercano', 'medio', 'lejano']);
    assert.deepEqual(results.map((r) => r.chunkId), [
      active.chunkIds[1], active.chunkIds[2], active.chunkIds[0],
    ]);
    for (const result of results) {
      assert.equal(result.documentId, available);
      assert.equal(typeof result.chunkId, 'string');
      assert.equal(typeof result.page, 'number');
      assert.ok(result.score >= -1 && result.score <= 1);
    }
    assert.deepEqual(results.map((r) => r.page), [1, 2, 3]);
    assert.ok(results[0].score > 0.99, `closest score was ${results[0].score}`);
    assert.ok(results[0].score > results[1].score && results[1].score > results[2].score);
    assert.ok(!results.some((r) => r.chunkId === oldVersion.chunkIds[0]));

    const limited = await search.searchSimilar(queryVector, 2);
    assert.deepEqual(limited.map((r) => r.text), ['cercano', 'medio']);

    await assert.rejects(() => search.searchSimilar(queryVector, 0));
    await assert.rejects(() => search.searchSimilar(queryVector, 1.5));
  });
}, 180_000);
