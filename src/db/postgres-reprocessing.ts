import type { Pool } from 'pg';
import type { DocumentReprocessingRepository, StartReprocessingResult } from './contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPostgresReprocessingRepository(pool: Pool): DocumentReprocessingRepository {
  return {
    async startReprocessing(documentId): Promise<StartReprocessingResult> {
      // A malformed id cannot exist: answer without touching the database.
      if (!UUID_PATTERN.test(documentId)) {
        return 'not_found';
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // The row lock makes two simultaneous starts see each other: only one gets 'started'.
        const found = await client.query<{ status: string }>(
          'SELECT status FROM documents WHERE id = $1 FOR UPDATE',
          [documentId],
        );
        let result: StartReprocessingResult;
        if (found.rows.length === 0) {
          result = 'not_found';
        } else if (found.rows[0].status === 'processing') {
          result = 'already_processing';
        } else {
          // active_version_id is kept so a failure can restore it; 'processing' hides it from queries.
          await client.query(
            `UPDATE documents SET status = 'processing', error = NULL WHERE id = $1`,
            [documentId],
          );
          result = 'started';
        }
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
