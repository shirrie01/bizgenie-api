create schema if not exists billing_private;
revoke all on schema billing_private from public;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'projects_project_tenant_unique'
       and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_project_tenant_unique
      unique (project_id, tenant_id);
  end if;
end;
$$;

create table if not exists public.commercial_policies (
  policy_id text primary key,
  plan_code text not null,
  policy_version integer not null,
  status text not null,
  included_monthly_credits bigint not null,
  bolt_on_eligible boolean not null default false,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint commercial_policies_identity_format check (
    length(policy_id) between 1 and 128
    and policy_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    and length(plan_code) between 1 and 128
    and plan_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint commercial_policies_status_allowed check (
    status in ('draft', 'active', 'retired')
  ),
  constraint commercial_policies_version_positive check (policy_version > 0),
  constraint commercial_policies_included_credits_nonnegative check (
    included_monthly_credits >= 0
  ),
  constraint commercial_policies_effective_window check (
    effective_to is null or effective_to > effective_from
  ),
  constraint commercial_policies_plan_version_unique
    unique (plan_code, policy_version),
  constraint commercial_policies_policy_plan_unique
    unique (policy_id, plan_code)
);

create table if not exists public.commercial_execution_prices (
  policy_id text not null
    references public.commercial_policies (policy_id) on delete restrict,
  execution_class text not null,
  credit_cost bigint not null,
  created_at timestamptz not null default current_timestamp,
  primary key (policy_id, execution_class),
  constraint commercial_execution_prices_class_format check (
    length(execution_class) between 3 and 100
    and execution_class ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
  ),
  constraint commercial_execution_prices_cost_positive check (credit_cost > 0)
);

create table if not exists public.tenant_entitlements (
  entitlement_id text primary key,
  tenant_id text not null
    references public.tenants (tenant_id) on delete restrict,
  policy_id text not null,
  plan_code text not null,
  status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  reference_period_start timestamptz not null,
  reference_period_end timestamptz not null,
  included_monthly_credit_grant bigint not null,
  stripe_subscription_ref text,
  cancellation_effective_at timestamptz,
  grace_ends_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  constraint tenant_entitlements_policy_plan_fkey
    foreign key (policy_id, plan_code)
    references public.commercial_policies (policy_id, plan_code)
    on delete restrict,
  constraint tenant_entitlements_identity_format check (
    length(entitlement_id) between 1 and 128
    and entitlement_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint tenant_entitlements_status_allowed check (
    status in ('active', 'inactive', 'grace', 'cancel_pending', 'cancelled')
  ),
  constraint tenant_entitlements_window_valid check (
    (ends_at is null or ends_at > starts_at)
    and reference_period_end > reference_period_start
  ),
  constraint tenant_entitlements_grant_nonnegative check (
    included_monthly_credit_grant >= 0
  ),
  constraint tenant_entitlements_entitlement_tenant_unique
    unique (entitlement_id, tenant_id)
);

create table if not exists public.credit_accounts (
  account_id text primary key,
  tenant_id text not null unique
    references public.tenants (tenant_id) on delete restrict,
  status text not null default 'active',
  created_at timestamptz not null default current_timestamp,
  constraint credit_accounts_identity_format check (
    length(account_id) between 1 and 128
    and account_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint credit_accounts_status_allowed check (
    status in ('active', 'frozen', 'closed')
  ),
  constraint credit_accounts_account_tenant_unique
    unique (account_id, tenant_id)
);

create table if not exists public.credit_ledger (
  ledger_entry_id text primary key,
  account_id text not null,
  tenant_id text not null,
  entry_type text not null,
  amount bigint not null,
  balance_delta bigint not null,
  reserved_delta bigint not null,
  idempotency_key text not null,
  intent_hash text not null,
  project_id text,
  generation_id text,
  execution_id text,
  transaction_correlation_id text,
  entitlement_id text,
  reference_period_start timestamptz,
  reference_period_end timestamptz,
  stripe_event_ref text,
  payment_ref text,
  provider_cost_evidence_ref text,
  reservation_entry_id text,
  debit_entry_id text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default current_timestamp,
  constraint credit_ledger_account_tenant_fkey
    foreign key (account_id, tenant_id)
    references public.credit_accounts (account_id, tenant_id)
    on delete restrict,
  constraint credit_ledger_project_tenant_fkey
    foreign key (project_id, tenant_id)
    references public.projects (project_id, tenant_id)
    on delete restrict,
  constraint credit_ledger_entitlement_tenant_fkey
    foreign key (entitlement_id, tenant_id)
    references public.tenant_entitlements (entitlement_id, tenant_id)
    on delete restrict,
  constraint credit_ledger_entry_account_tenant_unique
    unique (ledger_entry_id, account_id, tenant_id),
  constraint credit_ledger_reservation_account_fkey
    foreign key (reservation_entry_id, account_id, tenant_id)
    references public.credit_ledger (ledger_entry_id, account_id, tenant_id)
    on delete restrict,
  constraint credit_ledger_debit_account_fkey
    foreign key (debit_entry_id, account_id, tenant_id)
    references public.credit_ledger (ledger_entry_id, account_id, tenant_id)
    on delete restrict,
  constraint credit_ledger_identity_format check (
    length(ledger_entry_id) between 1 and 128
    and ledger_entry_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    and length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  constraint credit_ledger_intent_hash_format check (
    intent_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint credit_ledger_entry_type_allowed check (
    entry_type in (
      'monthly_grant',
      'bolt_on_grant',
      'reservation',
      'reservation_release',
      'debit',
      'refund',
      'admin_adjustment',
      'expiry_reset'
    )
  ),
  constraint credit_ledger_amount_positive check (amount > 0),
  constraint credit_ledger_delta_convention check (
    case entry_type
      when 'monthly_grant' then balance_delta = amount and reserved_delta = 0
      when 'bolt_on_grant' then balance_delta = amount and reserved_delta = 0
      when 'reservation' then balance_delta = 0 and reserved_delta = amount
      when 'reservation_release' then balance_delta = 0 and reserved_delta = -amount
      when 'debit' then balance_delta = -amount and reserved_delta = -amount
      when 'refund' then balance_delta = amount and reserved_delta = 0
      when 'admin_adjustment' then
        balance_delta in (amount, -amount) and reserved_delta = 0
      when 'expiry_reset' then balance_delta = -amount and reserved_delta = 0
      else false
    end
  ),
  constraint credit_ledger_correlation_shape check (
    case entry_type
      when 'monthly_grant' then
        entitlement_id is not null
        and reference_period_start is not null
        and reference_period_end is not null
        and reservation_entry_id is null
        and debit_entry_id is null
      when 'bolt_on_grant' then
        payment_ref is not null
        and reservation_entry_id is null
        and debit_entry_id is null
      when 'reservation' then
        project_id is not null
        and generation_id is not null
        and execution_id is not null
        and transaction_correlation_id is not null
        and reservation_entry_id is null
        and debit_entry_id is null
      when 'reservation_release' then
        reservation_entry_id is not null and debit_entry_id is null
      when 'debit' then
        reservation_entry_id is not null and debit_entry_id is null
      when 'refund' then
        debit_entry_id is not null and reservation_entry_id is null
      when 'admin_adjustment' then
        transaction_correlation_id is not null
        and reservation_entry_id is null
        and debit_entry_id is null
      when 'expiry_reset' then
        reservation_entry_id is null and debit_entry_id is null
      else false
    end
  ),
  constraint credit_ledger_period_valid check (
    reference_period_end is null
    or (
      reference_period_start is not null
      and reference_period_end > reference_period_start
    )
  ),
  constraint credit_ledger_account_idempotency_unique
    unique (account_id, idempotency_key)
);

create index if not exists commercial_policies_active_effective_idx
  on public.commercial_policies (plan_code, status, effective_from, effective_to);
create index if not exists tenant_entitlements_tenant_period_idx
  on public.tenant_entitlements (
    tenant_id,
    status,
    starts_at,
    ends_at,
    reference_period_start,
    reference_period_end
  );
create unique index if not exists tenant_entitlements_one_serving_idx
  on public.tenant_entitlements (tenant_id)
  where status in ('active', 'grace', 'cancel_pending');
create index if not exists credit_ledger_account_created_idx
  on public.credit_ledger (account_id, created_at, ledger_entry_id);
create index if not exists credit_ledger_tenant_project_created_idx
  on public.credit_ledger (tenant_id, project_id, created_at)
  where project_id is not null;
create index if not exists credit_ledger_generation_idx
  on public.credit_ledger (tenant_id, generation_id)
  where generation_id is not null;
create index if not exists credit_ledger_execution_idx
  on public.credit_ledger (tenant_id, execution_id)
  where execution_id is not null;
create unique index if not exists credit_ledger_monthly_grant_unique
  on public.credit_ledger (
    account_id,
    entitlement_id,
    reference_period_start
  )
  where entry_type = 'monthly_grant';
create unique index if not exists credit_ledger_bolt_on_payment_unique
  on public.credit_ledger (account_id, payment_ref)
  where entry_type = 'bolt_on_grant';
create unique index if not exists credit_ledger_generation_reservation_unique
  on public.credit_ledger (account_id, generation_id)
  where entry_type = 'reservation';
create unique index if not exists credit_ledger_reservation_settlement_unique
  on public.credit_ledger (account_id, reservation_entry_id)
  where entry_type in ('reservation_release', 'debit');
create unique index if not exists credit_ledger_debit_refund_unique
  on public.credit_ledger (account_id, debit_entry_id)
  where entry_type = 'refund';

create or replace function billing_private.protect_commercial_policy_economics()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'commercial policy versions cannot be deleted'
      using errcode = '23514';
  end if;

  if new.policy_id is distinct from old.policy_id
    or new.plan_code is distinct from old.plan_code
    or new.policy_version is distinct from old.policy_version
    or new.included_monthly_credits is distinct from old.included_monthly_credits
    or new.bolt_on_eligible is distinct from old.bolt_on_eligible
    or new.effective_from is distinct from old.effective_from
    or new.effective_to is distinct from old.effective_to
    or new.created_at is distinct from old.created_at then
    raise exception 'commercial policy economics are immutable; create a new policy version'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status
    and not (
      (old.status = 'draft' and new.status in ('active', 'retired'))
      or (old.status = 'active' and new.status = 'retired')
    ) then
    raise exception 'commercial policy status transition is not allowed'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_commercial_policy_economics
  on public.commercial_policies;
create trigger protect_commercial_policy_economics
before update or delete on public.commercial_policies
for each row execute function billing_private.protect_commercial_policy_economics();

create or replace function billing_private.protect_commercial_execution_prices()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  policy_status text;
begin
  if tg_op = 'INSERT' then
    select policy.status
      into policy_status
      from public.commercial_policies as policy
     where policy.policy_id = new.policy_id
     for key share;

    if policy_status is distinct from 'draft' then
      raise exception 'execution prices can only be added to a draft policy version'
        using errcode = '23514';
    end if;

    return new;
  end if;

  raise exception 'execution-class prices are immutable; create a new policy version'
    using errcode = '23514';
end;
$$;

drop trigger if exists protect_commercial_execution_prices
  on public.commercial_execution_prices;
create trigger protect_commercial_execution_prices
before insert or update or delete on public.commercial_execution_prices
for each row execute function billing_private.protect_commercial_execution_prices();

create or replace function billing_private.protect_tenant_entitlement_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.entitlement_id is distinct from old.entitlement_id
    or new.tenant_id is distinct from old.tenant_id
    or new.created_at is distinct from old.created_at then
    raise exception 'tenant entitlement identity and ownership are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_tenant_entitlement_identity
  on public.tenant_entitlements;
create trigger protect_tenant_entitlement_identity
before update on public.tenant_entitlements
for each row execute function billing_private.protect_tenant_entitlement_identity();

create or replace function billing_private.validate_credit_ledger_settlement_type()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_entry_type text;
begin
  if new.entry_type in ('reservation_release', 'debit') then
    select ledger.entry_type
      into referenced_entry_type
      from public.credit_ledger as ledger
     where ledger.ledger_entry_id = new.reservation_entry_id
       and ledger.account_id = new.account_id
       and ledger.tenant_id = new.tenant_id;

    if referenced_entry_type is distinct from 'reservation' then
      raise exception 'reservation settlement must reference a reservation entry'
        using errcode = '23514';
    end if;
  elsif new.entry_type = 'refund' then
    select ledger.entry_type
      into referenced_entry_type
      from public.credit_ledger as ledger
     where ledger.ledger_entry_id = new.debit_entry_id
       and ledger.account_id = new.account_id
       and ledger.tenant_id = new.tenant_id;

    if referenced_entry_type is distinct from 'debit' then
      raise exception 'refund must reference a debit entry'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_credit_ledger_settlement_type
  on public.credit_ledger;
create trigger validate_credit_ledger_settlement_type
before insert on public.credit_ledger
for each row execute function billing_private.validate_credit_ledger_settlement_type();

create or replace function billing_private.reject_credit_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit ledger entries are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists reject_credit_ledger_update on public.credit_ledger;
create trigger reject_credit_ledger_update
before update on public.credit_ledger
for each row execute function billing_private.reject_credit_ledger_mutation();

drop trigger if exists reject_credit_ledger_delete on public.credit_ledger;
create trigger reject_credit_ledger_delete
before delete on public.credit_ledger
for each row execute function billing_private.reject_credit_ledger_mutation();

create or replace function billing_private.protect_credit_account_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_id is distinct from old.account_id
    or new.tenant_id is distinct from old.tenant_id
    or new.created_at is distinct from old.created_at then
    raise exception 'credit account identity is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_credit_account_identity
  on public.credit_accounts;
create trigger protect_credit_account_identity
before update on public.credit_accounts
for each row execute function billing_private.protect_credit_account_identity();

create or replace view public.credit_account_balances_internal
with (security_invoker = true)
as
select
  account.account_id,
  account.tenant_id,
  coalesce(sum(ledger.balance_delta), 0)::bigint as ledger_balance,
  coalesce(sum(ledger.reserved_delta), 0)::bigint as reserved_balance,
  (
    coalesce(sum(ledger.balance_delta), 0)
    - coalesce(sum(ledger.reserved_delta), 0)
  )::bigint as available_balance,
  coalesce(
    sum(ledger.amount) filter (where ledger.entry_type = 'debit'),
    0
  )::bigint as debited_credits,
  coalesce(
    sum(ledger.amount) filter (where ledger.entry_type = 'refund'),
    0
  )::bigint as refunded_credits,
  (
    coalesce(sum(ledger.amount) filter (where ledger.entry_type = 'debit'), 0)
    - coalesce(sum(ledger.amount) filter (where ledger.entry_type = 'refund'), 0)
  )::bigint as net_spent_credits
from public.credit_accounts as account
left join public.credit_ledger as ledger
  on ledger.account_id = account.account_id
 and ledger.tenant_id = account.tenant_id
group by account.account_id, account.tenant_id;

alter table public.commercial_policies enable row level security;
alter table public.commercial_execution_prices enable row level security;
alter table public.tenant_entitlements enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format(
        'revoke all on table public.commercial_policies from %I',
        role_name
      );
      execute format(
        'revoke all on table public.commercial_execution_prices from %I',
        role_name
      );
      execute format(
        'revoke all on table public.tenant_entitlements from %I',
        role_name
      );
      execute format(
        'revoke all on table public.credit_accounts from %I',
        role_name
      );
      execute format(
        'revoke all on table public.credit_ledger from %I',
        role_name
      );
      execute format(
        'revoke all on table public.credit_account_balances_internal from %I',
        role_name
      );
    end if;
  end loop;
end;
$$;

revoke all on function billing_private.reject_credit_ledger_mutation()
  from public;
revoke all on function billing_private.protect_credit_account_identity()
  from public;
revoke all on function billing_private.protect_commercial_policy_economics()
  from public;
revoke all on function billing_private.protect_commercial_execution_prices()
  from public;
revoke all on function billing_private.protect_tenant_entitlement_identity()
  from public;
revoke all on function billing_private.validate_credit_ledger_settlement_type()
  from public;

comment on table public.commercial_policies is
  'Versioned BizGenie plan policy; contains no provider names, raw costs, or Stripe payloads.';
comment on table public.commercial_execution_prices is
  'Provider-neutral execution-class prices such as text.standard and video.premium.';
comment on table public.tenant_entitlements is
  'Tenant-bound access and billing-period entitlement; request user_id is never financial authority.';
comment on table public.credit_accounts is
  'One tenant credit account. No mutable balance is stored; balances derive from the immutable ledger.';
comment on table public.credit_ledger is
  'Append-only credit journal. Positive balance_delta adds credits; positive reserved_delta holds credits.';
comment on view public.credit_account_balances_internal is
  'Internal derived balance projection. A separately reviewed customer-safe view is required before exposure.';

-- Persistent repositories must perform each financial write in a short
-- transaction: SELECT the tenant account FOR UPDATE, resolve any idempotent
-- replay or conflict, derive balances from credit_ledger, reject negative
-- available/reserved values, INSERT exactly one row, then COMMIT. The unique
-- indexes above provide the final duplicate-effect guard. Provider and Stripe
-- calls must occur outside the account-row lock.
