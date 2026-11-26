BEGIN;

CREATE TABLE public.early_access_leads (
  id uuid PRIMARY KEY,
  work_email text NOT NULL UNIQUE,
  profile jsonb NOT NULL,
  intention text NOT NULL CHECK (intention IN ('early_access', 'founding_customer')),
  received_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  preview_draft jsonb,
  CHECK (expires_at > received_at)
);
CREATE INDEX early_access_leads_expiry ON public.early_access_leads (expires_at);

CREATE TABLE public.early_access_receipts (
  submission_id text PRIMARY KEY,
  reference_id text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.early_access_leads(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  intention text NOT NULL CHECK (intention IN ('early_access', 'founding_customer')),
  marketing_consent boolean NOT NULL,
  consent jsonb NOT NULL,
  attribution jsonb NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE INDEX early_access_receipts_lead ON public.early_access_receipts (lead_id);

CREATE TABLE public.early_access_rate_buckets (
  client_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (client_hash, window_start)
);
CREATE INDEX early_access_rate_expiry ON public.early_access_rate_buckets (expires_at);

ALTER TABLE public.early_access_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.early_access_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.early_access_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.early_access_leads, public.early_access_receipts,
  public.early_access_rate_buckets FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
