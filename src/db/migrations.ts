import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';

// Same lock id and bookkeeping table as scripts/migrate.mjs, so both runners agree on what
// is already applied and never run a migration twice, even if they start at the same time.
const MIGRATION_LOCK_ID = 106006;
const MIGRATION_FILE = /^[0-9]{3}_[a-z0-9_]+\.sql$/;

export const DEFAULT_MIGRATIONS_DIRECTORY = resolve('db/migrations');

// Applies, in file-name order, every migration not yet recorded in schema_migrations.
// Each migration runs in its own transaction. Returns the versions applied now.
export async function runMigrations(
  pool: Pool,
  directory: string = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<string[]> {
  const files = (await readdir(directory)).filter((name) => MIGRATION_FILE.test(name)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const file of files) {
      const version = file.slice(0, -'.sql'.length);
      const done = await client.query('SELECT 1 FROM public.schema_migrations WHERE version = $1', [
        version,
      ]);
      if (done.rowCount) continue;
      const sql = await readFile(join(directory, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      applied.push(version);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
