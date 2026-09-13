const { InvalidFinancialOperationError } = require("./errors");

function monthlyGrantIdempotencyKey(entitlementId, periodStart) {
  const token = new Date(periodStart).toISOString().replace(/[-:.]/g, "").replace("000Z", "Z");
  return `monthly:${entitlementId}:${token}`;
}

async function activatePaidBetaStandardV1({ repository, billingService, tenantId, entitlementId, accountId, periodStart, periodEnd }) {
  const provisioned = await repository.provisionPaidBetaStandardV1({
    tenant_id: tenantId, entitlement_id: entitlementId, account_id: accountId,
    reference_period_start: periodStart, reference_period_end: periodEnd,
  });
  const account = await repository.getCreditAccountByTenant(tenantId);
  if (!account || account.account_id !== provisioned.account_id) throw new InvalidFinancialOperationError("Paid-Beta account authority mismatch");
  const entitlement = await billingService.readActiveEntitlement({ tenantId });
  if (!entitlement || entitlement.entitlement_id !== entitlementId || entitlement.policy_id !== "paid-beta-standard-v1" || entitlement.included_monthly_credit_grant !== 60) throw new InvalidFinancialOperationError("Paid-Beta entitlement authority mismatch");
  return billingService.grantMonthlyCredits({ tenantId, idempotencyKey: monthlyGrantIdempotencyKey(entitlementId, periodStart) });
}

module.exports = { activatePaidBetaStandardV1, monthlyGrantIdempotencyKey };
