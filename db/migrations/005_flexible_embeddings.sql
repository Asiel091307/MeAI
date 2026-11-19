-- T012-04: embeddings may come from any model, so the vector size is no longer fixed.
-- Each version records the model and the dimensions its chunks were embedded with, so search
-- can ignore versions that do not match the current model.
-- Everything indexed before this migration used gemini-embedding-001 with 1536 dimensions.
ALTER TABLE public.chunks
  ALTER COLUMN embedding TYPE vector;

ALTER TABLE public.document_versions
  ADD COLUMN embedding_model text,
  ADD COLUMN embedding_dimensions integer;

UPDATE public.document_versions
   SET embedding_model = 'gemini-embedding-001',
       embedding_dimensions = 1536;
