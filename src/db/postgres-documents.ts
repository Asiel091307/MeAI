import type { Pool, QueryResultRow } from 'pg';
import type {
  Document,
  DocumentMetadata,
  DocumentRepository,
  DocumentStatus,
} from './contracts';

interface DocumentMetadataRow extends QueryResultRow {
  id: string;
  name: string;
  status: DocumentStatus;
  error: string | null;
  active_version_id: string | null;
  created_at: Date;
}

interface DocumentRow extends DocumentMetadataRow {
  pdf_bytes: Buffer;
}

function toDocumentMetadata(row: DocumentMetadataRow): DocumentMetadata {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    error: row.error,
    activeVersionId: row.active_version_id,
    createdAt: row.created_at,
  };
}

function toDocument(row: DocumentRow): Document {
  return { ...toDocumentMetadata(row), pdfBytes: Uint8Array.from(row.pdf_bytes) };
}

export function createPostgresDocumentRepository(
  pool: Pool,
): Pick<DocumentRepository, 'create' | 'findById' | 'list' | 'delete'> {
  return {
    async create({ name, pdfBytes, status = 'processing', error = null }) {
      const result = await pool.query<DocumentRow>(
        `INSERT INTO documents (name, pdf_bytes, status, error)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, pdf_bytes, status, error, active_version_id, created_at`,
        [name, Buffer.from(pdfBytes), status, error],
      );
      return toDocument(result.rows[0]);
    },
    async findById(id) {
      const result = await pool.query<DocumentRow>(
        `SELECT id, name, pdf_bytes, status, error, active_version_id, created_at
         FROM documents WHERE id = $1`,
        [id],
      );
      return result.rows[0] ? toDocument(result.rows[0]) : null;
    },
    async list() {
      // pdf_bytes is never selected: listing exposes metadata only.
      const result = await pool.query<DocumentMetadataRow>(
        `SELECT id, name, status, error, active_version_id, created_at
         FROM documents ORDER BY created_at, id`,
      );
      return result.rows.map(toDocumentMetadata);
    },
    async delete(id) {
      // One transaction: either the document and everything derived from it
      // disappear together, or nothing changes.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Dependency order: chunks (text and, later, embeddings) first,
        // then the versions that own them, then the document with its PDF.
        await client.query('DELETE FROM chunks WHERE document_id = $1', [id]);
        await client.query('DELETE FROM document_versions WHERE document_id = $1', [id]);
        const result = await client.query('DELETE FROM documents WHERE id = $1', [id]);
        await client.query('COMMIT');
        return (result.rowCount ?? 0) > 0;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
