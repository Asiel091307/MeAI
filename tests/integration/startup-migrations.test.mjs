import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test, vi } from 'vitest';
import { prepareDatabaseAtStartup } from '../../instrumentation-node';
import { runMigrations } from '../../src/db/migrations';
import { INTERRUPTED_PROCESSING_REASON } from '../../src/documents/recover-interrupted-documents';
import { createTextPdf } from '../helpers/pdf-fixtures';
import { startMvpEnvironment } from '../helpers/mvp-environment.mjs';

async function migrationVersions() {
  const files = await readdir(new URL('../../db/migrations/', import.meta.url));
  return files.filter((name) => name.endsWith('.sql')).sort().map((name) => name.slice(0, -4));
}

async function appliedVersions(pool) {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return result.rows.map(({ version }) => version);
}

// The app prepares its own database when it starts: nobody has to remember `pnpm migrate`.
test('startup applies pending migrations once, then recovers interrupted documents', async () => {
  const env = await startMvpEnvironment({ applyMigrations: false });
  try {
    const expected = await migrationVersions();

    // Empty database: every migration is applied, with the same bookkeeping as `pnpm migrate`.
    assert.deepEqual(await runMigrations(env.pool), expected);
    assert.deepEqual(await appliedVersions(env.pool), expected);
    const embedding = await env.pool.query(
      "SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'public.chunks'::regclass AND attname = 'embedding'",
    );
    assert.equal(embedding.rows[0].type, 'vector(1536)');

    // Running again changes nothing.
    assert.deepEqual(await runMigrations(env.pool), []);
    assert.deepEqual(await appliedVersions(env.pool), expected);

    // Full startup: migrations (none pending) and then recovery of an interrupted document.
    const interrupted = await env.documents.create({
      name: 'interrumpido.pdf', pdfBytes: createTextPdf(['Texto sin terminar.']),
    });
    await prepareDatabaseAtStartup(env.pool);
    const recovered = await env.documents.findById(interrupted.id);
    assert.equal(recovered?.status, 'failed');
    assert.equal(recovered?.error, INTERRUPTED_PROCESSING_REASON);
  } finally {
    await env.stop();
  }
}, 180_000);

test('a database that is not reachable is logged and does not stop the server', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { Pool } = await import('pg');
  const unreachable = new Pool({
    host: '127.0.0.1', port: 1, user: 'meai', database: 'meai',
    password: 'x', connectionTimeoutMillis: 500,
  });
  try {
    await prepareDatabaseAtStartup(unreachable);
    assert.ok(error.mock.calls.length >= 1);
  } finally {
    error.mockRestore();
    await unreachable.end();
  }
});
