import type { Pool } from 'pg';
import type { ChunkSearchRepository, RetrievedChunk } from '../rag/retrieval/contracts';

// pgvector's `<=>` operator is cosine distance: 0 = same direction, 2 = opposite.
// RAG beginners think in "similarity" (higher = closer), so score = 1 - distance.
// Only the active version of an 'available' document is searched, so documents that are
// processing or failed, and old versions, never reach an answer (RF-3, RF-9).
const SEARCH_SQL = `
  SELECT c.id AS chunk_id,
         c.document_id,
         c.page,
         c.text,
         1 - (c.embedding <=> $1::vector) AS score
  FROM chunks c
  JOIN documents d
    ON d.active_version_id = c.version_id
   AND d.status = 'available'
  ORDER BY c.embedding <=> $1::vector
  LIMIT $2`;

interface SearchRow {
  chunk_id: string;
  document_id: string;
  page: number;
  text: string;
  score: number | string;
}

export function createPostgresSearchRepository(pool: Pool): ChunkSearchRepository {
  return {
    async searchSimilar(queryVector, topK) {
      if (!Number.isInteger(topK) || topK <= 0) {
        throw new Error(`topK must be a positive integer, received ${topK}.`);
      }
      const result = await pool.query<SearchRow>(SEARCH_SQL, [
        `[${queryVector.join(',')}]`,
        topK,
      ]);
      return result.rows.map(
        (row): RetrievedChunk => ({
          chunkId: row.chunk_id,
          documentId: row.document_id,
          page: row.page,
          text: row.text,
          score: Number(row.score),
        }),
      );
    },
  };
}
