import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { test } from 'vitest';
import { createPostgresDocumentRepository } from '../../src/db/postgres-documents';

const exec = promisify(execFile);

test('a document repository lists metadata with status and error, never the PDF bytes', async () => {
  const container = `meai_t12_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
    assert.deepEqual(await repository.list(), []);

    const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 0xff]);
    const first = await repository.create({ name: 'notas.pdf', pdfBytes });
    const second = await repository.create({ name: 'notas.pdf', pdfBytes });
    await pool.query(
      "UPDATE documents SET status = 'failed', error = $2 WHERE id = $1",
      [second.id, 'El PDF está protegido y no se pudieron contar sus páginas.'],
    );

    const listed = await repository.list();
    assert.equal(listed.length, 2);
    for (const item of listed) {
      assert.ok(!('pdfBytes' in item), 'Listed metadata must not include PDF bytes');
      assert.ok(!('pdf_bytes' in item), 'Listed metadata must not include PDF bytes');
      assert.ok(item.createdAt instanceof Date);
    }
    assert.deepEqual(
      listed.map(({ id, name, status, error, activeVersionId }) => ({
        id, name, status, error, activeVersionId,
      })),
      [
        { id: first.id, name: 'notas.pdf', status: 'processing', error: null, activeVersionId: null },
        {
          id: second.id,
          name: 'notas.pdf',
          status: 'failed',
          error: 'El PDF está protegido y no se pudieron contar sus páginas.',
          activeVersionId: null,
        },
      ],
    );
  } finally {
    if (pool) await pool.end();
    await exec('docker', ['stop', container], { timeout: 30_000 });
  }
}, 180_000);
