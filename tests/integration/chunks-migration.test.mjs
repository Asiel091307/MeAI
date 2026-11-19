import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'vitest';

const exec = promisify(execFile);

test('chunks keep their document, version, page and position, with an embedding of any dimension', async () => {
  const database = `meai_chunks_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const documentId = randomUUID();
  const otherDocumentId = randomUUID();
  const versionId = randomUUID();
  // T26 made the embedding mandatory; any valid vector works here.
  const embedding = 'array_fill(0.1::real, ARRAY[1536])::vector';
  const nextVersionId = randomUUID();
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
      `INSERT INTO document_versions (id, document_id, status) VALUES
       ('${versionId}', '${documentId}', 'complete'),
       ('${nextVersionId}', '${documentId}', 'processing')`);
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO chunks (document_id, version_id, page, position, text, embedding) VALUES
       ('${documentId}', '${versionId}', 1, 1, 'Primera parte', ${embedding}),
       ('${documentId}', '${versionId}', 1, 2, 'Segunda parte', ${embedding}),
       ('${documentId}', '${versionId}', 2, 1, 'Otra página', ${embedding}),
       ('${documentId}', '${nextVersionId}', 1, 1, 'Nuevo intento', ${embedding})`);

    const output = await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      `SELECT document_id, version_id, page, position, text
       FROM chunks WHERE document_id = '${documentId}'
       ORDER BY version_id, page, position`);
    const rows = output.trim().split('\n').map((line) => line.trim().split('|'));
    assert.deepEqual(rows, [
      [documentId, versionId, '1', '1', 'Primera parte'],
      [documentId, versionId, '1', '2', 'Segunda parte'],
      [documentId, versionId, '2', '1', 'Otra página'],
      [documentId, nextVersionId, '1', '1', 'Nuevo intento'],
    ].sort((left, right) => left[1].localeCompare(right[1])
      || Number(left[2]) - Number(right[2]) || Number(left[3]) - Number(right[3])));

    await assert.rejects(
      compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
        '-v', 'ON_ERROR_STOP=1', '-c',
        `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
         VALUES ('${otherDocumentId}', '${versionId}', 1, 3, 'Origen incorrecto', ${embedding})`),
      /foreign key constraint/i,
    );

    const embeddingType = await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      "SELECT format_type(atttypid, atttypmod) || ' ' || attnotnull FROM pg_attribute WHERE attrelid = 'public.chunks'::regclass AND attname = 'embedding'");
    assert.equal(embeddingType.trim(), 'vector true');
  } finally {
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${database} WITH (FORCE)`);
  }
}, 90_000);
