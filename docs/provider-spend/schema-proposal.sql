-- REVIEW PROPOSAL ONLY. Never auto-applied by startup, CI or deployment.
-- Runtime role must already exist; test creates it only in disposable local PostgreSQL.
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
