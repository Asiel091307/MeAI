import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'vitest';

const exec = promisify(execFile);

test('a new processing attempt keeps the completed version active for its document', async () => {
  const database = `meai_versions_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const documentId = randomUUID();
  const otherDocumentId = randomUUID();
  const activeId = randomUUID();
  const pendingId = randomUUID();
  const env = {
    ...process.env,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'test-only-password',
  };
  const compose = async (...args) => (await exec('docker', ['compose', ...args], {
    cwd: process.cwd(), env, encoding: 'utf8', timeout: 30_000,
  })).stdout;

  await compose('up', '-d', '--wait', 'db');
  await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database}`);

  try {
    await exec(process.execPath, ['scripts/migrate.mjs', '--database', database], {
      cwd: process.cwd(), env, timeout: 30_000,
    });

    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO documents (id, name, pdf_bytes) VALUES
        ('${documentId}', 'notas.pdf', decode('25504446', 'hex')),
        ('${otherDocumentId}', 'otro.pdf', decode('25504446', 'hex'))`);
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO document_versions (id, document_id, status)
       VALUES ('${activeId}', '${documentId}', 'complete')`);
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `UPDATE documents SET active_version_id = '${activeId}' WHERE id = '${documentId}'`);
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO document_versions (id, document_id, status)
       VALUES ('${pendingId}', '${documentId}', 'processing')`);

    const output = await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      `SELECT d.active_version_id, v.id, v.status
       FROM documents d JOIN document_versions v ON v.document_id = d.id
       WHERE d.id = '${documentId}' ORDER BY v.id`);
    const rows = output.trim().split('\n').map((line) => line.trim().split('|'));
    assert.deepEqual(rows, [
      [activeId, activeId, 'complete'],
      [activeId, pendingId, 'processing'],
    ].sort((left, right) => left[1].localeCompare(right[1])));

    await assert.rejects(
      compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
        '-v', 'ON_ERROR_STOP=1', '-c',
        `UPDATE documents SET active_version_id = '${activeId}' WHERE id = '${otherDocumentId}'`),
      /foreign key constraint/i,
    );
  } finally {
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${database} WITH (FORCE)`);
  }
}, 90_000);
