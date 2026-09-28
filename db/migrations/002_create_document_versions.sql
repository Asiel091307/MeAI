CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, id)
);

ALTER TABLE public.documents
  ADD COLUMN active_version_id uuid,
  ADD CONSTRAINT documents_active_version_fk
    FOREIGN KEY (id, active_version_id)
    REFERENCES public.document_versions (document_id, id)
    DEFERRABLE INITIALLY DEFERRED;
