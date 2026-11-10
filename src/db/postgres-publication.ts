import type { Pool, PoolClient } from 'pg';
import type { DocumentPublicationRepository } from './contracts';

// Runs the work in one transaction: all changes are applied together or none is.
async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Chunks go first because they reference the version row.
async function deleteVersion(client: PoolClient, documentId: string, versionId: string): Promise<void> {
  await client.query('DELETE FROM chunks WHERE document_id = $1 AND version_id = $2', [
    documentId,
    versionId,
  ]);
  await client.query('DELETE FROM document_versions WHERE document_id = $1 AND id = $2', [
    documentId,
    versionId,
  ]);
}

// Locks the document row so two publications of the same document cannot interleave.
async function lockActiveVersionId(client: PoolClient, documentId: string): Promise<string | null> {
  const result = await client.query<{ active_version_id: string | null }>(
    'SELECT active_version_id FROM documents WHERE id = $1 FOR UPDATE',
    [documentId],
  );
  if (result.rows.length === 0) {
    throw new Error(`Document ${documentId} does not exist.`);
  }
  return result.rows[0].active_version_id;
}

export function createPostgresPublicationRepository(pool: Pool): DocumentPublicationRepository {
  return {
    async publish(documentId, versionId) {
      await inTransaction(pool, async (client) => {
        const previousVersionId = await lockActiveVersionId(client, documentId);

        const completed = await client.query(
          `UPDATE document_versions SET status = 'complete'
           WHERE id = $1 AND document_id = $2 AND status = 'processing'`,
          [versionId, documentId],
        );
        if (completed.rowCount !== 1) {
          throw new Error(`Version ${versionId} is not a processing version of document ${documentId}.`);
        }

        await client.query(
          `UPDATE documents
           SET active_version_id = $2, status = 'available', error = NULL
           WHERE id = $1`,
          [documentId, versionId],
        );

        // Only the new version stays queryable: the previous one is removed in the same transaction.
        if (previousVersionId !== null && previousVersionId !== versionId) {
          await deleteVersion(client, documentId, previousVersionId);
        }
      });
    },

    async fail(documentId, versionId, reason) {
      await inTransaction(pool, async (client) => {
        const activeVersionId = await lockActiveVersionId(client, documentId);
        await deleteVersion(client, documentId, versionId);
        // A previous active version keeps serving queries; the error tells the user the new attempt failed.
        const status = activeVersionId === null ? 'failed' : 'available';
        await client.query('UPDATE documents SET status = $2, error = $3 WHERE id = $1', [
          documentId,
          status,
          reason,
        ]);
      });
    },

    async recoverInterrupted(reason) {
      return inTransaction(pool, async (client) => {
        const interrupted = await client.query<{ id: string; active_version_id: string | null }>(
          `SELECT id, active_version_id FROM documents
           WHERE status = 'processing' ORDER BY created_at, id FOR UPDATE`,
        );
        const ids = interrupted.rows.map((row) => row.id);
        if (ids.length === 0) {
          return { failed: [], restored: [] };
        }

        await client.query(
          `DELETE FROM chunks WHERE version_id IN (
             SELECT id FROM document_versions WHERE document_id = ANY($1) AND status = 'processing')`,
          [ids],
        );
        await client.query(
          `DELETE FROM document_versions WHERE document_id = ANY($1) AND status = 'processing'`,
          [ids],
        );

        const failed: string[] = [];
        const restored: string[] = [];
        for (const { id, active_version_id: activeVersionId } of interrupted.rows) {
          const hasPreviousVersion = activeVersionId !== null;
          await client.query('UPDATE documents SET status = $2, error = $3 WHERE id = $1', [
            id,
            hasPreviousVersion ? 'available' : 'failed',
            reason,
          ]);
          (hasPreviousVersion ? restored : failed).push(id);
        }
        return { failed, restored };
      });
    },
  };
}
