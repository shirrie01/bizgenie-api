create schema if not exists paid_beta_private;
revoke all on schema paid_beta_private from public;

create table if not exists public.paid_beta_interests (
  interest_id uuid primary key,
  name text not null,
  work_email text not null,
  business_name text not null,
  website_or_social_profile text not null,
  business_stage text not null,
  primary_marketing_challenge text not null,
  source text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint paid_beta_interests_email_unique unique (work_email),
  constraint paid_beta_interests_name_bounds check (
    name = btrim(name) and length(name) between 1 and 120
  ),
  constraint paid_beta_interests_email_bounds check (
    work_email = lower(btrim(work_email))
    and length(work_email) between 3 and 254
    and work_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint paid_beta_interests_business_name_bounds check (
    business_name = btrim(business_name) and length(business_name) between 1 and 160
  ),
  constraint paid_beta_interests_profile_bounds check (
    website_or_social_profile = btrim(website_or_social_profile)
    and length(website_or_social_profile) between 1 and 2048
    and website_or_social_profile ~ '^https?://'
  ),
  constraint paid_beta_interests_stage_allowed check (
    business_stage in ('pre-revenue', 'under-250k', '250k-1m', '1m-5m', '5m-plus')
  ),
  constraint paid_beta_interests_challenge_bounds check (
    primary_marketing_challenge = btrim(primary_marketing_challenge)
    and length(primary_marketing_challenge) between 1 and 1000
  ),
  constraint paid_beta_interests_source_bounds check (
    length(source) between 1 and 64
    and source ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  constraint paid_beta_interests_timestamp_order check (updated_at >= created_at)
);

create table if not exists public.paid_beta_interest_receipts (
  receipt_id uuid primary key,
  reference_id text not null,
  interest_id uuid not null references public.paid_beta_interests (interest_id),
  submission_identity text not null,
  request_fingerprint character(64) not null,
  consent_version text not null,
  consent_wording text not null,
  consented_at timestamptz not null,
  source text not null,
  created_at timestamptz not null default current_timestamp,
  constraint paid_beta_interest_receipts_reference_unique unique (reference_id),
  constraint paid_beta_interest_receipts_submission_unique unique (submission_identity),
  constraint paid_beta_interest_receipts_reference_format check (
    reference_id ~ '^pbi_[A-Za-z0-9_-]{24}$'
  ),
  constraint paid_beta_interest_receipts_submission_bounds check (
    length(submission_identity) between 1 and 128
    and submission_identity ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint paid_beta_interest_receipts_fingerprint_format check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint paid_beta_interest_receipts_consent_bounds check (
    length(consent_version) between 1 and 64
    and length(consent_wording) between 1 and 500
  ),
  constraint paid_beta_interest_receipts_source_bounds check (
    length(source) between 1 and 64
    and source ~ '^[a-z0-9][a-z0-9._:-]*$'
  ),
  constraint paid_beta_interest_receipts_consent_time check (consented_at = created_at)
);

create table if not exists public.paid_beta_rate_limit_buckets (
  client_hash character(64) not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  primary key (client_hash, window_started_at),
  constraint paid_beta_rate_limit_hash_format check (client_hash ~ '^[a-f0-9]{64}$'),
  constraint paid_beta_rate_limit_attempt_bounds check (attempt_count between 1 and 100000),
  constraint paid_beta_rate_limit_window check (
    expires_at > window_started_at and updated_at >= created_at
  )
);

create index if not exists paid_beta_interests_created_idx
  on public.paid_beta_interests (created_at desc);
create index if not exists paid_beta_interest_receipts_interest_created_idx
  on public.paid_beta_interest_receipts (interest_id, created_at desc);
create index if not exists paid_beta_rate_limit_expiry_idx
  on public.paid_beta_rate_limit_buckets (expires_at);

create or replace function paid_beta_private.reject_interest_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, paid_beta_private
as $$
begin
  raise exception 'Paid-beta interest and consent evidence is append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists protect_paid_beta_interests on public.paid_beta_interests;
create trigger protect_paid_beta_interests
before update or delete on public.paid_beta_interests
for each row execute function paid_beta_private.reject_interest_mutation();

drop trigger if exists protect_paid_beta_interest_receipts
  on public.paid_beta_interest_receipts;
create trigger protect_paid_beta_interest_receipts
before update or delete on public.paid_beta_interest_receipts
for each row execute function paid_beta_private.reject_interest_mutation();

alter table public.paid_beta_interests enable row level security;
alter table public.paid_beta_interest_receipts enable row level security;
alter table public.paid_beta_rate_limit_buckets enable row level security;

revoke all on table public.paid_beta_interests from public;
revoke all on table public.paid_beta_interest_receipts from public;
revoke all on table public.paid_beta_rate_limit_buckets from public;
revoke all on function paid_beta_private.reject_interest_mutation() from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table public.paid_beta_interests from %I', role_name);
      execute format('revoke all on table public.paid_beta_interest_receipts from %I', role_name);
      execute format('revoke all on table public.paid_beta_rate_limit_buckets from %I', role_name);
      execute format(
        'revoke all on function paid_beta_private.reject_interest_mutation() from %I',
        role_name
      );
    end if;
  end loop;
end;
$$;

comment on table public.paid_beta_interests is
  'Server-only canonical paid-beta follow-up records; no Auth, Billing, tenant, generation, or public read authority.';
comment on table public.paid_beta_interest_receipts is
  'Append-only public submission receipt and consent evidence; writes are mediated by bizgenie-api.';
comment on table public.paid_beta_rate_limit_buckets is
  'Short-lived HMAC-pseudonymized public endpoint abuse buckets; raw network addresses are not stored.';
