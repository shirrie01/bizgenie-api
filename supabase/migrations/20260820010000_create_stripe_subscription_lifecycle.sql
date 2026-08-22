-- BG-BILL-002B: Stripe subscription lifecycle evidence and idempotency.
-- Apply only through the separately authorised migration process.

create table if not exists public.stripe_customer_mappings (
  tenant_id text primary key
    references public.tenants (tenant_id) on delete restrict,
  stripe_customer_id text not null unique,
  livemode boolean not null,
  created_at timestamptz not null default current_timestamp,
  constraint stripe_customer_mappings_customer_format check (
    length(stripe_customer_id) between 5 and 128
    and stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
  ),
  constraint stripe_customer_mappings_tenant_customer_unique
    unique (tenant_id, stripe_customer_id)
);

create unique index if not exists tenant_entitlements_stripe_subscription_unique
  on public.tenant_entitlements (stripe_subscription_ref)
  where stripe_subscription_ref is not null;

create table if not exists public.stripe_subscription_mappings (
  stripe_subscription_id text primary key,
  tenant_id text not null,
  stripe_customer_id text not null,
  entitlement_id text not null,
  policy_id text not null,
  plan_code text not null,
  stripe_price_id text not null,
  stripe_status text not null,
  entitlement_status text not null,
  livemode boolean not null,
  last_event_created timestamptz not null,
  last_event_id text not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint stripe_subscription_mappings_subscription_format check (
    length(stripe_subscription_id) between 5 and 128
    and stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'
  ),
  constraint stripe_subscription_mappings_price_format check (
    length(stripe_price_id) between 7 and 128
    and stripe_price_id ~ '^price_[A-Za-z0-9]+$'
  ),
  constraint stripe_subscription_mappings_status_allowed check (
    stripe_status in (
      'trialing', 'active', 'past_due', 'unpaid', 'canceled',
      'incomplete', 'incomplete_expired', 'paused'
    )
    and entitlement_status in (
      'active', 'inactive', 'grace', 'cancel_pending', 'cancelled'
    )
  ),
  constraint stripe_subscription_mappings_customer_tenant_fkey
    foreign key (tenant_id, stripe_customer_id)
    references public.stripe_customer_mappings (tenant_id, stripe_customer_id)
    on delete restrict,
  constraint stripe_subscription_mappings_entitlement_tenant_fkey
    foreign key (entitlement_id, tenant_id)
    references public.tenant_entitlements (entitlement_id, tenant_id)
    on delete restrict,
  constraint stripe_subscription_mappings_policy_plan_fkey
    foreign key (policy_id, plan_code)
    references public.commercial_policies (policy_id, plan_code)
    on delete restrict,
  constraint stripe_subscription_mappings_event_unique unique (last_event_id)
);

create index if not exists stripe_subscription_mappings_tenant_idx
  on public.stripe_subscription_mappings (tenant_id, updated_at desc);

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  intent_hash text not null,
  status text not null default 'processing',
  result jsonb,
  received_at timestamptz not null default current_timestamp,
  processed_at timestamptz,
  constraint stripe_webhook_events_id_format check (
    length(stripe_event_id) between 5 and 128
    and stripe_event_id ~ '^evt_[A-Za-z0-9]+$'
  ),
  constraint stripe_webhook_events_hash_format check (
    intent_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint stripe_webhook_events_status_allowed check (
    status in ('processing', 'processed', 'failed')
  ),
  constraint stripe_webhook_events_completion_valid check (
    (status in ('processing', 'failed') and processed_at is null and result is null)
    or (status = 'processed' and processed_at is not null and result is not null)
  )
);

-- Future bolt-on processing must first record verified Stripe evidence here,
-- then call the immutable credit ledger with payment_reference as its logical key.
create table if not exists public.stripe_bolt_on_payment_evidence (
  payment_reference text primary key,
  stripe_event_id text not null unique,
  tenant_id text not null,
  stripe_customer_id text not null,
  stripe_price_id text not null,
  credits bigint not null,
  status text not null default 'verified',
  created_at timestamptz not null default current_timestamp,
  constraint stripe_bolt_on_payment_evidence_credits_positive check (credits > 0),
  constraint stripe_bolt_on_payment_evidence_status_allowed check (
    status = 'verified'
  ),
  constraint stripe_bolt_on_payment_evidence_customer_tenant_fkey
    foreign key (tenant_id, stripe_customer_id)
    references public.stripe_customer_mappings (tenant_id, stripe_customer_id)
    on delete restrict,
  constraint stripe_bolt_on_payment_evidence_event_fkey
    foreign key (stripe_event_id)
    references public.stripe_webhook_events (stripe_event_id)
    on delete restrict
);

create or replace function billing_private.protect_stripe_customer_mapping_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.livemode is distinct from old.livemode
     or new.created_at is distinct from old.created_at then
    raise exception 'Stripe customer mapping identity is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function billing_private.protect_stripe_subscription_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.tenant_id is distinct from old.tenant_id
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.entitlement_id is distinct from old.entitlement_id
     or new.policy_id is distinct from old.policy_id
     or new.plan_code is distinct from old.plan_code
     or new.stripe_price_id is distinct from old.stripe_price_id
     or new.livemode is distinct from old.livemode
     or new.created_at is distinct from old.created_at then
    raise exception 'Stripe subscription ownership and commercial policy are immutable'
      using errcode = '23514';
  end if;
  if new.last_event_created < old.last_event_created then
    raise exception 'Stripe subscription events cannot move backwards'
      using errcode = '23514';
  end if;
  if new.last_event_created = old.last_event_created
     and new.last_event_id is distinct from old.last_event_id
     and old.entitlement_status = 'cancelled' then
    raise exception 'A terminal Stripe subscription cannot be replaced by a same-second event'
      using errcode = '23514';
  end if;
  if new.last_event_created = old.last_event_created
     and new.last_event_id is distinct from old.last_event_id
     and new.entitlement_status <> 'cancelled' then
    raise exception 'Different same-second Stripe events cannot reorder subscription state'
      using errcode = '23514';
  end if;
  if old.entitlement_status = 'cancelled'
     and new.entitlement_status <> 'cancelled' then
    raise exception 'A terminal Stripe subscription cannot be resurrected'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function billing_private.protect_stripe_event_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stripe_event_id is distinct from old.stripe_event_id
     or new.event_type is distinct from old.event_type
     or new.livemode is distinct from old.livemode
     or new.intent_hash is distinct from old.intent_hash
     or new.received_at is distinct from old.received_at then
    raise exception 'Stripe webhook event identity is immutable'
      using errcode = '23514';
  end if;
  if old.status = 'processed' then
    raise exception 'Processed Stripe webhook events are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function billing_private.reject_stripe_evidence_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Stripe payment evidence is append-only'
    using errcode = '23514';
end;
$$;

create or replace function billing_private.reject_stripe_mapping_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Canonical Stripe mappings cannot be deleted'
    using errcode = '23514';
end;
$$;

drop trigger if exists protect_stripe_customer_mapping_identity
  on public.stripe_customer_mappings;
create trigger protect_stripe_customer_mapping_identity
before update on public.stripe_customer_mappings
for each row execute function billing_private.protect_stripe_customer_mapping_identity();

drop trigger if exists protect_stripe_subscription_identity
  on public.stripe_subscription_mappings;
create trigger protect_stripe_subscription_identity
before update on public.stripe_subscription_mappings
for each row execute function billing_private.protect_stripe_subscription_identity();

drop trigger if exists reject_stripe_customer_mapping_delete
  on public.stripe_customer_mappings;
create trigger reject_stripe_customer_mapping_delete
before delete on public.stripe_customer_mappings
for each row execute function billing_private.reject_stripe_mapping_delete();

drop trigger if exists reject_stripe_subscription_mapping_delete
  on public.stripe_subscription_mappings;
create trigger reject_stripe_subscription_mapping_delete
before delete on public.stripe_subscription_mappings
for each row execute function billing_private.reject_stripe_mapping_delete();

drop trigger if exists protect_stripe_event_identity
  on public.stripe_webhook_events;
create trigger protect_stripe_event_identity
before update on public.stripe_webhook_events
for each row execute function billing_private.protect_stripe_event_identity();

drop trigger if exists reject_stripe_event_delete
  on public.stripe_webhook_events;
create trigger reject_stripe_event_delete
before delete on public.stripe_webhook_events
for each row execute function billing_private.reject_stripe_evidence_mutation();

drop trigger if exists reject_stripe_bolt_on_evidence_update
  on public.stripe_bolt_on_payment_evidence;
create trigger reject_stripe_bolt_on_evidence_update
before update or delete on public.stripe_bolt_on_payment_evidence
for each row execute function billing_private.reject_stripe_evidence_mutation();

alter table public.stripe_customer_mappings enable row level security;
alter table public.stripe_subscription_mappings enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_bolt_on_payment_evidence enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on public.stripe_customer_mappings from %I', role_name);
      execute format('revoke all on public.stripe_subscription_mappings from %I', role_name);
      execute format('revoke all on public.stripe_webhook_events from %I', role_name);
      execute format('revoke all on public.stripe_bolt_on_payment_evidence from %I', role_name);
    end if;
  end loop;
end;
$$;

revoke all on function billing_private.protect_stripe_customer_mapping_identity()
  from public;
revoke all on function billing_private.protect_stripe_subscription_identity()
  from public;
revoke all on function billing_private.protect_stripe_event_identity()
  from public;
revoke all on function billing_private.reject_stripe_evidence_mutation()
  from public;
revoke all on function billing_private.reject_stripe_mapping_delete()
  from public;
