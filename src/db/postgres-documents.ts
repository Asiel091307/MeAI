import type { Pool, QueryResultRow } from 'pg';
import type { Document, DocumentRepository, DocumentStatus } from './contracts';

interface DocumentRow extends QueryResultRow {
  id: string;
  name: string;
  pdf_bytes: Buffer;
  status: DocumentStatus;
  error: string | null;
  active_version_id: string | null;
  created_at: Date;
}

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    name: row.name,
    pdfBytes: Uint8Array.from(row.pdf_bytes),
    status: row.status,
    error: row.error,
    activeVersionId: row.active_version_id,
    createdAt: row.created_at,
  };
}

export function createPostgresDocumentRepository(
  pool: Pool,
): Pick<DocumentRepository, 'create' | 'findById'> {
  return {
    async create({ name, pdfBytes }) {
      const result = await pool.query<DocumentRow>(
        `INSERT INTO documents (name, pdf_bytes)
         VALUES ($1, $2)
         RETURNING id, name, pdf_bytes, status, error, active_version_id, created_at`,
        [name, Buffer.from(pdfBytes)],
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
  };
}
