-- BG-COM-002: founder-approved, provisional Paid-Beta v1 activation data.
-- This migration is versioned authority; it is not a production application
-- instruction. It deliberately seeds text.standard only.
do $$
begin
  if exists (
    select 1 from public.commercial_policies
    where policy_id = 'paid-beta-standard-v1'
      and (plan_code <> 'standard' or policy_version <> 1
        or included_monthly_credits <> 60 or bolt_on_eligible is distinct from true)
  ) then
    raise exception 'paid-beta-standard-v1 identity collision';
  end if;
  if exists (
    select 1 from public.commercial_execution_prices
    where policy_id = 'paid-beta-standard-v1'
      and (execution_class <> 'text.standard' or credit_cost <> 1)
  ) then
    raise exception 'paid-beta-standard-v1 execution price collision';
  end if;
end;
$$;

insert into public.commercial_policies (
  policy_id, plan_code, policy_version, status,
  included_monthly_credits, bolt_on_eligible, effective_from
) values (
  'paid-beta-standard-v1', 'standard', 1, 'draft', 60, true,
  timestamptz '2026-09-13T00:00:00Z'
) on conflict (policy_id) do nothing;

insert into public.commercial_execution_prices (policy_id, execution_class, credit_cost)
values ('paid-beta-standard-v1', 'text.standard', 1)
on conflict (policy_id, execution_class) do nothing;

update public.commercial_policies
   set status = 'active', updated_at = current_timestamp
 where policy_id = 'paid-beta-standard-v1'
   and plan_code = 'standard'
   and policy_version = 1
   and included_monthly_credits = 60
   and bolt_on_eligible = true
   and status = 'draft';

create or replace function billing_private.provision_paid_beta_standard_v1(
  p_tenant_id text,
  p_entitlement_id text,
  p_account_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (entitlement_id text, account_id text, grant_ledger_entry_id text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_id text;
  v_existing_entitlement public.tenant_entitlements;
begin
  select account_id into v_account_id
    from public.credit_accounts
   where tenant_id = p_tenant_id;
  if v_account_id is not null and v_account_id <> p_account_id then
    raise exception 'credit account identity mismatch for tenant'
      using errcode = '23505';
  end if;
  insert into public.credit_accounts (account_id, tenant_id)
  values (p_account_id, p_tenant_id)
  on conflict (tenant_id) do nothing
  returning account_id into v_account_id;
  v_account_id := coalesce(v_account_id, p_account_id);

  select * into v_existing_entitlement
    from public.tenant_entitlements
   where entitlement_id = p_entitlement_id;
  if found and (
    v_existing_entitlement.tenant_id <> p_tenant_id
    or v_existing_entitlement.policy_id <> 'paid-beta-standard-v1'
    or v_existing_entitlement.plan_code <> 'standard'
    or v_existing_entitlement.included_monthly_credit_grant <> 60
    or v_existing_entitlement.reference_period_start <> p_period_start
    or v_existing_entitlement.reference_period_end <> p_period_end
  ) then
    raise exception 'paid-beta entitlement identity collision' using errcode = '23505';
  end if;

  insert into public.tenant_entitlements (
    entitlement_id, tenant_id, policy_id, plan_code, status, starts_at,
    reference_period_start, reference_period_end, included_monthly_credit_grant
  ) values (
    p_entitlement_id, p_tenant_id, 'paid-beta-standard-v1', 'standard', 'active',
    p_period_start, p_period_start, p_period_end, 60
  ) on conflict (entitlement_id) do nothing;

  return query select p_entitlement_id, v_account_id, null::text;
end;
$$;

revoke all on function billing_private.provision_paid_beta_standard_v1(text,text,text,timestamptz,timestamptz) from public;
