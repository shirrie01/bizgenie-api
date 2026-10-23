-- PROPOSAL ONLY. Not in supabase/migrations; do not apply to shared/production DBs.
-- Existing verified auth.users identity supports drafts before workspace bootstrap.
begin;
create table public.customer_onboarding_drafts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null check (version between 1 and 2147483647),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 32768),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
alter table public.customer_onboarding_drafts enable row level security;
revoke all on table public.customer_onboarding_drafts from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on table public.customer_onboarding_drafts from %I',role_name);
    end if;
  end loop;
end;
$$;
comment on table public.customer_onboarding_drafts is
  'Server-only personal onboarding scratchpad, not Brand Brain truth, approval or entitlement authority.';
commit;
