const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/20260913020000_seed_paid_beta_standard_v1.sql", "utf8");

describe("Paid-Beta v1 billing activation migration", () => {
  it("seeds only the founder-approved versioned text policy and cost", () => {
    assert.match(migration, /paid-beta-standard-v1/);
    assert.match(migration, /'standard', 1, 'draft', 60, true/);
    assert.match(migration, /'paid-beta-standard-v1', 'text\.standard', 1/);
    assert.doesNotMatch(migration, /image\.normal|image\.premium|video\.normal|video\.premium/);
    assert.match(migration, /status = 'active'/);
  });

  it("uses an idempotent server-side Fonzo entitlement/account/monthly-grant path", () => {
    assert.match(migration, /provision_paid_beta_standard_v1/);
    assert.match(migration, /on conflict \(tenant_id\) do nothing/);
    assert.match(migration, /on conflict \(entitlement_id\) do nothing/);
    assert.match(migration, /included_monthly_credit_grant[\s\S]*p_period_start, p_period_start, p_period_end, 60/);
    assert.doesNotMatch(migration, /credit_ledger/);
    assert.doesNotMatch(migration, /intent_hash/);
    assert.match(migration, /returns table \(entitlement_id text, account_id text, grant_ledger_entry_id text\)/i);
    assert.match(migration, /revoke all on function billing_private\.provision_paid_beta_standard_v1/);
  });
});
