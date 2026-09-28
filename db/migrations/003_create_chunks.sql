CREATE TABLE public.chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  page integer NOT NULL CHECK (page > 0),
  position integer NOT NULL CHECK (position > 0),
  text text NOT NULL CHECK (btrim(text) <> ''),
  CONSTRAINT chunks_document_version_fk
    FOREIGN KEY (document_id, version_id)
    REFERENCES public.document_versions (document_id, id) ON DELETE CASCADE,
  UNIQUE (version_id, page, position)
);
