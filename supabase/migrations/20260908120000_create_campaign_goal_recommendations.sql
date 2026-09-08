-- BG-LAUNCH-002I-E: durable, server-owned goal recommendation receipts.
-- This migration stores authenticated recommendation outputs only. It grants
-- no browser, service-role, Billing, publishing, or provider access.

begin;

create table if not exists public.campaign_goal_recommendations (
  recommendation_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  requested_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  goal text not null check (length(goal) between 1 and 2000),
  display_timezone text not null check (length(display_timezone) between 1 and 255),
  campaign_name text not null check (length(campaign_name) between 1 and 200),
  recommendation_kind text not null check (recommendation_kind in ('launch','offer','lead','awareness')),
  summary text not null check (length(summary) between 1 and 1000),
  not_enough_data_yet boolean not null,
  explanation text not null check (length(explanation) between 1 and 1000),
  next_action jsonb not null check (jsonb_typeof(next_action) = 'object'),
  create_campaign_payload jsonb not null check (jsonb_typeof(create_campaign_payload) = 'object'),
  suggested_items jsonb not null check (jsonb_typeof(suggested_items) = 'array'),
  recommendation_hash text not null check (recommendation_hash ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz not null,
  constraint campaign_goal_recommendations_brand_fkey
    foreign key (project_id, brand_id)
    references public.brand_brains (project_id, brand_id) on delete restrict,
  constraint campaign_goal_recommendations_identity_unique
    unique (tenant_id, project_id, requested_by, brand_id, idempotency_key)
);

create index if not exists campaign_goal_recommendations_lookup_idx
  on public.campaign_goal_recommendations (tenant_id, project_id, requested_by, generated_at desc);

do $$
declare grantee text;
begin
  alter table public.campaign_goal_recommendations enable row level security;
  revoke all on table public.campaign_goal_recommendations from public;
  foreach grantee in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = grantee) then
      execute format('revoke all on table public.campaign_goal_recommendations from %I', grantee);
    end if;
  end loop;
end $$;

comment on table public.campaign_goal_recommendations is
  'Server-owned I-E goal recommendation receipts; customer access is mediated by bizgenie-api.';

commit;
