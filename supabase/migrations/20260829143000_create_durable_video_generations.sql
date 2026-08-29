create table if not exists public.video_generations (
  generation_id text primary key,
  parent_generation_id text,
  transaction_correlation_id text,
  execution_id text not null,
  user_id text not null,
  tenant_id text,
  generation_job_id text,
  project_id text not null,
  brand_id text,
  campaign_id text,
  content_item_id text,
  video_purpose text not null,
  quality text not null,
  aspect_ratio text not null,
  duration_seconds integer not null,
  status text not null,
  approval_status text,
  provider text,
  provider_job_id text,
  provider_model text,
  provider_diagnostics jsonb,
  provider_cost_evidence jsonb,
  asset jsonb,
  error_code text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz,
  constraint video_generations_project_tenant_fkey
    foreign key (project_id, tenant_id) references public.projects (project_id, tenant_id) on delete restrict,
  constraint video_generations_job_authority_fkey
    foreign key (generation_job_id, tenant_id, project_id)
    references public.generation_jobs (job_id, tenant_id, project_id) on delete restrict,
  constraint video_generations_parent_fkey
    foreign key (parent_generation_id) references public.video_generations (generation_id) on delete restrict,
  constraint video_generations_quality_allowed check (quality in ('normal','premium')),
  constraint video_generations_aspect_allowed check (aspect_ratio in ('16:9','9:16')),
  constraint video_generations_duration_allowed check (duration_seconds in (4,6,8)),
  constraint video_generations_status_allowed check (status in ('queued','submitted','processing','completed','failed')),
  constraint video_generations_approval_allowed check (approval_status is null or approval_status in ('pending','approved','rejected'))
);

create unique index if not exists video_generations_execution_idx on public.video_generations (execution_id);
create index if not exists video_generations_tenant_project_idx on public.video_generations (tenant_id, project_id, generation_id);
create index if not exists video_generations_job_idx on public.video_generations (generation_job_id) where generation_job_id is not null;

create or replace function public.protect_video_generation_authority()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.generation_id is distinct from old.generation_id
    or new.parent_generation_id is distinct from old.parent_generation_id
    or new.transaction_correlation_id is distinct from old.transaction_correlation_id
    or new.execution_id is distinct from old.execution_id
    or new.user_id is distinct from old.user_id
    or new.tenant_id is distinct from old.tenant_id
    or new.generation_job_id is distinct from old.generation_job_id
    or new.project_id is distinct from old.project_id
    or new.brand_id is distinct from old.brand_id
    or new.campaign_id is distinct from old.campaign_id
    or new.content_item_id is distinct from old.content_item_id
    or new.video_purpose is distinct from old.video_purpose
    or new.quality is distinct from old.quality
    or new.aspect_ratio is distinct from old.aspect_ratio
    or new.duration_seconds is distinct from old.duration_seconds
    or new.created_at is distinct from old.created_at then
    raise exception 'video generation authority is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_video_generation_authority on public.video_generations;
create trigger protect_video_generation_authority before update on public.video_generations
for each row execute function public.protect_video_generation_authority();

alter table public.video_generations enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then revoke all on public.video_generations from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then revoke all on public.video_generations from authenticated; end if;
  if exists (select 1 from pg_roles where rolname='service_role') then revoke all on public.video_generations from service_role; end if;
end $$;

comment on table public.video_generations is 'Server-only durable asynchronous Video generation state. Reconstructs accepted provider operations across process restarts.';
