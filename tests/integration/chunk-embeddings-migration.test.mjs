import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';

const exec = promisify(execFile);
const migrations = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
];

async function withDatabase(run) {
  const container = `meai_t26_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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

function vectorLiteral(dimensions) {
  return `[${Array.from({ length: dimensions }, (_, index) => (index + 1) / 10_000).join(',')}]`;
}

async function seedVersion(pool) {
  const { rows: documents } = await pool.query(
    'INSERT INTO documents (name, pdf_bytes) VALUES ($1, $2) RETURNING id',
    ['notas.pdf', Buffer.from([1, 2, 3])],
  );
  const { rows: versions } = await pool.query(
    'INSERT INTO document_versions (document_id) VALUES ($1) RETURNING id',
    [documents[0].id],
  );
  return { documentId: documents[0].id, versionId: versions[0].id };
}

const insertWithEmbedding =
  'INSERT INTO chunks (document_id, version_id, page, position, text, embedding) VALUES ($1, $2, 1, 1, $3, $4::vector)';

test('the chunks table accepts 1536-dimension vectors and rejects other dimensions', async () => {
  await withDatabase(async (pool) => {
    const { documentId, versionId } = await seedVersion(pool);

    await pool.query(insertWithEmbedding, [documentId, versionId, 'ok', vectorLiteral(1536)]);
    const { rows } = await pool.query('SELECT vector_dims(embedding) AS dims FROM chunks');
    assert.deepEqual(rows, [{ dims: 1536 }]);

    for (const dimensions of [1535, 1537]) {
      await assert.rejects(
        pool.query(insertWithEmbedding, [documentId, versionId, 'bad', vectorLiteral(dimensions)]),
        /expected 1536 dimensions, not/,
      );
    }
    const { rows: count } = await pool.query('SELECT count(*)::int AS n FROM chunks');
    assert.equal(count[0].n, 1);
  });
}, 180_000);

test('a chunk without embedding is rejected', async () => {
  await withDatabase(async (pool) => {
    const { documentId, versionId } = await seedVersion(pool);
    await assert.rejects(
      pool.query(
        'INSERT INTO chunks (document_id, version_id, page, position, text) VALUES ($1, $2, 1, 1, $3)',
        [documentId, versionId, 'sin vector'],
      ),
      /null value in column "embedding"/,
    );
  });
}, 180_000);
