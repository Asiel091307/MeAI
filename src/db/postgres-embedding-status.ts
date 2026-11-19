import type { Pool } from 'pg';

// Counts 'available' documents whose active version was embedded with another model or, when
// `dimensions` is a number, with another vector size. Search skips those documents, so the
// interface can tell the user they need to be reindexed.
export async function countDocumentsWithOtherModel(
  pool: Pool,
  embeddingModel: string,
  dimensions: number | null,
): Promise<number> {
  const result = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM documents d
     JOIN document_versions v ON v.id = d.active_version_id
     WHERE d.status = 'available'
       AND (v.embedding_model IS DISTINCT FROM $1::text
            OR ($2::integer IS NOT NULL AND v.embedding_dimensions IS DISTINCT FROM $2::integer))`,
    [embeddingModel, dimensions],
  );
  return result.rows[0].total;
}
