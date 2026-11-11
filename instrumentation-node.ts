import type { Pool } from 'pg';
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
