CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pdf_bytes bytea NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'available', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
