-- BG-COM-002: fix the remaining PL/pgSQL output-column ambiguity in
-- Paid-Beta v1 provisioning. The RETURNS TABLE output column
-- `entitlement_id` conflicts with an unqualified ON CONFLICT target.
-- This forward-only replacement preserves all Paid-Beta economics,
-- identifiers, and billing authority.

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
  select ca.account_id into v_account_id
    from public.credit_accounts as ca
   where ca.tenant_id = p_tenant_id;
  if v_account_id is not null and v_account_id <> p_account_id then
    raise exception 'credit account identity mismatch for tenant'
      using errcode = '23505';
  end if;

  insert into public.credit_accounts (account_id, tenant_id)
  values (p_account_id, p_tenant_id)
  on conflict (tenant_id) do nothing
  returning public.credit_accounts.account_id into v_account_id;
  v_account_id := coalesce(v_account_id, p_account_id);

  select te.* into v_existing_entitlement
    from public.tenant_entitlements as te
   where te.entitlement_id = p_entitlement_id;
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
  ) on conflict on constraint tenant_entitlements_pkey do nothing;

  return query select p_entitlement_id, v_account_id, null::text;
end;
$$;

revoke all on function billing_private.provision_paid_beta_standard_v1(text,text,text,timestamptz,timestamptz) from public;
