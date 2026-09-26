import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'vitest';

const exec = promisify(execFile);

test('SQL migrations run in order and only once in PostgreSQL', async () => {
  const database = `meai_migrations_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await exec(process.execPath, [
        'scripts/migrate.mjs', '--directory', 'tests/fixtures/migrations',
        '--database', database,
      ], { cwd: process.cwd(), env, timeout: 30_000 });
    }

    const result = await compose('exec', '-T', 'db', 'psql', '-U', 'meai',
      '-d', database, '-v', 'ON_ERROR_STOP=1', '-At', '-c',
      'SELECT (SELECT count(*) FROM schema_migrations), (SELECT count(*) FROM migration_probe), (SELECT sum(value) FROM migration_probe)');
    assert.equal(result.trim(), '2|1|1');
  } finally {
    await compose('exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${database} WITH (FORCE)`);
  }
}, 90_000);
