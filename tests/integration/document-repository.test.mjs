import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';

const exec = promisify(execFile);

test('a document repository saves duplicate PDFs and reads exact bytes by ID in PostgreSQL', async () => {
  const container = `meai_t11_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await exec('docker', [
    'run', '-d', '--rm', '--name', container,
    '-e', 'POSTGRES_DB=meai', '-e', 'POSTGRES_USER=meai',
    '-e', 'POSTGRES_PASSWORD=test-only-password',
    '-p', '127.0.0.1::5432', 'pgvector/pgvector:0.8.1-pg17',
  ], { timeout: 30_000 });

  let pool;
  let newConnection;
  try {
    const { stdout } = await exec('docker', ['port', container, '5432/tcp'], {
      timeout: 30_000,
    });
    const port = Number(/127\.0\.0\.1:(\d+)/.exec(stdout)?.[1]);
    assert.ok(port > 0, `No local database port found: ${stdout}`);
    const connection = {
      host: '127.0.0.1', port, user: 'meai', database: 'meai',
      password: 'test-only-password', connectionTimeoutMillis: 1000,
    };
    pool = new Pool(connection);

    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        break;
      } catch (error) {
        if (attempt === 119) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    for (const file of ['001_create_documents.sql', '002_create_document_versions.sql']) {
      const migration = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
      await pool.query(migration);
    }

    const repository = createPostgresDocumentRepository(pool);
    const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0xff, 0x80]);
    const first = await repository.create({ name: "notas' personales.pdf", pdfBytes });
    const second = await repository.create({ name: "notas' personales.pdf", pdfBytes });
    assert.notEqual(first.id, second.id);
    assert.equal(first.status, 'processing');
    assert.equal(first.error, null);
    assert.equal(first.activeVersionId, null);
    assert.ok(first.createdAt instanceof Date);

    await pool.end();
    pool = undefined;
    newConnection = new Pool(connection);
    const saved = await createPostgresDocumentRepository(newConnection).findById(first.id);
    assert.equal(saved?.name, "notas' personales.pdf");
    assert.deepEqual(saved?.pdfBytes, pdfBytes);
    assert.equal(saved?.id, first.id);
    assert.deepEqual((await createPostgresDocumentRepository(newConnection).findById(second.id))?.pdfBytes, pdfBytes);
    assert.equal(await createPostgresDocumentRepository(newConnection).findById(randomUUID()), null);
  } finally {
    if (newConnection) await newConnection.end();
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);
