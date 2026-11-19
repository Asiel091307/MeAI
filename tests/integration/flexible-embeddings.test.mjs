import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPool } from '../../src/db/pool';
import { createPostgresChunkRepository } from '../../src/db/postgres-chunks';
import { countDocumentsWithOtherModel } from '../../src/db/postgres-embedding-status';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createPostgresPublicationRepository } from '../../src/db/postgres-publication';
import { createPostgresSearchRepository } from '../../src/db/postgres-search';
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';

const exec = promisify(execFile);
const BEFORE_005 = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
];

const readMigration = (file) => readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');

async function withDatabase(run) {
  const container = `meai_t012_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });

  let pool;
  try {
    const { stdout } = await exec('docker', ['port', container, '5432/tcp'], { timeout: 30_000 });
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
    await run(pool, port);
  } finally {
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}

// A vector of the given size pointing along the first axis, rotated by `degrees` towards the second.
function vectorAt(dimensions, degrees = 0) {
  const radians = (degrees * Math.PI) / 180;
  const values = new Array(dimensions).fill(0);
  values[0] = Math.cos(radians);
  values[1] = Math.sin(radians);
  return values;
}

// Creates an available document with one published version through the real repositories.
async function indexDocument(pool, name, model, dimensions, texts) {
  const document = await createPostgresDocumentRepository(pool).create({ name, pdfBytes: Uint8Array.from([1]) });
  const version = await createPostgresVersionRepository(pool).create(document.id, model);
  await createPostgresChunkRepository(pool).save(
    document.id,
    version.id,
    texts.map((text, index) => ({ page: index + 1, position: 1, text, embedding: vectorAt(dimensions, index * 10) })),
  );
  await createPostgresPublicationRepository(pool).publish(document.id, version.id);
  return document;
}

test('migration 005 backfills legacy versions as gemini-embedding-001 with 1536 dimensions', async () => {
  await withDatabase(async (pool) => {
    for (const file of BEFORE_005) await pool.query(await readMigration(file));
    const { rows: documents } = await pool.query(
      "INSERT INTO documents (name, pdf_bytes, status) VALUES ('viejo.pdf', $1, 'available') RETURNING id",
      [Buffer.from([1])],
    );
    const { rows: versions } = await pool.query(
      "INSERT INTO document_versions (document_id, status) VALUES ($1, 'complete') RETURNING id",
      [documents[0].id],
    );
    await pool.query(
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
       VALUES ($1, $2, 1, 1, 'legacy', $3::vector)`,
      [documents[0].id, versions[0].id, `[${vectorAt(1536).join(',')}]`],
    );
    await pool.query('UPDATE documents SET active_version_id = $2 WHERE id = $1', [documents[0].id, versions[0].id]);

    await pool.query(await readMigration('005_flexible_embeddings.sql'));

    const { rows } = await pool.query('SELECT embedding_model, embedding_dimensions FROM document_versions');
    assert.deepEqual(rows, [{ embedding_model: 'gemini-embedding-001', embedding_dimensions: 1536 }]);
    const { rows: type } = await pool.query(
      `SELECT format_type(atttypid, atttypmod) AS type, attnotnull FROM pg_attribute
       WHERE attrelid = 'public.chunks'::regclass AND attname = 'embedding'`,
    );
    assert.deepEqual(type, [{ type: 'vector', attnotnull: true }]);

    // Legacy chunks stay searchable with the old model and size.
    const search = createPostgresSearchRepository(pool, { embeddingModel: 'gemini-embedding-001' });
    const results = await search.searchSimilar(vectorAt(1536), 5);
    assert.deepEqual(results.map((r) => r.text), ['legacy']);
  });
}, 180_000);

test('documents of different models and sizes coexist; search only uses the current model', async () => {
  await withDatabase(async (pool) => {
    for (const file of [...BEFORE_005, '005_flexible_embeddings.sql']) {
      await pool.query(await readMigration(file));
    }
    const small = await indexDocument(pool, 'a.pdf', 'model-a', 768, ['a-cerca', 'a-lejos']);
    const large = await indexDocument(pool, 'b.pdf', 'model-b', 1536, ['b-cerca', 'b-lejos']);
    // Same model name as B but another size: never comparable with B's query.
    await indexDocument(pool, 'c.pdf', 'model-b', 1024, ['c-otro-tamano']);

    const { rows } = await pool.query(
      'SELECT embedding_model AS m, embedding_dimensions AS d FROM document_versions ORDER BY d',
    );
    assert.deepEqual(rows, [
      { m: 'model-a', d: 768 }, { m: 'model-b', d: 1024 }, { m: 'model-b', d: 1536 },
    ]);

    const searchB = createPostgresSearchRepository(pool, { embeddingModel: 'model-b' });
    const resultsB = await searchB.searchSimilar(vectorAt(1536), 10);
    assert.deepEqual(resultsB.map((r) => r.text), ['b-cerca', 'b-lejos']);
    assert.ok(resultsB.every((r) => r.documentId === large.id));

    const searchA = createPostgresSearchRepository(pool, { embeddingModel: 'model-a' });
    const resultsA = await searchA.searchSimilar(vectorAt(768), 10);
    assert.deepEqual(resultsA.map((r) => r.text), ['a-cerca', 'a-lejos']);
    assert.ok(resultsA.every((r) => r.documentId === small.id));

    // A model with no indexed documents, or a query of another size, finds nothing and never fails.
    const none = createPostgresSearchRepository(pool, { embeddingModel: 'model-z' });
    assert.deepEqual(await none.searchSimilar(vectorAt(1536), 5), []);
    assert.deepEqual(await searchB.searchSimilar(vectorAt(512), 5), []);

    assert.equal(await countDocumentsWithOtherModel(pool, 'model-b', null), 1);
    assert.equal(await countDocumentsWithOtherModel(pool, 'model-b', 1536), 2);
    assert.equal(await countDocumentsWithOtherModel(pool, 'model-a', null), 2);
    assert.equal(await countDocumentsWithOtherModel(pool, 'model-z', null), 3);

    // Only documents that are 'available' are counted.
    await pool.query("UPDATE documents SET status = 'processing' WHERE id = $1", [small.id]);
    assert.equal(await countDocumentsWithOtherModel(pool, 'model-b', null), 0);
  });
}, 180_000);

test('a pool built from DATABASE_URL reaches the database', async () => {
  await withDatabase(async (_pool, port) => {
    const pool = createPool({
      DATABASE_URL: `postgres://meai:test-only-password@127.0.0.1:${port}/meai`,
    });
    try {
      const { rows } = await pool.query('SELECT current_database() AS db');
      assert.deepEqual(rows, [{ db: 'meai' }]);
    } finally {
      await pool.end();
    }
  });
}, 180_000);
