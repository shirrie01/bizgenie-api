-- BG-LAUNCH-002I-B: additive, server-owned campaign-spine persistence.
-- This migration creates empty relations only. It performs no legacy backfill and
-- grants no customer, Data API, service-role, provider, Billing, or publishing access.

begin;
create schema if not exists campaign_private;
revoke all on schema campaign_private from public;

create table if not exists public.campaign_brand_snapshots (
  brand_snapshot_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  source_version integer not null check (source_version between 1 and 1000000),
  source_updated_at timestamptz not null,
  source_schema_version text not null check (source_schema_version = 'brand-brain.v1'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null,
  constraint campaign_brand_snapshots_project_tenant_fkey
    foreign key (project_id, tenant_id)
    references public.projects (project_id, tenant_id) on delete restrict,
  constraint campaign_brand_snapshots_project_brand_fkey
    foreign key (project_id, brand_id)
    references public.brand_brains (project_id, brand_id) on delete restrict,
  constraint campaign_brand_snapshots_owner_unique
    unique (tenant_id, project_id, brand_id, brand_snapshot_id),
  constraint campaign_brand_snapshots_source_unique
    unique (tenant_id, project_id, brand_id, source_version, snapshot_hash)
);

create table if not exists public.campaigns (
  campaign_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  name text not null check (length(trim(name)) between 1 and 200),
  goal text not null check (length(goal) between 1 and 2000),
  initial_brand_snapshot_id uuid not null,
  display_timezone text not null check (length(display_timezone) between 1 and 255),
  version integer not null check (version between 1 and 2147483647),
  last_event_sequence integer not null check (last_event_sequence between 1 and 2147483647),
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaigns_project_tenant_fkey foreign key (project_id, tenant_id)
    references public.projects (project_id, tenant_id) on delete restrict,
  constraint campaigns_project_brand_fkey foreign key (project_id, brand_id)
    references public.brand_brains (project_id, brand_id) on delete restrict,
  constraint campaigns_initial_snapshot_fkey
    foreign key (tenant_id, project_id, brand_id, initial_brand_snapshot_id)
    references public.campaign_brand_snapshots
      (tenant_id, project_id, brand_id, brand_snapshot_id) on delete restrict,
  constraint campaigns_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id),
  constraint campaigns_tenant_project_id_unique
    unique (tenant_id, project_id, campaign_id),
  constraint campaigns_time_order check (updated_at >= created_at)
);

create table if not exists public.campaign_content_items (
  content_item_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  campaign_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 200),
  format text not null check (format in ('text', 'image', 'video')),
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_content_items_campaign_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id)
    references public.campaigns (tenant_id, project_id, brand_id, campaign_id)
    on delete restrict,
  constraint campaign_content_items_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id),
  constraint campaign_content_items_time_order check (updated_at >= created_at)
);

create table if not exists public.campaign_platform_variants (
  variant_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  campaign_id uuid not null,
  content_item_id uuid not null,
  platform text not null check (platform in ('linkedin','instagram','facebook','tiktok','youtube','email','other')),
  placement text not null check (length(placement) between 1 and 128 and placement ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  destination_key uuid not null,
  destination_label text not null check (length(trim(destination_label)) between 1 and 200),
  workflow text not null check (workflow in ('draft','review','approved','scheduled','published')),
  current_revision_id uuid,
  active_approval_id uuid,
  active_schedule_id uuid,
  pending_attempt_id uuid,
  publication_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint campaign_platform_variants_item_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id)
    references public.campaign_content_items
      (tenant_id, project_id, brand_id, campaign_id, content_item_id) on delete restrict,
  constraint campaign_platform_variants_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id),
  constraint campaign_platform_variants_campaign_variant_unique
    unique (tenant_id, project_id, brand_id, campaign_id, variant_id),
  constraint campaign_platform_variants_destination_unique
    unique (content_item_id, platform, placement, destination_key),
  constraint campaign_platform_variants_time_order check (updated_at >= created_at),
  constraint campaign_platform_variants_pointer_shape check (
    (workflow in ('draft','review') and active_approval_id is null and active_schedule_id is null and publication_id is null)
    or (workflow = 'approved' and active_approval_id is not null and active_schedule_id is null and publication_id is null)
    or (workflow = 'scheduled' and active_approval_id is not null and active_schedule_id is not null and publication_id is null)
    or (workflow = 'published' and active_approval_id is null and active_schedule_id is null and pending_attempt_id is null and publication_id is not null)
  )
);

create table if not exists public.campaign_revisions (
  revision_id uuid primary key,
  tenant_id text not null,
  project_id text not null,
  brand_id text not null,
  campaign_id uuid not null,
  content_item_id uuid not null,
  variant_id uuid not null,
  revision_number integer not null check (revision_number between 1 and 2147483647),
  parent_revision_id uuid,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  brand_snapshot_id uuid not null,
  source text not null check (source in ('manual','generated_import')),
  generation_links jsonb not null default '[]'::jsonb check (jsonb_typeof(generation_links) = 'array' and jsonb_array_length(generation_links) <= 10),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  change_reason text not null check (length(trim(change_reason)) between 1 and 1000),
  created_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_revisions_variant_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id)
    references public.campaign_platform_variants
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id) on delete restrict,
  constraint campaign_revisions_snapshot_fkey
    foreign key (tenant_id, project_id, brand_id, brand_snapshot_id)
    references public.campaign_brand_snapshots
      (tenant_id, project_id, brand_id, brand_snapshot_id) on delete restrict,
  constraint campaign_revisions_number_unique unique (variant_id, revision_number),
  constraint campaign_revisions_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id),
  constraint campaign_revisions_parent_shape check ((revision_number = 1) = (parent_revision_id is null)),
  constraint campaign_revisions_source_shape check (source <> 'generated_import' or jsonb_array_length(generation_links) > 0)
);

alter table public.campaign_revisions
  drop constraint if exists campaign_revisions_parent_fkey;
alter table public.campaign_revisions
  add constraint campaign_revisions_parent_fkey
  foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, parent_revision_id)
  references public.campaign_revisions
    (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id)
  on delete restrict;

alter table public.campaign_platform_variants
  drop constraint if exists campaign_platform_variants_current_revision_fkey;
alter table public.campaign_platform_variants
  add constraint campaign_platform_variants_current_revision_fkey
  foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, current_revision_id)
  references public.campaign_revisions
    (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id)
  on delete restrict deferrable initially deferred;

create table if not exists public.campaign_preview_evidence (
  preview_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null,
  revision_content_hash text not null check (revision_content_hash ~ '^[a-f0-9]{64}$'),
  profile_id text not null check (length(profile_id) between 1 and 128 and profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  profile_version integer not null check (profile_version between 1 and 2147483647),
  profile_hash text not null check (profile_hash ~ '^[a-f0-9]{64}$'),
  platform text not null check (platform in ('linkedin','instagram','facebook','tiktok','youtube','email','other')),
  placement text not null,
  format text not null check (format in ('text','image','video')),
  renderer_version text not null,
  render_input_hash text not null check (render_input_hash ~ '^[a-f0-9]{64}$'),
  preview_digest text not null check (preview_digest ~ '^[a-f0-9]{64}$'),
  rendered_at timestamptz not null, observed_at timestamptz not null,
  observed_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_preview_evidence_revision_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id)
    references public.campaign_revisions
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id) on delete restrict,
  constraint campaign_preview_evidence_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, preview_id)
);

create table if not exists public.campaign_approval_events (
  approval_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null,
  decision text not null check (decision in ('approved','changes_requested','revoked')),
  preview_id uuid,
  supersedes_approval_id uuid,
  reason text check (reason is null or length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_approval_events_revision_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id)
    references public.campaign_revisions
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id) on delete restrict,
  constraint campaign_approval_events_preview_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, preview_id)
    references public.campaign_preview_evidence
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, preview_id) on delete restrict,
  constraint campaign_approval_events_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id),
  constraint campaign_approval_events_decision_shape check (
    (decision = 'approved' and preview_id is not null and supersedes_approval_id is null and reason is null)
    or (decision = 'changes_requested' and preview_id is null and supersedes_approval_id is null and reason is not null)
    or (decision = 'revoked' and preview_id is null and supersedes_approval_id is not null and reason is not null)
  )
);

create table if not exists public.campaign_schedule_entries (
  schedule_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null, approval_id uuid not null,
  scheduled_for timestamptz not null, timezone text not null, local_datetime text not null,
  utc_offset_minutes integer not null check (utc_offset_minutes between -840 and 840),
  created_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_schedule_entries_approval_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id)
    references public.campaign_approval_events
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id) on delete restrict,
  constraint campaign_schedule_entries_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, schedule_id)
);

create table if not exists public.campaign_manual_attempts (
  attempt_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null, approval_id uuid not null, schedule_id uuid,
  method text not null check (method = 'manual'),
  started_at timestamptz not null,
  started_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_manual_attempts_approval_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id)
    references public.campaign_approval_events
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id) on delete restrict,
  constraint campaign_manual_attempts_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id)
);

create table if not exists public.campaign_attempt_resolutions (
  resolution_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null, approval_id uuid not null, attempt_id uuid not null,
  outcome text not null check (outcome in ('confirmed','failed','cancelled')),
  reason text check (reason is null or length(trim(reason)) between 1 and 1000),
  not_published_attestation boolean not null,
  resolved_at timestamptz not null,
  resolved_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_attempt_resolutions_attempt_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id)
    references public.campaign_manual_attempts
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id) on delete restrict,
  constraint campaign_attempt_resolutions_attempt_unique unique (attempt_id),
  constraint campaign_attempt_resolutions_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id, resolution_id),
  constraint campaign_attempt_resolutions_outcome_shape check (
    (outcome = 'confirmed' and not not_published_attestation and reason is null)
    or (outcome in ('failed','cancelled') and not_published_attestation and reason is not null)
  )
);

create table if not exists public.campaign_publications (
  publication_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  revision_id uuid not null, approval_id uuid not null, attempt_id uuid not null, resolution_id uuid not null,
  method text not null check (method = 'manual'),
  evidence_kind text not null check (evidence_kind = 'customer_attestation'),
  published_at timestamptz not null, recorded_at timestamptz not null,
  recorded_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  publication_url text, external_reference text, note text,
  attested_published boolean not null check (attested_published),
  constraint campaign_publications_resolution_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id, resolution_id)
    references public.campaign_attempt_resolutions
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, revision_id, approval_id, attempt_id, resolution_id) on delete restrict,
  constraint campaign_publications_variant_unique unique (variant_id),
  constraint campaign_publications_attempt_unique unique (attempt_id),
  constraint campaign_publications_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, publication_id),
  constraint campaign_publications_time_order check (published_at <= recorded_at)
);

create table if not exists public.campaign_publication_corrections (
  correction_id uuid primary key,
  tenant_id text not null, project_id text not null, brand_id text not null,
  campaign_id uuid not null, content_item_id uuid not null, variant_id uuid not null,
  publication_id uuid not null, supersedes_correction_id uuid,
  published_at timestamptz not null, publication_url text, external_reference text, note text,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null,
  created_by uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  constraint campaign_publication_corrections_publication_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, publication_id)
    references public.campaign_publications
      (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, publication_id) on delete restrict,
  constraint campaign_publication_corrections_owner_unique
    unique (tenant_id, project_id, brand_id, campaign_id, content_item_id, variant_id, publication_id, correction_id)
);

create table if not exists public.campaign_command_receipts (
  command_id uuid primary key,
  namespace text not null check (namespace = 'campaign-spine.v1'),
  tenant_id text not null, project_id text not null,
  auth_user_id uuid not null references public.customer_profiles (auth_user_id) on delete restrict,
  idempotency_key text not null,
  command_type text not null,
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  campaign_id uuid not null,
  expected_campaign_version integer not null check (expected_campaign_version between 0 and 2147483647),
  result_campaign_version integer not null check (result_campaign_version between 1 and 2147483647),
  first_sequence integer not null check (first_sequence between 1 and 2147483647),
  last_sequence integer not null check (last_sequence >= first_sequence),
  http_status integer not null check (http_status in (200,201)),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  recorded_at timestamptz not null,
  constraint campaign_command_receipts_campaign_fkey
    foreign key (tenant_id, project_id, campaign_id)
    references public.campaigns (tenant_id, project_id, campaign_id) on delete restrict,
  constraint campaign_command_receipts_identity_unique
    unique (namespace, tenant_id, project_id, auth_user_id, idempotency_key),
  constraint campaign_command_receipts_command_campaign_unique unique (command_id, campaign_id)
);

create table if not exists public.campaign_events (
  event_id uuid primary key,
  contract_version text not null check (contract_version = 'campaign-spine.v1'),
  event_type text not null,
  payload_version integer not null check (payload_version = 1),
  tenant_id text not null, project_id text not null, brand_id text not null, campaign_id uuid not null,
  sequence integer not null check (sequence between 1 and 2147483647),
  campaign_version integer not null check (campaign_version between 1 and 2147483647),
  command_id uuid not null,
  command_event_index integer not null check (command_event_index between 1 and 2147483647),
  request_id uuid not null,
  actor jsonb not null check (jsonb_typeof(actor) = 'object'),
  authorization_context jsonb not null check (jsonb_typeof(authorization_context) = 'object'),
  recorded_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint campaign_events_campaign_fkey
    foreign key (tenant_id, project_id, brand_id, campaign_id)
    references public.campaigns (tenant_id, project_id, brand_id, campaign_id) on delete restrict,
  constraint campaign_events_command_fkey
    foreign key (command_id, campaign_id)
    references public.campaign_command_receipts (command_id, campaign_id)
    on delete restrict deferrable initially deferred,
  constraint campaign_events_sequence_unique unique (campaign_id, sequence),
  constraint campaign_events_command_index_unique unique (command_id, command_event_index)
);

-- Current projection pointers are deferred because records and projection updates
-- are committed in one aggregate transaction.
alter table public.campaign_platform_variants drop constraint if exists campaign_platform_variants_active_approval_fkey;
alter table public.campaign_platform_variants drop constraint if exists campaign_platform_variants_active_schedule_fkey;
alter table public.campaign_platform_variants drop constraint if exists campaign_platform_variants_pending_attempt_fkey;
alter table public.campaign_platform_variants drop constraint if exists campaign_platform_variants_publication_fkey;
alter table public.campaign_platform_variants
  add constraint campaign_platform_variants_active_approval_fkey
  foreign key (active_approval_id) references public.campaign_approval_events (approval_id)
  on delete restrict deferrable initially deferred;
alter table public.campaign_platform_variants
  add constraint campaign_platform_variants_active_schedule_fkey
  foreign key (active_schedule_id) references public.campaign_schedule_entries (schedule_id)
  on delete restrict deferrable initially deferred;
alter table public.campaign_platform_variants
  add constraint campaign_platform_variants_pending_attempt_fkey
  foreign key (pending_attempt_id) references public.campaign_manual_attempts (attempt_id)
  on delete restrict deferrable initially deferred;
alter table public.campaign_platform_variants
  add constraint campaign_platform_variants_publication_fkey
  foreign key (publication_id) references public.campaign_publications (publication_id)
  on delete restrict deferrable initially deferred;

create index if not exists campaigns_tenant_project_updated_idx
  on public.campaigns (tenant_id, project_id, updated_at desc, campaign_id);
create index if not exists campaign_content_items_parent_idx
  on public.campaign_content_items (campaign_id, content_item_id);
create index if not exists campaign_platform_variants_parent_idx
  on public.campaign_platform_variants (campaign_id, content_item_id, variant_id);
create index if not exists campaign_revisions_variant_number_idx
  on public.campaign_revisions (variant_id, revision_number desc);
create index if not exists campaign_events_stream_idx
  on public.campaign_events (campaign_id, sequence);
create unique index if not exists campaign_platform_variants_pending_attempt_unique
  on public.campaign_platform_variants (variant_id) where pending_attempt_id is not null;
create index if not exists campaign_schedule_entries_time_idx
  on public.campaign_schedule_entries (scheduled_for, variant_id);
create index if not exists campaign_publications_time_idx
  on public.campaign_publications (published_at, variant_id);

create or replace function campaign_private.reject_immutable_campaign_record()
returns trigger language plpgsql set search_path = '' as $$
declare contains_evidence boolean;
begin
  if tg_op = 'TRUNCATE' then
    execute format('select exists(select 1 from %I.%I)', tg_table_schema, tg_table_name)
      into contains_evidence;
    if not contains_evidence then
      return null;
    end if;
  end if;
  raise exception 'campaign evidence is immutable' using errcode = '55000';
end;
$$;

create or replace function campaign_private.reject_campaign_projection_identity_change()
returns trigger language plpgsql set search_path = '' as $$
declare contains_projection boolean;
begin
  if tg_op = 'TRUNCATE' then
    execute format('select exists(select 1 from %I.%I)', tg_table_schema, tg_table_name)
      into contains_projection;
    if not contains_projection then
      return null;
    end if;
  end if;
  if current_setting('bizgenie.campaign_command', true) is distinct from txid_current()::text then
    raise exception 'campaign projections require the controlled command transaction' using errcode = '55000';
  end if;
  if tg_op in ('DELETE','TRUNCATE') then
    raise exception 'campaign projections cannot be removed' using errcode='55000';
  end if;
  return new;
end;
$$;

create or replace function campaign_private.validate_campaign_variant_projection()
returns trigger language plpgsql set search_path = '' as $$
declare revision_row public.campaign_revisions%rowtype;
declare approval_row public.campaign_approval_events%rowtype;
declare schedule_row public.campaign_schedule_entries%rowtype;
declare attempt_row public.campaign_manual_attempts%rowtype;
declare publication_row public.campaign_publications%rowtype;
begin
  select * into revision_row from public.campaign_revisions where revision_id = new.current_revision_id;
  if not found or revision_row.variant_id <> new.variant_id or revision_row.content_item_id <> new.content_item_id
     or revision_row.campaign_id <> new.campaign_id or revision_row.tenant_id <> new.tenant_id
     or revision_row.project_id <> new.project_id or revision_row.brand_id <> new.brand_id
     or exists (select 1 from public.campaign_revisions r where r.variant_id=new.variant_id and r.revision_number>revision_row.revision_number) then
    raise exception 'invalid campaign current revision projection' using errcode='23514';
  end if;
  if new.active_approval_id is not null then
    select * into approval_row from public.campaign_approval_events where approval_id=new.active_approval_id;
    if not found or approval_row.variant_id<>new.variant_id or approval_row.revision_id<>new.current_revision_id or approval_row.decision<>'approved' then
      raise exception 'invalid campaign active approval projection' using errcode='23514';
    end if;
  end if;
  if new.active_schedule_id is not null then
    select * into schedule_row from public.campaign_schedule_entries where schedule_id=new.active_schedule_id;
    if not found or schedule_row.variant_id<>new.variant_id or schedule_row.revision_id<>new.current_revision_id or schedule_row.approval_id<>new.active_approval_id then
      raise exception 'invalid campaign active schedule projection' using errcode='23514';
    end if;
  end if;
  if new.pending_attempt_id is not null then
    select * into attempt_row from public.campaign_manual_attempts where attempt_id=new.pending_attempt_id;
    if not found or attempt_row.variant_id<>new.variant_id or attempt_row.revision_id<>new.current_revision_id or attempt_row.approval_id<>new.active_approval_id then
      raise exception 'invalid campaign pending attempt projection' using errcode='23514';
    end if;
  end if;
  if new.publication_id is not null then
    select * into publication_row from public.campaign_publications where publication_id=new.publication_id;
    if not found or publication_row.variant_id<>new.variant_id or publication_row.revision_id<>new.current_revision_id then
      raise exception 'invalid campaign publication projection' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_campaign_variant_projection on public.campaign_platform_variants;
create constraint trigger validate_campaign_variant_projection
after insert or update on public.campaign_platform_variants
deferrable initially deferred for each row
execute function campaign_private.validate_campaign_variant_projection();

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'campaign_brand_snapshots','campaign_revisions','campaign_preview_evidence',
    'campaign_approval_events','campaign_schedule_entries','campaign_manual_attempts',
    'campaign_attempt_resolutions','campaign_publications',
    'campaign_publication_corrections','campaign_events','campaign_command_receipts'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'protect_' || relation_name, relation_name);
    execute format(
      'create trigger %I before update or delete or truncate on public.%I for each statement execute function campaign_private.reject_immutable_campaign_record()',
      'protect_' || relation_name, relation_name
    );
  end loop;
end $$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array['campaigns','campaign_content_items','campaign_platform_variants'] loop
    execute format('drop trigger if exists %I on public.%I', 'protect_' || relation_name || '_projection', relation_name);
    execute format(
      'create trigger %I before update or delete or truncate on public.%I for each statement execute function campaign_private.reject_campaign_projection_identity_change()',
      'protect_' || relation_name || '_projection', relation_name
    );
  end loop;
end $$;

do $$
declare relation_name text;
declare grantee text;
begin
  foreach relation_name in array array[
    'campaigns','campaign_content_items','campaign_platform_variants','campaign_revisions',
    'campaign_brand_snapshots','campaign_preview_evidence','campaign_approval_events',
    'campaign_schedule_entries','campaign_manual_attempts','campaign_attempt_resolutions',
    'campaign_publications','campaign_publication_corrections','campaign_events',
    'campaign_command_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on table public.%I from public', relation_name);
    foreach grantee in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = grantee) then
        execute format('revoke all on table public.%I from %I', relation_name, grantee);
      end if;
    end loop;
  end loop;
end $$;

revoke all on function campaign_private.reject_immutable_campaign_record() from public;
revoke all on function campaign_private.reject_campaign_projection_identity_change() from public;
revoke all on function campaign_private.validate_campaign_variant_projection() from public;

comment on schema campaign_private is
  'Private trigger namespace for the server-owned campaign transaction boundary.';
comment on table public.campaigns is
  'Server-owned current campaign aggregate projection; no direct Data API access.';
comment on table public.campaign_events is
  'Immutable ordered campaign-spine.v1 audit stream; sequence, not time, is authority.';
comment on table public.campaign_command_receipts is
  'Immutable successful command receipts for campaign-spine.v1 replay recovery.';

-- The transaction marker gates the internal seam; it never permits identity edits.
create or replace function campaign_private.validate_projection_identity()
returns trigger language plpgsql set search_path='' as $$
declare mutable text[];
begin
  mutable := case tg_table_name
    when 'campaigns' then array['name','display_timezone','version','last_event_sequence','archived_at','updated_at']
    when 'campaign_content_items' then array['name','archived_at','updated_at']
    else array['workflow','current_revision_id','active_approval_id','active_schedule_id','pending_attempt_id','publication_id','updated_at'] end;
  if (to_jsonb(new)-mutable) is distinct from (to_jsonb(old)-mutable) then
    raise exception 'campaign projection identity is immutable' using errcode='23514';
  end if;
  if tg_table_name='campaign_platform_variants' and to_jsonb(old)->>'workflow'='published'
     and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
    raise exception 'published campaign variant is terminal' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function campaign_private.validate_revision_content()
returns trigger language plpgsql set search_path='' as $$
declare k text; bound integer; ref jsonb; previous public.campaign_revisions%rowtype;
begin
  if (select count(*) from jsonb_object_keys(new.content))<>5
     or not (new.content ?& array['title','body','caption','alt_text','asset_refs'])
     or jsonb_typeof(new.content->'asset_refs') is distinct from 'array' then
    raise exception 'invalid campaign revision content' using errcode='23514';
  end if;
  foreach k in array array['title','body','caption','alt_text'] loop
    bound := case k when 'title' then 200 when 'body' then 32000 when 'caption' then 8000 else 2000 end;
    if jsonb_typeof(new.content->k) not in ('null','string') or
       (jsonb_typeof(new.content->k)='string' and length(new.content->>k) not between 1 and bound) then
      raise exception 'invalid campaign content text' using errcode='23514';
    end if;
  end loop;
  if jsonb_array_length(new.content->'asset_refs')>10 or
     (select count(distinct r->>'asset_id') from jsonb_array_elements(new.content->'asset_refs') r)<>jsonb_array_length(new.content->'asset_refs') then
    raise exception 'invalid campaign asset references' using errcode='23514';
  end if;
  for ref in select * from jsonb_array_elements(new.content->'asset_refs') loop
    if jsonb_typeof(ref)<>'object' or (select count(*) from jsonb_object_keys(ref))<>2
       or not (ref ?& array['asset_id','role']) or ref->>'asset_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or ref->>'role' not in ('primary','supporting') then
      raise exception 'invalid campaign asset reference shape' using errcode='23514';
    end if;
  end loop;
  if new.parent_revision_id is not null then
    select * into previous from public.campaign_revisions where revision_id=new.parent_revision_id;
    if not found or previous.revision_number+1<>new.revision_number then
      raise exception 'invalid campaign revision sequence' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

create or replace function campaign_private.validate_campaign_commit()
returns trigger language plpgsql set search_path='' as $$
declare cid uuid; root public.campaigns%rowtype; n integer; hi integer; versions integer; first_event jsonb; latest_name text; latest_zone text;
begin
  cid:=new.campaign_id;
  select * into root from public.campaigns where campaign_id=cid;
  select count(*),max(sequence),count(distinct campaign_version) into n,hi,versions from public.campaign_events where campaign_id=cid;
  if n<>root.last_event_sequence or hi<>n or versions<>root.version or
     (select count(*) from public.campaign_command_receipts where campaign_id=cid)<>root.version then
    raise exception 'campaign event receipt counters disagree' using errcode='23514';
  end if;
  if exists(select 1 from public.campaign_command_receipts r where r.campaign_id=cid and
    (r.result_campaign_version<>r.expected_campaign_version+1 or
     (select count(*) from public.campaign_events e where e.command_id=r.command_id)<>r.last_sequence-r.first_sequence+1 or
     (select min(sequence) from public.campaign_events e where e.command_id=r.command_id)<>r.first_sequence or
     (select max(sequence) from public.campaign_events e where e.command_id=r.command_id)<>r.last_sequence)) or
     exists(select 1 from public.campaign_events e join public.campaign_command_receipts r using(command_id) where e.campaign_id=cid and
       (e.campaign_version<>r.result_campaign_version or e.command_event_index<>e.sequence-r.first_sequence+1 or
        e.actor<>jsonb_build_object('kind','customer','auth_user_id',r.auth_user_id))) then
    raise exception 'campaign event receipt interval disagrees' using errcode='23514';
  end if;
  select payload->'campaign' into first_event from public.campaign_events where campaign_id=cid and sequence=1 and event_type='campaign.created';
  select payload->>'name',payload->>'display_timezone' into latest_name,latest_zone from public.campaign_events where campaign_id=cid and event_type='campaign.details_updated' order by sequence desc limit 1;
  if first_event is null or root.name is distinct from coalesce(latest_name,first_event->>'name') or
     root.display_timezone is distinct from coalesce(latest_zone,first_event->>'display_timezone') or
     root.goal is distinct from first_event->>'goal' then
    raise exception 'campaign root does not match event history' using errcode='23514';
  end if;
  if exists(select 1 from public.campaign_content_items i where i.campaign_id=cid and not exists(select 1 from public.campaign_platform_variants v where v.content_item_id=i.content_item_id)) then
    raise exception 'campaign item requires a variant' using errcode='23514';
  end if;
  if exists (
    select 1 from public.campaign_platform_variants v
    left join lateral (
      select case e.event_type when 'revision.created' then 'draft' when 'review.submitted' then 'review'
        when 'approval.approved' then 'approved' when 'approval.revoked' then 'review'
        when 'approval.changes_requested' then 'draft' when 'schedule.created' then 'scheduled'
        when 'schedule.cancelled' then 'approved' when 'publication.confirmed' then 'published'
        when 'publication.attempt_failed' then 'approved' end stage
      from public.campaign_events e where e.campaign_id=cid
        and coalesce(e.payload->>'variant_id',e.payload->'record'->>'variant_id',e.payload->'publication'->>'variant_id')=v.variant_id::text
        and e.event_type in ('revision.created','review.submitted','approval.approved','approval.revoked','approval.changes_requested','schedule.created','schedule.cancelled','publication.confirmed','publication.attempt_failed')
      order by e.sequence desc limit 1
    ) expected on true where v.campaign_id=cid and v.workflow is distinct from expected.stage
  ) then raise exception 'campaign workflow does not match event history' using errcode='23514'; end if;
  return null;
end $$;

create or replace function campaign_private.validate_publication_metadata()
returns trigger language plpgsql set search_path='' as $$
declare started timestamptz; recorded timestamptz; prior uuid;
begin
  if tg_table_name='campaign_publications' then
    select started_at into started from public.campaign_manual_attempts where attempt_id=new.attempt_id;
    recorded:=new.recorded_at;
  else
    select a.started_at into started from public.campaign_publications p join public.campaign_manual_attempts a using(attempt_id) where p.publication_id=new.publication_id;
    recorded:=new.created_at;
    if new.supersedes_correction_id is not null and not exists(select 1 from public.campaign_publication_corrections c where c.correction_id=new.supersedes_correction_id and c.publication_id=new.publication_id) then
      raise exception 'invalid publication correction chain' using errcode='23514';
    end if;
    if exists(select 1 from public.campaign_publication_corrections c where c.publication_id=new.publication_id and c.supersedes_correction_id is not distinct from new.supersedes_correction_id and c.correction_id<>new.correction_id) then
      raise exception 'publication correction chain cannot fork' using errcode='23514';
    end if;
  end if;
  if new.published_at<started or new.published_at>recorded or
     (new.publication_url is not null and (length(new.publication_url)>2048 or new.publication_url !~ '^https://[^/?#@[:space:]]+[^?#[:space:]]*$')) then
    raise exception 'invalid publication metadata' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function campaign_private.validate_event_shape()
returns trigger language plpgsql set search_path='' as $$
declare keys text[];
begin
  keys:=case new.event_type
    when 'campaign.created' then array['campaign','brand_snapshot_id']
    when 'campaign.details_updated' then array['name','display_timezone']
    when 'campaign.archived' then array['reason'] when 'campaign.restored' then array['reason']
    when 'content_item.created' then array['content_item']
    when 'content_item.renamed' then array['content_item_id','name']
    when 'content_item.archived' then array['content_item_id','reason']
    when 'content_item.restored' then array['content_item_id','reason']
    when 'variant.created' then array['variant']
    when 'revision.created' then array['record'] when 'preview.acknowledged' then array['record']
    when 'review.submitted' then array['variant_id','revision_id']
    when 'approval.approved' then array['record'] when 'approval.revoked' then array['record']
    when 'approval.changes_requested' then array['record'] when 'schedule.created' then array['record']
    when 'schedule.cancelled' then array['variant_id','schedule_id','reason_code','reason']
    when 'publication.attempt_started' then array['record']
    when 'publication.attempt_failed' then array['record'] when 'publication.attempt_cancelled' then array['record']
    when 'publication.confirmed' then array['resolution','publication']
    when 'publication.corrected' then array['record'] else null end;
  if keys is null or not (new.payload ?& keys) or (new.payload-keys)<>'{}'::jsonb or
     new.actor is distinct from jsonb_build_object('kind','customer','auth_user_id',new.actor->>'auth_user_id') or
     new.actor->>'auth_user_id' is null or
     new.authorization_context is distinct from jsonb_build_object('policy_version','campaign-owner.v1','membership_role','owner','action','project:write','tenant_id',new.tenant_id,'project_id',new.project_id,'brand_id',new.brand_id) then
    raise exception 'invalid campaign event shape' using errcode='23514';
  end if;
  if new.payload ? 'record' and jsonb_typeof(new.payload->'record') is distinct from 'object' then
    raise exception 'invalid campaign event record' using errcode='23514';
  end if;
  return new;
end $$;

create or replace function campaign_private.validate_preview_binding()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='campaign_preview_evidence' then
    if not exists(select 1 from public.campaign_revisions r join public.campaign_platform_variants v using(variant_id) join public.campaign_content_items i on i.content_item_id=v.content_item_id
      where r.revision_id=new.revision_id and r.content_hash=new.revision_content_hash and v.platform=new.platform and v.placement=new.placement and i.format=new.format)
      or new.rendered_at>new.observed_at then
      raise exception 'preview does not bind current content' using errcode='23514';
    end if;
  elsif new.decision='approved' and not exists(select 1 from public.campaign_preview_evidence p where p.preview_id=new.preview_id and p.observed_by=new.created_by) then
    raise exception 'approval requires approver preview acknowledgement' using errcode='23514';
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['campaigns','campaign_content_items','campaign_platform_variants'] loop
    execute format('drop trigger if exists campaign_identity on public.%I',t);
    execute format('create trigger campaign_identity before update on public.%I for each row execute function campaign_private.validate_projection_identity()',t);
  end loop;
  foreach t in array array['campaigns','campaign_content_items','campaign_platform_variants','campaign_revisions','campaign_preview_evidence','campaign_approval_events','campaign_schedule_entries','campaign_manual_attempts','campaign_attempt_resolutions','campaign_publications','campaign_publication_corrections','campaign_events','campaign_command_receipts'] loop
    execute format('drop trigger if exists campaign_commit on public.%I',t);
    execute format('create constraint trigger campaign_commit after insert or update on public.%I deferrable initially deferred for each row execute function campaign_private.validate_campaign_commit()',t);
  end loop;
  foreach t in array array['campaign_publications','campaign_publication_corrections'] loop
    execute format('drop trigger if exists campaign_metadata on public.%I',t);
    execute format('create trigger campaign_metadata before insert on public.%I for each row execute function campaign_private.validate_publication_metadata()',t);
  end loop;
end $$;
drop trigger if exists campaign_revision_content on public.campaign_revisions;
create trigger campaign_revision_content before insert on public.campaign_revisions for each row execute function campaign_private.validate_revision_content();
drop trigger if exists campaign_event_shape on public.campaign_events;
create trigger campaign_event_shape before insert on public.campaign_events for each row execute function campaign_private.validate_event_shape();
drop trigger if exists campaign_preview_binding on public.campaign_preview_evidence;
create trigger campaign_preview_binding before insert on public.campaign_preview_evidence for each row execute function campaign_private.validate_preview_binding();
drop trigger if exists campaign_approval_binding on public.campaign_approval_events;
create trigger campaign_approval_binding before insert on public.campaign_approval_events for each row execute function campaign_private.validate_preview_binding();
revoke all on all functions in schema campaign_private from public;
commit;
