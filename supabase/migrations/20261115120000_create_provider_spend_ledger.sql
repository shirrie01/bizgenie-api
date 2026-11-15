-- SOURCE ONLY: founder approval is required before applying anywhere shared.
-- No policy, cohort, balance, entitlement or financial data is seeded.
begin;
select pg_advisory_xact_lock(hashtextextended('provider-spend.schema.v1',0));
do $preflight$
begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('provider_spend_policy','provider_spend_customers','provider_spend_reservations')) then
  raise exception 'Provider spend relation already exists: reconcile catalog and migration history; do not overwrite';
 end if;
 if not exists(select 1 from pg_roles where rolname='bizgenie_provider_spend_runtime') then
  begin
   create role bizgenie_provider_spend_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  exception when duplicate_object or unique_violation then
   -- Independent disposable database migrations can race on the cluster-global role.
   null;
  end;
 end if;
 if exists(select 1 from pg_roles where rolname='bizgenie_provider_spend_runtime' and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit)) then
  raise exception 'Existing provider-spend runtime role is incompatible';
 end if;
 if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='bizgenie_provider_spend_runtime') then
  raise exception 'Provider-spend runtime role must have no parent memberships';
 end if;
end $preflight$;
create table public.provider_spend_policy (
 singleton boolean primary key default true check(singleton),
 version text not null, source_ref text not null, enabled boolean not null default false,
 currency text not null check(currency='GBP'), cap_minor integer not null check(cap_minor=10000),
 customer_limit integer not null check(customer_limit=10),
 valid_from timestamptz not null,valid_until timestamptz not null check(valid_until>valid_from),
 estimates jsonb not null check(jsonb_typeof(estimates)='object')
);
create table public.provider_spend_customers (
 tenant_id text primary key, customer_slot integer not null unique check(customer_slot between 1 and 10),
 active boolean not null default false
);
create table public.provider_spend_reservations (
 id text primary key, tenant_id text not null references public.provider_spend_customers(tenant_id),
 operation text not null,estimate_version text not null,currency text not null check(currency='GBP'),
 policy_version text not null,policy_hash text not null check(policy_hash ~ '^[a-f0-9]{64}$'),month text not null check(month ~ '^\d{4}-\d{2}-01$'),
 bound_minor integer not null check(bound_minor between 1 and 10000),
 state text not null check(state in ('reserved','dispatching','uncertain','settled','cancelled','breach')),
 dispatch_token uuid, evidence_ref text, settled_month text, actual_minor bigint check(actual_minor>=0),
 updated_at timestamptz not null default clock_timestamp(),
 check ((state in ('reserved','cancelled') and dispatch_token is null) or (state not in ('reserved','cancelled') and dispatch_token is not null))
);
create index on public.provider_spend_reservations(month);
alter table public.provider_spend_policy enable row level security;
alter table public.provider_spend_policy force row level security;
alter table public.provider_spend_customers enable row level security;
alter table public.provider_spend_customers force row level security;
alter table public.provider_spend_reservations enable row level security;
alter table public.provider_spend_reservations force row level security;
revoke all on public.provider_spend_policy,public.provider_spend_customers,public.provider_spend_reservations from public;
-- No grants to anon/authenticated/service_role. Operator owns policy/cohort, runtime cannot edit them.
grant usage on schema public to bizgenie_provider_spend_runtime;
grant select on public.provider_spend_policy,public.provider_spend_customers to bizgenie_provider_spend_runtime;
grant select,insert,update on public.provider_spend_reservations to bizgenie_provider_spend_runtime;
create policy spend_policy_read on public.provider_spend_policy for select to bizgenie_provider_spend_runtime using(true);
create policy spend_customer_read on public.provider_spend_customers for select to bizgenie_provider_spend_runtime using(true);
create policy spend_reservation_runtime on public.provider_spend_reservations to bizgenie_provider_spend_runtime using(true) with check(true);

-- Supabase API roles never receive ledger authority, even if default grants exist.
do $permissions$
declare r text;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on public.provider_spend_policy,public.provider_spend_customers,public.provider_spend_reservations from %I',r);
  end if;
 end loop;
end $permissions$;
-- No membership granted: an operator must separately approve a dedicated login's SET ROLE.
commit;
