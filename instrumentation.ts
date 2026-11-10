// Next.js runs register() once when the server starts.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  try {
    const { getPool } = await import('./src/db/pool');
    const { createPostgresPublicationRepository } = await import('./src/db/postgres-publication');
    const { recoverInterruptedDocuments } = await import(
      './src/documents/recover-interrupted-documents'
    );
    await recoverInterruptedDocuments(createPostgresPublicationRepository(getPool()));
  } catch (error) {
    // The server must start even if the database is not reachable yet.
    console.error('Startup recovery of interrupted documents failed:', error);
  }
}
