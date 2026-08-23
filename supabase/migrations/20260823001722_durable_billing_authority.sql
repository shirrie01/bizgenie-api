-- BG-BILL-002D: durable PostgreSQL billing authority.
-- This additive migration is version-controlled for independent review.
-- It must not be applied to production by this implementation task.

-- Financial idempotency identities are server-derived and globally unique.
-- The existing account-scoped constraint remains as defense in depth.
create unique index if not exists credit_ledger_idempotency_global_unique
  on public.credit_ledger (idempotency_key);

-- A generation correlation in the ledger must identify the same immutable
-- tenant/project job established by BG-AUTH-002C.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'generation_jobs_job_tenant_project_unique'
       and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_job_tenant_project_unique
      unique (job_id, tenant_id, project_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'credit_ledger_generation_job_fkey'
       and conrelid = 'public.credit_ledger'::regclass
  ) then
    alter table public.credit_ledger
      add constraint credit_ledger_generation_job_fkey
      foreign key (generation_id, tenant_id, project_id)
      references public.generation_jobs (job_id, tenant_id, project_id)
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.credit_ledger
  validate constraint credit_ledger_generation_job_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'credit_ledger_generation_authority_shape'
       and conrelid = 'public.credit_ledger'::regclass
  ) then
    alter table public.credit_ledger
      add constraint credit_ledger_generation_authority_shape
      check (
        entry_type not in (
          'reservation', 'reservation_release', 'debit', 'refund'
        )
        or (
          generation_id is not null
          and project_id is not null
          and execution_id is not null
          and transaction_correlation_id is not null
        )
      ) not valid;
  end if;
end;
$$;

alter table public.credit_ledger
  validate constraint credit_ledger_generation_authority_shape;

-- The application repository derives these values before INSERT. This
-- trigger is the database-level backstop against a privileged application
-- bug bypassing the repository's tenant/job/amount/reference checks.
create or replace function billing_private.validate_credit_ledger_authority()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  related public.credit_ledger%rowtype;
  authoritative_cost bigint;
  evidence_credits bigint;
begin
  if new.entry_type = 'reservation' then
    select price.credit_cost
      into authoritative_cost
      from public.generation_jobs as job
      join public.tenant_entitlements as entitlement
        on entitlement.tenant_id = job.tenant_id
       and entitlement.status in ('active', 'grace', 'cancel_pending')
       and entitlement.starts_at <= new.occurred_at
       and (entitlement.ends_at is null or new.occurred_at < entitlement.ends_at)
      join public.commercial_policies as policy
        on policy.policy_id = entitlement.policy_id
       and policy.plan_code = entitlement.plan_code
       and policy.status = 'active'
       and policy.effective_from <= new.occurred_at
       and (policy.effective_to is null or new.occurred_at < policy.effective_to)
      join public.commercial_execution_prices as price
        on price.policy_id = policy.policy_id
       and price.execution_class = job.execution_class
     where job.job_id = new.generation_id
       and job.tenant_id = new.tenant_id
       and job.project_id = new.project_id
       and job.request_correlation_id = new.execution_id
       and job.request_correlation_id = new.transaction_correlation_id;

    if authoritative_cost is null or authoritative_cost <> new.amount then
      raise exception 'reservation authority does not match the generation job and policy'
        using errcode = '23514';
    end if;
  elsif new.entry_type in ('reservation_release', 'debit') then
    select * into related
      from public.credit_ledger
     where ledger_entry_id = new.reservation_entry_id
       and account_id = new.account_id
       and tenant_id = new.tenant_id;

    if related.entry_type is distinct from 'reservation'
       or new.amount is distinct from related.amount
       or new.project_id is distinct from related.project_id
       or new.generation_id is distinct from related.generation_id
       or new.execution_id is distinct from related.execution_id
       or new.transaction_correlation_id is distinct from related.transaction_correlation_id then
      raise exception 'settlement authority does not match the original reservation'
        using errcode = '23514';
    end if;
  elsif new.entry_type = 'refund' then
    select * into related
      from public.credit_ledger
     where ledger_entry_id = new.debit_entry_id
       and account_id = new.account_id
       and tenant_id = new.tenant_id;

    if related.entry_type is distinct from 'debit'
       or new.amount is distinct from related.amount
       or new.project_id is distinct from related.project_id
       or new.generation_id is distinct from related.generation_id
       or new.execution_id is distinct from related.execution_id
       or new.transaction_correlation_id is distinct from related.transaction_correlation_id then
      raise exception 'refund authority does not match the original debit'
        using errcode = '23514';
    end if;
  elsif new.entry_type = 'monthly_grant' then
    perform 1
      from public.tenant_entitlements as entitlement
     where entitlement.entitlement_id = new.entitlement_id
       and entitlement.tenant_id = new.tenant_id
       and entitlement.status in ('active', 'grace', 'cancel_pending')
       and entitlement.starts_at <= new.occurred_at
       and (entitlement.ends_at is null or new.occurred_at < entitlement.ends_at)
       and entitlement.included_monthly_credit_grant = new.amount
       and entitlement.reference_period_start = new.reference_period_start
       and entitlement.reference_period_end = new.reference_period_end;

    if not found then
      raise exception 'monthly grant authority does not match the entitlement period'
        using errcode = '23514';
    end if;
  elsif new.entry_type = 'bolt_on_grant' then
    select evidence.credits
      into evidence_credits
      from public.stripe_bolt_on_payment_evidence as evidence
     where evidence.payment_reference = new.payment_ref
       and evidence.tenant_id = new.tenant_id
       and evidence.status = 'verified'
       and (
         new.stripe_event_ref is null
         or evidence.stripe_event_id = new.stripe_event_ref
       );

    if evidence_credits is null or evidence_credits <> new.amount then
      raise exception 'bolt-on grant authority does not match verified payment evidence'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_credit_ledger_authority
  on public.credit_ledger;
create trigger validate_credit_ledger_authority
before insert on public.credit_ledger
for each row execute function billing_private.validate_credit_ledger_authority();

revoke all on function billing_private.validate_credit_ledger_authority()
  from public;

-- Repeat the financial privilege boundary after adding the authority guard so
-- future default grants cannot make the journal customer-writable.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table public.credit_ledger from %I', role_name);
      execute format('revoke all on table public.credit_accounts from %I', role_name);
      execute format('revoke all on table public.tenant_entitlements from %I', role_name);
      execute format('revoke all on table public.commercial_policies from %I', role_name);
      execute format('revoke all on table public.commercial_execution_prices from %I', role_name);
      execute format('revoke all on table public.credit_account_balances_internal from %I', role_name);
    end if;
  end loop;
end;
$$;

comment on function billing_private.validate_credit_ledger_authority() is
  'Database backstop for immutable generation, entitlement, settlement, refund, and bolt-on authority.';
