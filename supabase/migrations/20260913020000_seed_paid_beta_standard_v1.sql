-- BG-COM-002: founder-approved, provisional Paid-Beta v1 activation data.
-- This migration is versioned authority; it is not a production application
-- instruction. It deliberately seeds text.standard only.
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
  v_grant_id text := 'monthly:' || p_entitlement_id || ':' || p_period_start::text;
begin
  insert into public.credit_accounts (account_id, tenant_id)
  values (p_account_id, p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.tenant_entitlements (
    entitlement_id, tenant_id, policy_id, plan_code, status, starts_at,
    reference_period_start, reference_period_end, included_monthly_credit_grant
  ) values (
    p_entitlement_id, p_tenant_id, 'paid-beta-standard-v1', 'standard', 'active',
    p_period_start, p_period_start, p_period_end, 60
  ) on conflict (entitlement_id) do nothing;

  insert into public.credit_ledger (
    ledger_entry_id, account_id, tenant_id, entry_type, amount,
    balance_delta, reserved_delta, idempotency_key, intent_hash,
    entitlement_id, reference_period_start, reference_period_end, occurred_at
  ) values (
    'grant:' || md5(v_grant_id), p_account_id, p_tenant_id, 'monthly_grant', 60,
    60, 0, v_grant_id, repeat(md5(v_grant_id), 2),
    p_entitlement_id, p_period_start, p_period_end, current_timestamp
  ) on conflict (account_id, idempotency_key) do nothing;

  return query select p_entitlement_id, p_account_id, 'grant:' || md5(v_grant_id);
end;
$$;

revoke all on function billing_private.provision_paid_beta_standard_v1(text,text,text,timestamptz,timestamptz) from public;
