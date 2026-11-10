import type { Pool, QueryResultRow } from 'pg';
import type { Chunk, ChunkRepository } from './contracts';

interface ChunkRow extends QueryResultRow {
  id: string;
  document_id: string;
  version_id: string;
  page: number;
  position: number;
  text: string;
  embedding: string;
}

// pgvector reads and writes vectors as text like '[0.1,0.2]'.
function toVectorText(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}

function fromVectorText(text: string): number[] {
  return JSON.parse(text) as number[];
}

function toChunk(row: ChunkRow): Chunk {
  return {
    id: row.id,
    documentId: row.document_id,
    versionId: row.version_id,
    page: row.page,
    position: row.position,
    text: row.text,
    embedding: fromVectorText(row.embedding),
  };
}

export function createPostgresChunkRepository(pool: Pool): ChunkRepository {
  return {
    async save(documentId, versionId, chunks) {
      if (chunks.length === 0) return;
      // One transaction: a version never keeps only part of its chunks.
      // RAG note: the embedding is stored in the same row as its text, so a vector
      // search that finds a chunk also returns the text and page to cite.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const chunk of chunks) {
          await client.query(
            `INSERT INTO chunks (document_id, version_id, page, position, text, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)`,
            [
              documentId,
              versionId,
              chunk.page,
              chunk.position,
              chunk.text,
              toVectorText(chunk.embedding),
            ],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async findByVersion(versionId) {
      const result = await pool.query<ChunkRow>(
        `SELECT id, document_id, version_id, page, position, text, embedding::text AS embedding
         FROM chunks WHERE version_id = $1 ORDER BY page, position`,
        [versionId],
      );
      return result.rows.map(toChunk);
    },
  };
}
