import { getPool } from './src/db/pool';
import { createPostgresPublicationRepository } from './src/db/postgres-publication';
import { recoverInterruptedDocuments } from './src/documents/recover-interrupted-documents';

// T32: attempts left 'processing' by a restart are discarded before serving requests.
export async function recoverInterruptedDocumentsAtStartup(): Promise<void> {
  try {
    await recoverInterruptedDocuments(createPostgresPublicationRepository(getPool()));
  } catch (error) {
    // The server must start even if the database is not reachable yet.
    console.error('Startup recovery of interrupted documents failed:', error);
  }
}
