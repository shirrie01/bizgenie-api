-- BG-AUTH-002C: authorized generation-job and service-principal boundary.
-- This migration is version-controlled but has NOT been applied to any
-- database by this task. It documents the immutable internal
-- generation-job contract so a future authorized rollout has a reviewed
-- starting point.
--
-- Deliberately absent from this table, matching the application-layer
-- contract: any column for provider, model, price, cost, secret, callback
-- URL, or asset location. A generation job never gains any of that
-- authority.

create table if not exists public.generation_jobs (
  job_id text primary key,
  tenant_id text not null
    references public.tenants (tenant_id) on delete restrict,
  project_id text not null,
  brand_id text,
  execution_class text not null,
  auth_user_id uuid not null
    references public.customer_profiles (auth_user_id) on delete restrict,
  request_correlation_id text not null,
  idempotency_key text not null,
  allowed_scopes jsonb not null,
  execution_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint generation_jobs_job_id_format check (
    length(job_id) between 1 and 128
    and job_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint generation_jobs_tenant_id_format check (
    length(tenant_id) between 1 and 128
    and tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint generation_jobs_project_id_format check (
    length(project_id) between 1 and 128
    and project_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint generation_jobs_brand_id_format check (
    brand_id is null
    or (length(brand_id) between 1 and 128
        and brand_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
  ),
  constraint generation_jobs_execution_class_format check (
    execution_class ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
  ),
  constraint generation_jobs_request_correlation_id_format check (
    length(request_correlation_id) between 1 and 128
    and request_correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint generation_jobs_idempotency_key_format check (
    length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint generation_jobs_allowed_scopes_array check (
    jsonb_typeof(allowed_scopes) = 'array'
    and jsonb_array_length(allowed_scopes) between 1 and 5
  ),
  constraint generation_jobs_execution_content_object check (
    jsonb_typeof(execution_content) = 'object'
  )
);

-- A job's ownership is tenant/project/brand/execution-class/actor/request
-- correlation, established once at authorization time. This foreign key
-- reuses the (project_id, tenant_id) uniqueness introduced for billing so a
-- job can never reference a project outside its own tenant.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'generation_jobs_project_tenant_fkey'
       and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_project_tenant_fkey
      foreign key (project_id, tenant_id)
      references public.projects (project_id, tenant_id)
      on delete restrict;
  end if;
end $$;

-- PostgreSQL requires an exact unique key for the composite ownership
-- reference below. brand_id remains the canonical primary key; this
-- redundant composite constraint exists only to prove that an optional
-- brand belongs to the same project already bound to the job.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'brand_brains_project_brand_unique'
       and conrelid = 'public.brand_brains'::regclass
  ) then
    alter table public.brand_brains
      add constraint brand_brains_project_brand_unique
      unique (project_id, brand_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'generation_jobs_project_brand_fkey'
       and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_project_brand_fkey
      foreign key (project_id, brand_id)
      references public.brand_brains (project_id, brand_id)
      on delete restrict;
  end if;
end $$;

-- Retries of the same logical customer request (same tenant, project, and
-- caller-supplied idempotency key) must resolve to the same job row. The
-- application layer additionally verifies the retry's other ownership
-- fields agree before treating a hit as the same logical job; a mismatch is
-- rejected in application code before any insert is attempted here.
create unique index if not exists generation_jobs_idempotency_unique
  on public.generation_jobs (tenant_id, project_id, idempotency_key);

create index if not exists generation_jobs_tenant_id_idx
  on public.generation_jobs (tenant_id);

-- Immutability: a generation job may never be updated or deleted once
-- created. This is an append-only authorization log.
create schema if not exists generation_jobs_private;
revoke all on schema generation_jobs_private from public;

create or replace function generation_jobs_private.reject_generation_job_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'generation jobs are immutable and cannot be updated or deleted'
    using errcode = '55000';
end;
$$;

drop trigger if exists generation_jobs_reject_update on public.generation_jobs;
create trigger generation_jobs_reject_update
  before update on public.generation_jobs
  for each row execute function generation_jobs_private.reject_generation_job_mutation();

drop trigger if exists generation_jobs_reject_delete on public.generation_jobs;
create trigger generation_jobs_reject_delete
  before delete on public.generation_jobs
  for each row execute function generation_jobs_private.reject_generation_job_mutation();

alter table public.generation_jobs enable row level security;

do $$
declare
  grantee text;
begin
  foreach grantee in array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = grantee) then
      execute format(
        'revoke all on table public.generation_jobs from %I',
        grantee
      );
    end if;
  end loop;
end $$;

revoke all on function
  generation_jobs_private.reject_generation_job_mutation()
  from public;
