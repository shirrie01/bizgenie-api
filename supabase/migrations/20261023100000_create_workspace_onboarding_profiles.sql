-- BG-STUDIO-010-BE: durable, server-owned onboarding profile per workspace (tenant + project + brand).
-- Separate from brand_brains on purpose: saving preferences must not change Brand Brain content, version
-- or updated_at (campaign snapshots capture those). Grants no browser, service-role, billing or provider access.

begin;

create table if not exists public.workspace_onboarding_profiles (
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  profile_version integer not null check (profile_version >= 1),
  status text not null check (status in ('in_progress','completed')),
  sector_key text check (sector_key in ('leasing','perfume','aesthetics','beverage','charity','takeaway','neutral')),
  sector_source text check (sector_source in ('customer','inferred')),
  industry_text text check (industry_text is null or length(industry_text) between 1 and 200),
  channels jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array' and jsonb_array_length(channels) <= 6),
  channels_source text check (channels_source in ('customer','inferred')),
  current_step smallint check (current_step is null or current_step between 0 and 20),
  draft jsonb not null default '{}'::jsonb check (jsonb_typeof(draft) = 'object' and length(draft::text) <= 12000),
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  updated_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  last_idempotency_key text not null check (length(last_idempotency_key) between 1 and 128 and last_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  last_request_hash text not null check (last_request_hash ~ '^[a-f0-9]{64}$'),
  primary key (tenant_id, project_id, brand_id),
  constraint workspace_onboarding_profiles_brand_fkey
    foreign key (project_id, brand_id)
    references public.brand_brains (project_id, brand_id) on delete restrict,
  constraint workspace_onboarding_sector_source_pair
    check ((sector_key is null) = (sector_source is null)),
  constraint workspace_onboarding_channels_source_pair
    check ((jsonb_array_length(channels) = 0) = (channels_source is null)),
  constraint workspace_onboarding_completed_consistent
    check ((status = 'completed') = (completed_at is not null)),
  constraint workspace_onboarding_completed_requires_answers
    check (status <> 'completed' or (sector_key is not null and jsonb_array_length(channels) > 0))
);

do $$
declare grantee text;
begin
  alter table public.workspace_onboarding_profiles enable row level security;
  revoke all on table public.workspace_onboarding_profiles from public;
  foreach grantee in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = grantee) then
      execute format('revoke all on table public.workspace_onboarding_profiles from %I', grantee);
    end if;
  end loop;
end $$;

comment on table public.workspace_onboarding_profiles is
  'Server-owned onboarding progress, sector and channel preferences; customer access is mediated by bizgenie-api.';

commit;
