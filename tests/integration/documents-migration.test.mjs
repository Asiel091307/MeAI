import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'vitest';

const exec = promisify(execFile);

test('documents migration stores duplicate PDFs independently and preserves their bytes', async () => {
  const database = `meai_documents_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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

    const pdfHex = '255044462d312e370a00ff';
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO documents (name, pdf_bytes) VALUES
        ('notas.pdf', decode('${pdfHex}', 'hex')),
        ('notas.pdf', decode('${pdfHex}', 'hex'))`);

    const output = await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      "SELECT id, name, encode(pdf_bytes, 'hex'), status, error IS NULL FROM documents ORDER BY id");
    const rows = output.trim().split('\n').map((line) => line.trim().split('|'));

    assert.equal(rows.length, 2);
    assert.notEqual(rows[0][0], rows[1][0]);
    for (const [id, name, bytes, status, noError] of rows) {
      assert.match(id, /^[0-9a-f-]{36}$/);
      assert.equal(name, 'notas.pdf');
      assert.equal(bytes, pdfHex);
      assert.equal(status, 'processing');
      assert.equal(noError, 't');
    }
  } finally {
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${database} WITH (FORCE)`);
  }
}, 90_000);
