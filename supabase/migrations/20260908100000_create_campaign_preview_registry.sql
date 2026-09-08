-- BG-LAUNCH-002I-C: durable, server-owned preview registry.
-- This migration adds trusted preview profile and render-receipt storage only.
-- It grants no customer, Data API, service-role, provider, Billing, or publishing access.

begin;

create table if not exists public.campaign_preview_profiles (
  profile_id text not null check (length(profile_id) between 1 and 128 and profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  profile_version integer not null check (profile_version between 1 and 2147483647),
  platform text not null check (platform in ('linkedin','instagram','facebook','tiktok','youtube','email','other')),
  placement text not null check (length(placement) between 1 and 128 and placement ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  format text not null check (format in ('text','image','video')),
  renderer_version text not null check (length(renderer_version) between 1 and 128 and renderer_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  profile_hash text not null check (profile_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  primary key (profile_id, profile_version),
  constraint campaign_preview_profiles_hash_unique unique (profile_hash)
);

create unique index if not exists campaign_preview_profiles_active_unique
  on public.campaign_preview_profiles (platform, placement, format)
  where status = 'active';

insert into public.campaign_preview_profiles
  (profile_id, profile_version, platform, placement, format, renderer_version, profile_hash, status)
values
  ('instagram.feed.text', 1, 'instagram', 'feed', 'text', 'bizgenie-preview-renderer.v1', '79e833851c260be5059c99c4cde39b616c9635c84e4da92a292c294dd00766c1', 'active'),
  ('instagram.feed.image', 1, 'instagram', 'feed', 'image', 'bizgenie-preview-renderer.v1', 'eb0a35402ac0f5b4b5e3b03a02da6dad6a576a3573b31d909f9cef475408c145', 'active'),
  ('facebook.feed.text', 1, 'facebook', 'feed', 'text', 'bizgenie-preview-renderer.v1', '2206c872fbcf10621d55a8e325c8bb3e941f3a7cfcc16243a567dc4a1edbd605', 'active'),
  ('linkedin.feed.text', 1, 'linkedin', 'feed', 'text', 'bizgenie-preview-renderer.v1', '22c616c759d354dc505e8c7dc11cd59bc15a9a1d42461b1faa64c9df98d16ab3', 'active'),
  ('tiktok.feed.video', 1, 'tiktok', 'feed', 'video', 'bizgenie-preview-renderer.v1', '3b2a259e1f10c534704d38659bf55201a457b186fac19345536ea47b16c86167', 'active'),
  ('youtube.shorts.video', 1, 'youtube', 'shorts', 'video', 'bizgenie-preview-renderer.v1', '689fb7bc5abcea975d92c767ea16d279f96bdc2f1c96cb607671fc45497e58ac', 'active'),
  ('email.message.text', 1, 'email', 'message', 'text', 'bizgenie-preview-renderer.v1', '29969fa9fe8e1979779dbb673bb176a112351ce22e1f7c5fcbd462dc8ef44d3b', 'active')
on conflict (profile_id, profile_version) do nothing;

create table if not exists public.campaign_preview_render_receipts (
  render_receipt_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  campaign_id uuid not null,
  content_item_id uuid not null,
  variant_id uuid not null,
  revision_id uuid not null,
  revision_content_hash text not null check (revision_content_hash ~ '^[a-f0-9]{64}$'),
  profile_id text not null,
  profile_version integer not null,
  profile_hash text not null check (profile_hash ~ '^[a-f0-9]{64}$'),
  platform text not null check (platform in ('linkedin','instagram','facebook','tiktok','youtube','email','other')),
  placement text not null check (length(placement) between 1 and 128 and placement ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  format text not null check (format in ('text','image','video')),
  renderer_version text not null check (length(renderer_version) between 1 and 128 and renderer_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  render_input_hash text not null check (render_input_hash ~ '^[a-f0-9]{64}$'),
  preview_digest text not null check (preview_digest ~ '^[a-f0-9]{64}$'),
  rendered_at timestamptz not null,
  rendered_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  constraint campaign_preview_render_receipts_profile_fkey
    foreign key (profile_id, profile_version)
    references public.campaign_preview_profiles (profile_id, profile_version) on delete restrict,
  constraint campaign_preview_render_receipts_revision_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id)
    references public.campaign_revisions
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id) on delete restrict,
  constraint campaign_preview_render_receipts_identity_unique
    unique (tenant_id, project_id, rendered_by, campaign_id, variant_id, revision_id, idempotency_key)
);

create index if not exists campaign_preview_render_receipts_lookup_idx
  on public.campaign_preview_render_receipts (tenant_id, project_id, render_receipt_id);

do $$
declare relation_name text;
declare grantee text;
begin
  foreach relation_name in array array['campaign_preview_profiles','campaign_preview_render_receipts'] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on table public.%I from public', relation_name);
    foreach grantee in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = grantee) then
        execute format('revoke all on table public.%I from %I', relation_name, grantee);
      end if;
    end loop;
  end loop;
end $$;

comment on table public.campaign_preview_profiles is
  'Server-owned immutable preview profile registry; no direct Data API access.';
comment on table public.campaign_preview_render_receipts is
  'Server-owned preview render receipts used as the only trusted customer preview acknowledgement input.';

commit;
