import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'vitest';

test('PostgreSQL starts in Compose and enables pgvector', () => {
  const env = {
    ...process.env,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'test-only-password',
  };
  const compose = (...args) => execFileSync('docker', ['compose', ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    timeout: 150_000,
  });

  assert.match(compose('config', '--services'), /^db$/m);
  compose('up', '-d', '--wait', 'db');

  const result = compose(
    'exec', '-T', 'db', 'psql', '-U', 'meai', '-d', 'meai',
    '-v', 'ON_ERROR_STOP=1', '-At',
    '-c', "CREATE EXTENSION IF NOT EXISTS vector; SELECT extname FROM pg_extension WHERE extname = 'vector';",
  );
  assert.match(result, /^vector$/m);
}, 180_000);
