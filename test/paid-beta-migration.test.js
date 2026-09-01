const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260901170000_create_paid_beta_interest_capture.sql"
), "utf8");

describe("paid-beta capture migration contract", () => {
  it("creates a dedicated domain without Auth, Billing, tenant, or generation authority", () => {
    assert.match(migration, /create table if not exists public\.paid_beta_interests/i);
    assert.match(migration, /create table if not exists public\.paid_beta_interest_receipts/i);
    assert.match(migration, /create table if not exists public\.paid_beta_rate_limit_buckets/i);
    const tableDefinitions = migration.slice(0, migration.indexOf("create index"));
    assert.doesNotMatch(tableDefinitions, /tenant_id|auth_user_id|subscription|entitlement|credit|generation_job|provider|model/i);
  });

  it("enforces dedupe, idempotency, consent evidence, bounds, and justified indexes", () => {
    assert.match(migration, /paid_beta_interests_email_unique unique \(work_email\)/i);
    assert.match(migration, /paid_beta_interest_receipts_submission_unique unique \(submission_identity\)/i);
    assert.match(migration, /consent_version text not null/i);
    assert.match(migration, /consent_wording text not null/i);
    assert.match(migration, /consented_at timestamptz not null/i);
    assert.match(migration, /primary_marketing_challenge[\s\S]*length\(primary_marketing_challenge\) between 1 and 1000/i);
    assert.match(migration, /paid_beta_interests_created_idx/i);
    assert.match(migration, /paid_beta_rate_limit_expiry_idx/i);
  });

  it("enables RLS, revokes customer-facing roles, and protects evidence mutation", () => {
    for (const table of [
      "paid_beta_interests",
      "paid_beta_interest_receipts",
      "paid_beta_rate_limit_buckets",
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(migration, new RegExp(`revoke all on table public\\.${table}`, "i"));
    }
    assert.match(migration, /array\['anon', 'authenticated', 'service_role'\]/i);
    assert.match(migration, /protect_paid_beta_interests[\s\S]*before update or delete/i);
    assert.match(migration, /protect_paid_beta_interest_receipts[\s\S]*before update or delete/i);
    assert.doesNotMatch(migration, /create policy/i);
  });
});
