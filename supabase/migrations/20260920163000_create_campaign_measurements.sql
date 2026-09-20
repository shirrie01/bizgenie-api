create table if not exists public.campaign_measurements (
  measurement_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  campaign_id uuid not null,
  content_item_id uuid not null,
  variant_id uuid not null,
  publication_id uuid not null,
  metric text not null check (metric in ('reach','views','impressions','clicks','enquiries','leads','conversions','sales','revenue','value')),
  value numeric not null check (value >= 0 and value <= 1000000000000000),
  unit text not null check (unit in ('count','gbp','usd','eur','percent','other')),
  observed_at timestamptz not null,
  evidence_kind text not null check (evidence_kind = 'customer_attestation'),
  note text check (note is null or length(trim(note)) between 1 and 1000),
  recorded_at timestamptz not null,
  recorded_by uuid not null references public.customer_profiles(auth_user_id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  intent jsonb not null check (jsonb_typeof(intent)='object'),
  constraint campaign_measurements_publication_fkey foreign key
    (tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,publication_id)
    references public.campaign_publications
    (tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,publication_id)
    on delete restrict,
  constraint campaign_measurements_observed_order check (observed_at <= recorded_at),
  constraint campaign_measurements_idempotency_unique unique (tenant_id,project_id,recorded_by,idempotency_key)
);

alter table public.campaign_measurements enable row level security;
alter table public.campaign_measurements force row level security;
revoke all on table public.campaign_measurements from public, anon, authenticated, service_role;
