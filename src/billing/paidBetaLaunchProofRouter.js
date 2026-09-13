const express = require("express");
const { activatePaidBetaStandardV1 } = require("./paidBetaProvisioning");

const FONZO_LAUNCH_PROOF = Object.freeze({
  tenantId: "tenant_6e444428829446f0877d115bbf3b38ba",
  accountId: "account_fonzo_paid_beta_v1",
  entitlementId: "entitlement_fonzo_paid_beta_standard_v1",
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
});

function createPaidBetaLaunchProofRouter({ env = process.env, billing, activation = activatePaidBetaStandardV1, logger = console } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (env.PAID_BETA_LAUNCH_PROOF_ENABLED !== "true") return res.status(404).json({ error: "Not found" });
    if (!env.ADMIN_KEY || req.header("x-admin-key") !== env.ADMIN_KEY) return res.status(403).json({ error: "Forbidden" });
    next();
  });
  router.post("/fonzo/activate", async (req, res, next) => {
    try {
      if (!billing?.billingRepository || !billing?.billingService) return res.status(503).json({ error: "Billing unavailable" });
      if (req.body && Object.keys(req.body).length > 0) return res.status(400).json({ error: "This launch-proof action accepts no request fields" });
      const grant = await activation({ repository: billing.billingRepository, billingService: billing.billingService, ...FONZO_LAUNCH_PROOF });
      const account = await billing.billingRepository.getCreditAccountByTenant(FONZO_LAUNCH_PROOF.tenantId);
      const balance = await billing.billingService.readBalance({ tenantId: FONZO_LAUNCH_PROOF.tenantId });
      return res.json({ tenant_id: FONZO_LAUNCH_PROOF.tenantId, account_id: account?.account_id, entitlement_id: FONZO_LAUNCH_PROOF.entitlementId, grant_ledger_entry_id: grant.ledger_entry_id, available_balance: balance.available_balance });
    } catch (error) {
      logger.error?.("Paid-Beta launch proof activation failed", { code: error.code, name: error.name });
      next(error);
    }
  });
  return router;
}

module.exports = { FONZO_LAUNCH_PROOF, createPaidBetaLaunchProofRouter };
