create table if not exists public.media_assets (
  asset_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  generation_job_id text,
  generation_id text,
  source_kind text not null,
  media_kind text not null,
  storage_bucket text not null,
  storage_key text not null,
  mime_type text not null,
  width integer,
  height integer,
  duration_seconds numeric(6, 3),
  byte_size bigint,
  allowed_uses text[] not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default current_timestamp,
  constraint media_assets_project_tenant_fkey
    foreign key (project_id, tenant_id)
    references public.projects (project_id, tenant_id)
    on delete restrict,
  constraint media_assets_generation_authority_fkey
    foreign key (generation_job_id, tenant_id, project_id)
    references public.generation_jobs (job_id, tenant_id, project_id)
    on delete restrict,
  constraint media_assets_storage_unique unique (storage_bucket, storage_key),
  constraint media_assets_source_kind_allowed
    check (source_kind in ('generated', 'reference')),
  constraint media_assets_media_kind_allowed
    check (media_kind in ('image', 'video')),
  constraint media_assets_status_allowed
    check (status in ('active', 'revoked', 'deleted')),
  constraint media_assets_generated_authority_shape check (
    source_kind <> 'generated'
    or (generation_job_id is not null and generation_id is not null)
  ),
  constraint media_assets_storage_bucket_format check (
    length(storage_bucket) between 3 and 222
    and storage_bucket ~ '^[a-z0-9][a-z0-9._-]+[a-z0-9]$'
  ),
  constraint media_assets_storage_key_format check (
    storage_key ~ '^assets/[a-f0-9]{64}/[a-f0-9]{64}/(image|video)/[0-9a-f-]{36}\.[a-z0-9]+$'
  ),
  constraint media_assets_mime_kind check (
    (media_kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp'))
    or (media_kind = 'video' and mime_type = 'video/mp4')
  ),
  constraint media_assets_dimensions_positive check (
    (width is null or width > 0)
    and (height is null or height > 0)
    and (duration_seconds is null or duration_seconds > 0)
    and (byte_size is null or byte_size > 0)
  ),
  constraint media_assets_allowed_uses_bounded check (
    allowed_uses <@ array[
      'image.generate.reference',
      'video.generate.reference'
    ]::text[]
    and cardinality(allowed_uses) <= 2
  )
);

create index if not exists media_assets_tenant_project_asset_idx
  on public.media_assets (tenant_id, project_id, asset_id)
  where status = 'active';
create index if not exists media_assets_generation_job_idx
  on public.media_assets (generation_job_id)
  where generation_job_id is not null;
create index if not exists media_assets_allowed_uses_idx
  on public.media_assets using gin (allowed_uses);

create or replace function public.protect_media_asset_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.asset_id is distinct from old.asset_id
    or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.generation_job_id is distinct from old.generation_job_id
    or new.generation_id is distinct from old.generation_id
    or new.source_kind is distinct from old.source_kind
    or new.media_kind is distinct from old.media_kind
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_key is distinct from old.storage_key
    or new.mime_type is distinct from old.mime_type
    or new.width is distinct from old.width
    or new.height is distinct from old.height
    or new.duration_seconds is distinct from old.duration_seconds
    or new.byte_size is distinct from old.byte_size
    or new.created_at is distinct from old.created_at then
    raise exception 'media asset authority and storage identity are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_media_asset_authority on public.media_assets;
create trigger protect_media_asset_authority
before update on public.media_assets
for each row execute function public.protect_media_asset_authority();

alter table public.media_assets enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.media_assets from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.media_assets from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.media_assets from service_role;
  end if;
end;
$$;

comment on table public.media_assets is
  'Server-only durable Image/Video asset authority. Storage keys and generation ownership are immutable and never customer-selected.';
comment on column public.media_assets.allowed_uses is
  'Explicit server-owned rights allowlist checked before reference media is made provider-readable.';
