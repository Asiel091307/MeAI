-- T26: every chunk stores the embedding of its text.
-- 1536 dimensions = gemini-embedding-001 with outputDimensionality 1536 (docs/specs/002-proveedores-ia).
-- NOT NULL: a chunk without its vector could never be found by semantic search.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.chunks
  ADD COLUMN embedding vector(1536) NOT NULL;
