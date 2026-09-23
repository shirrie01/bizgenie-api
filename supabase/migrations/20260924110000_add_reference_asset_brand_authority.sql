-- Issue #123: brand-bound customer reference asset authority.
-- Additive only. Existing generated assets retain GenerationJob-derived brand authority.
-- Existing unbound reference assets remain stored but fail closed for brand-bound lookup.

alter table public.media_assets
  add column if not exists brand_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.media_assets'::regclass
       and conname = 'media_assets_reference_brand_fkey'
  ) then
    alter table public.media_assets
      add constraint media_assets_reference_brand_fkey
      foreign key (project_id, brand_id)
      references public.brand_brains (project_id, brand_id)
      on delete restrict;
  end if;
end $$;

create index if not exists media_assets_reference_brand_idx
  on public.media_assets (tenant_id, project_id, brand_id, asset_id)
  where status = 'active' and source_kind = 'reference' and brand_id is not null;

create or replace function public.protect_media_asset_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.asset_id is distinct from old.asset_id
    or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.brand_id is distinct from old.brand_id
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

comment on column public.media_assets.brand_id is
  'Immutable server-owned brand binding for customer/reference assets. Generated asset brand authority remains GenerationJob-derived.';
