create table if not exists public.customer_profiles (
  auth_user_id uuid primary key
    references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint customer_profiles_display_name_length check (
    display_name is null or length(trim(display_name)) between 1 and 200
  )
);

create table if not exists public.tenants (
  tenant_id text primary key,
  name text not null,
  created_by uuid not null
    references public.customer_profiles (auth_user_id) on delete restrict,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint tenants_tenant_id_format check (
    length(tenant_id) between 1 and 128
    and tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint tenants_name_length check (length(trim(name)) between 1 and 200)
);

create table if not exists public.tenant_memberships (
  tenant_id text not null
    references public.tenants (tenant_id) on delete cascade,
  auth_user_id uuid not null
    references public.customer_profiles (auth_user_id) on delete cascade,
  role text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  primary key (tenant_id, auth_user_id),
  constraint tenant_memberships_role_allowed check (role in ('owner', 'member'))
);

create table if not exists public.projects (
  project_id text primary key,
  tenant_id text not null
    references public.tenants (tenant_id) on delete restrict,
  name text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint projects_project_id_format check (
    length(project_id) between 1 and 128
    and project_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint projects_name_length check (length(trim(name)) between 1 and 200)
);

create index if not exists tenants_created_by_idx
  on public.tenants (created_by);
create index if not exists tenant_memberships_auth_user_tenant_idx
  on public.tenant_memberships (auth_user_id, tenant_id);
create index if not exists projects_tenant_id_idx
  on public.projects (tenant_id);

create or replace function public.protect_customer_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'customer profile auth identity is immutable'
      using errcode = '23514';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'customer profile creation timestamp is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.protect_tenant_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant identity is immutable' using errcode = '23514';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'tenant creator is immutable' using errcode = '23514';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'tenant creation timestamp is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.protect_tenant_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
    or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'tenant membership identity is immutable'
      using errcode = '23514';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'tenant membership creation timestamp is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.protect_project_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'project identity is immutable' using errcode = '23514';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'project tenant ownership is immutable'
      using errcode = '23514';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'project creation timestamp is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_customer_profile_identity
  on public.customer_profiles;
create trigger protect_customer_profile_identity
before update on public.customer_profiles
for each row execute function public.protect_customer_profile_identity();

drop trigger if exists protect_tenant_identity on public.tenants;
create trigger protect_tenant_identity
before update on public.tenants
for each row execute function public.protect_tenant_identity();

drop trigger if exists protect_tenant_membership_identity
  on public.tenant_memberships;
create trigger protect_tenant_membership_identity
before update on public.tenant_memberships
for each row execute function public.protect_tenant_membership_identity();

drop trigger if exists protect_project_ownership on public.projects;
create trigger protect_project_ownership
before update on public.projects
for each row execute function public.protect_project_ownership();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'brand_brains_project_id_fkey'
       and conrelid = 'public.brand_brains'::regclass
  ) then
    alter table public.brand_brains
      add constraint brand_brains_project_id_fkey
      foreign key (project_id)
      references public.projects (project_id)
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.customer_profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.projects enable row level security;

drop policy if exists customer_profiles_select_own
  on public.customer_profiles;
create policy customer_profiles_select_own
on public.customer_profiles
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists tenant_memberships_select_own
  on public.tenant_memberships;
create policy tenant_memberships_select_own
on public.tenant_memberships
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists tenants_select_for_member on public.tenants;
create policy tenants_select_for_member
on public.tenants
for select
to authenticated
using (
  tenant_id in (
    select membership.tenant_id
      from public.tenant_memberships as membership
     where membership.auth_user_id = (select auth.uid())
  )
);

drop policy if exists projects_select_for_member on public.projects;
create policy projects_select_for_member
on public.projects
for select
to authenticated
using (
  tenant_id in (
    select membership.tenant_id
      from public.tenant_memberships as membership
     where membership.auth_user_id = (select auth.uid())
  )
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.customer_profiles from anon;
    revoke all on table public.tenants from anon;
    revoke all on table public.tenant_memberships from anon;
    revoke all on table public.projects from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.customer_profiles from authenticated;
    revoke all on table public.tenants from authenticated;
    revoke all on table public.tenant_memberships from authenticated;
    revoke all on table public.projects from authenticated;
  end if;
end;
$$;

comment on table public.customer_profiles is
  'Customer profile anchored one-to-one to the immutable Supabase Auth user UUID.';
comment on table public.tenants is
  'Canonical commercial and customer isolation boundary.';
comment on table public.tenant_memberships is
  'Minimal owner/member relationship between Supabase identities and tenants.';
comment on table public.projects is
  'Tenant-owned project root for Brand Brain and future tenant-scoped resources.';
comment on column public.projects.tenant_id is
  'Immutable ownership reference for future subscriptions, credit accounts, generation requests, and generated assets.';
