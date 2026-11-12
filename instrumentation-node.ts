import type { Pool } from 'pg';
import { runMigrations } from './src/db/migrations';
import { getPool } from './src/db/pool';
import { createPostgresPublicationRepository } from './src/db/postgres-publication';
import { recoverInterruptedDocuments } from './src/documents/recover-interrupted-documents';

// T32: attempts left 'processing' by a restart are discarded before serving requests.
// The pool is a parameter only so tests can point it at a throwaway database.
export async function recoverInterruptedDocumentsAtStartup(pool: Pool = getPool()): Promise<void> {
  try {
    await recoverInterruptedDocuments(createPostgresPublicationRepository(pool));
  } catch (error) {
    // The server must start even if the database is not reachable yet.
    console.error('Startup recovery of interrupted documents failed:', error);
  }
}

// Runs once when the server starts: first bring the schema up to date (pending SQL
// migrations), then recover interrupted documents. Errors are logged, never thrown, so the
// server always starts; requests then report the database problem to the user.
export async function prepareDatabaseAtStartup(pool: Pool = getPool()): Promise<void> {
  try {
    const applied = await runMigrations(pool);
    if (applied.length > 0) {
      console.log(`Applied database migrations: ${applied.join(', ')}`);
    }
  } catch (error) {
    console.error('Startup database migrations failed:', error);
    return;
  }
  await recoverInterruptedDocumentsAtStartup(pool);
}
