create table if not exists public.brand_brains (
  brand_id text primary key,
  project_id text not null,
  name text not null,
  identity jsonb,
  voice jsonb,
  audience jsonb,
  commercial jsonb,
  competitors jsonb,
  visual jsonb,
  version integer not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint brand_brains_brand_id_format check (
    length(brand_id) between 1 and 128
    and brand_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint brand_brains_project_id_format check (
    length(project_id) between 1 and 128
    and project_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint brand_brains_name_length check (length(name) between 1 and 200),
  constraint brand_brains_version_positive check (version between 1 and 1000000),
  constraint brand_brains_status_allowed check (
    status in ('draft', 'approved', 'archived')
  ),
  constraint brand_brains_identity_object check (
    identity is null or jsonb_typeof(identity) = 'object'
  ),
  constraint brand_brains_voice_object check (
    voice is null or jsonb_typeof(voice) = 'object'
  ),
  constraint brand_brains_audience_object check (
    audience is null or jsonb_typeof(audience) = 'object'
  ),
  constraint brand_brains_commercial_object check (
    commercial is null or jsonb_typeof(commercial) = 'object'
  ),
  constraint brand_brains_competitors_object check (
    competitors is null or jsonb_typeof(competitors) = 'object'
  ),
  constraint brand_brains_visual_object check (
    visual is null or jsonb_typeof(visual) = 'object'
  )
);

create index if not exists brand_brains_project_brand_idx
  on public.brand_brains (project_id, brand_id);

create or replace function public.protect_brand_brain_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'brand brain project ownership is immutable'
      using errcode = '23514';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'brand brain creation timestamp is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_brand_brain_ownership on public.brand_brains;
create trigger protect_brand_brain_ownership
before update on public.brand_brains
for each row execute function public.protect_brand_brain_ownership();

alter table public.brand_brains enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.brand_brains from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.brand_brains from authenticated;
  end if;
end;
$$;

comment on table public.brand_brains is
  'Server-only canonical V1 Brand Brain records; access is mediated by bizgenie-api.';
