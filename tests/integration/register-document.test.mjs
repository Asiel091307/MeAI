import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { registerDocument } from '../../src/documents/register-document';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';
import { createBlankPdf } from '../helpers/pdf-fixtures';

const exec = promisify(execFile);

test('registering the same valid PDF twice creates two independent processing documents', async () => {
  const container = `meai_t29_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
    for (const file of ['001_create_documents.sql', '002_create_document_versions.sql']) {
      const migration = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
      await pool.query(migration);
    }

    const repository = createPostgresDocumentRepository(pool);
    const bytes = createBlankPdf(2);
    const upload = { name: 'notas.pdf', bytes };

    const first = await registerDocument(repository, upload);
    const second = await registerDocument(repository, upload);

    assert.equal(first.registered, true);
    assert.equal(second.registered, true);
    assert.notEqual(first.document.id, second.document.id);
    for (const { document } of [first, second]) {
      assert.equal(document.status, 'processing');
      assert.equal(document.error, null);
      assert.equal(document.activeVersionId, null);
    }

    for (const { document } of [first, second]) {
      const saved = await repository.findById(document.id);
      assert.deepEqual(saved?.pdfBytes, bytes);
    }

    const listed = await repository.list();
    assert.deepEqual(listed.map((item) => item.id).sort(), [first.document.id, second.document.id].sort());
  } finally {
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);
