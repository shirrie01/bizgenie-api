const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260823001722_durable_billing_authority.sql"
  ),
  "utf8"
);

describe("BG-BILL-002D durable billing migration", () => {
  it("keeps one ledger and makes financial idempotency global", () => {
    assert.doesNotMatch(migration, /create table[^;]+(?:ledger|balance)/i);
    assert.match(
      migration,
      /create unique index if not exists credit_ledger_idempotency_global_unique[\s\S]*on public\.credit_ledger \(idempotency_key\)/i
    );
  });

  it("binds ledger generation authority to the immutable tenant/project job", () => {
    assert.match(migration, /generation_jobs_job_tenant_project_unique/i);
    assert.match(
      migration,
      /foreign key \(generation_id, tenant_id, project_id\)[\s\S]*references public\.generation_jobs \(job_id, tenant_id, project_id\)[\s\S]*on delete restrict/i
    );
    assert.match(migration, /validate constraint credit_ledger_generation_job_fkey/i);
    assert.match(migration, /credit_ledger_generation_authority_shape/i);
  });

  it("validates server-derived cost and exact settlement/refund authority", () => {
    assert.match(migration, /validate_credit_ledger_authority/i);
    assert.match(migration, /price\.credit_cost/i);
    assert.match(migration, /job\.request_correlation_id = new\.execution_id/i);
    assert.match(migration, /new\.amount is distinct from related\.amount/i);
    assert.match(migration, /new\.generation_id is distinct from related\.generation_id/i);
    assert.match(migration, /refund authority does not match the original debit/i);
    assert.match(migration, /monthly grant authority does not match the entitlement period/i);
    assert.match(migration, /bolt-on grant authority does not match verified payment evidence/i);
  });

  it("keeps the private function and financial tables outside customer roles", () => {
    assert.doesNotMatch(migration, /security\s+definer/i);
    assert.match(migration, /set search_path = ''/i);
    assert.match(
      migration,
      /revoke all on function billing_private\.validate_credit_ledger_authority\(\)[\s\S]*from public/i
    );
    assert.match(migration, /array\['anon', 'authenticated', 'service_role'\]/i);
    for (const table of [
      "credit_ledger",
      "credit_accounts",
      "tenant_entitlements",
      "commercial_policies",
      "commercial_execution_prices",
      "credit_account_balances_internal",
    ]) {
      assert.match(
        migration,
        new RegExp(`revoke all on table public\\.${table} from %I`, "i")
      );
    }
  });
});
