import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresChunkRepository } from '../../src/db/postgres-chunks';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createPostgresVersionRepository } from '../../src/db/postgres-versions';

const exec = promisify(execFile);
const migrations = [
  '001_create_documents.sql',
  '002_create_document_versions.sql',
  '003_create_chunks.sql',
  '004_add_chunk_embeddings.sql',
  '005_flexible_embeddings.sql',
];
const DIMENSIONS = 1536;

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

// Distinct, non-trivial values per seed so a mix-up between chunks would be detected.
function embeddingFor(seed, dimensions = DIMENSIONS) {
  return Array.from({ length: dimensions }, (_, index) => Math.sin(seed * 1000 + index) / 2);
}

async function seedVersion(pool) {
  const document = await createPostgresDocumentRepository(pool).create({
    name: 'notas.pdf',
    pdfBytes: Uint8Array.from([1, 2, 3]),
  });
  const version = await createPostgresVersionRepository(pool).create(document.id, 'test-model');
  return { document, version };
}

test('creating a version returns a processing version of the document', async () => {
  await withDatabase(async (pool) => {
    const { document, version } = await seedVersion(pool);
    assert.equal(version.documentId, document.id);
    assert.equal(version.status, 'processing');
    assert.match(version.id, /^[0-9a-f-]{36}$/);
    assert.ok(version.createdAt instanceof Date);
  });
}, 180_000);

test('saving records the vector size on the version and accepts any size', async () => {
  await withDatabase(async (pool) => {
    const { document, version } = await seedVersion(pool);
    assert.equal(version.embeddingModel, 'test-model');
    assert.equal(version.embeddingDimensions, null);
    await createPostgresChunkRepository(pool).save(document.id, version.id, [
      { page: 1, position: 1, text: 'pequeno', embedding: embeddingFor(1, 768) },
    ]);
    const { rows } = await pool.query(
      'SELECT embedding_model, embedding_dimensions FROM document_versions WHERE id = $1',
      [version.id],
    );
    assert.deepEqual(rows, [{ embedding_model: 'test-model', embedding_dimensions: 768 }]);
  });
}, 180_000);

test('saved chunks come back with document, version, page, text and embedding', async () => {
  await withDatabase(async (pool) => {
    const { document, version } = await seedVersion(pool);
    const repository = createPostgresChunkRepository(pool);
    const input = [
      { page: 1, position: 1, text: 'primer fragmento', embedding: embeddingFor(1) },
      { page: 2, position: 1, text: 'tercer fragmento', embedding: embeddingFor(3) },
      { page: 1, position: 2, text: 'segundo fragmento', embedding: embeddingFor(2) },
    ];

    await repository.save(document.id, version.id, input);
    const saved = await repository.findByVersion(version.id);

    const expected = [input[0], input[2], input[1]];
    assert.equal(saved.length, 3);
    saved.forEach((chunk, index) => {
      assert.equal(chunk.documentId, document.id);
      assert.equal(chunk.versionId, version.id);
      assert.equal(chunk.page, expected[index].page);
      assert.equal(chunk.position, expected[index].position);
      assert.equal(chunk.text, expected[index].text);
      assert.equal(chunk.embedding.length, DIMENSIONS);
      chunk.embedding.forEach((value, dimension) => {
        assert.ok(
          Math.abs(value - expected[index].embedding[dimension]) < 1e-6,
          `embedding mismatch in chunk ${index}, dimension ${dimension}`,
        );
      });
    });
  });
}, 180_000);

test('saving no chunks does nothing', async () => {
  await withDatabase(async (pool) => {
    const { document, version } = await seedVersion(pool);
    const repository = createPostgresChunkRepository(pool);
    await repository.save(document.id, version.id, []);
    assert.deepEqual(await repository.findByVersion(version.id), []);
  });
}, 180_000);

test('a failing save rolls back every chunk of the batch', async () => {
  await withDatabase(async (pool) => {
    const { document, version } = await seedVersion(pool);
    const repository = createPostgresChunkRepository(pool);

    await assert.rejects(
      repository.save(document.id, version.id, [
        { page: 1, position: 1, text: 'valido', embedding: embeddingFor(1) },
        { page: 1, position: 2, text: 'dimension incorrecta', embedding: embeddingFor(2, 10) },
      ]),
      /same number of dimensions/,
    );

    assert.deepEqual(await repository.findByVersion(version.id), []);
  });
}, 180_000);
