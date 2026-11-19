import type { Pool, QueryResultRow } from 'pg';
import type { DocumentVersion, DocumentVersionRepository, VersionStatus } from './contracts';

interface DocumentVersionRow extends QueryResultRow {
  id: string;
  document_id: string;
  status: VersionStatus;
  created_at: Date;
  embedding_model: string | null;
  embedding_dimensions: number | null;
}

export function createPostgresVersionRepository(pool: Pool): DocumentVersionRepository {
  return {
    async create(documentId, embeddingModel) {
      // The status column defaults to 'processing': a new attempt is never active yet.
      const result = await pool.query<DocumentVersionRow>(
        `INSERT INTO document_versions (document_id, embedding_model)
         VALUES ($1, $2)
         RETURNING id, document_id, status, created_at, embedding_model, embedding_dimensions`,
        [documentId, embeddingModel],
      );
      const row = result.rows[0];
      const version: DocumentVersion = {
        id: row.id,
        documentId: row.document_id,
        status: row.status,
        createdAt: row.created_at,
        embeddingModel: row.embedding_model,
        embeddingDimensions: row.embedding_dimensions,
      };
      return version;
    },
  };
}
