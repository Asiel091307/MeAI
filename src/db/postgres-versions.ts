import type { Pool, QueryResultRow } from 'pg';
import type { DocumentVersion, DocumentVersionRepository, VersionStatus } from './contracts';

interface DocumentVersionRow extends QueryResultRow {
  id: string;
  document_id: string;
  status: VersionStatus;
  created_at: Date;
}

export function createPostgresVersionRepository(pool: Pool): DocumentVersionRepository {
  return {
    async create(documentId) {
      // The status column defaults to 'processing': a new attempt is never active yet.
      const result = await pool.query<DocumentVersionRow>(
        `INSERT INTO document_versions (document_id)
         VALUES ($1)
         RETURNING id, document_id, status, created_at`,
        [documentId],
      );
      const row = result.rows[0];
      const version: DocumentVersion = {
        id: row.id,
        documentId: row.document_id,
        status: row.status,
        createdAt: row.created_at,
      };
      return version;
    },
  };
}
