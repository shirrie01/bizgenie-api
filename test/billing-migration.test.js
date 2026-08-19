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
    "20260819231206_create_commercial_credit_ledger_foundation.sql"
  ),
  "utf8"
);

describe("commercial credit ledger migration", () => {
  it("creates versioned provider-neutral policy and execution pricing", () => {
    assert.match(migration, /create table if not exists public\.commercial_policies/i);
    assert.match(migration, /unique \(plan_code, policy_version\)/i);
    assert.match(migration, /create table if not exists public\.commercial_execution_prices/i);
    assert.match(migration, /execution_class ~ '\^\[a-z\]/i);
    const policyTable = migration.slice(
      migration.indexOf("create table if not exists public.commercial_policies"),
      migration.indexOf("create table if not exists public.commercial_execution_prices")
    );
    assert.doesNotMatch(policyTable, /provider|model|api_cost|margin/i);
  });

  it("requires a new policy version for every economic or price change", () => {
    const policyProtection = migration.slice(
      migration.indexOf(
        "create or replace function billing_private.protect_commercial_policy_economics"
      ),
      migration.indexOf(
        "create or replace function billing_private.protect_commercial_execution_prices"
      )
    );

    for (const column of [
      "policy_id",
      "plan_code",
      "policy_version",
      "included_monthly_credits",
      "bolt_on_eligible",
      "effective_from",
      "effective_to",
      "created_at",
    ]) {
      assert.match(
        policyProtection,
        new RegExp(`new\\.${column} is distinct from old\\.${column}`, "i")
      );
    }

    assert.match(policyProtection, /old\.status = 'draft'[\s\S]*new\.status in \('active', 'retired'\)/i);
    assert.match(policyProtection, /old\.status = 'active'[\s\S]*new\.status = 'retired'/i);
    assert.match(policyProtection, /commercial policy versions cannot be deleted/i);
    assert.match(
      policyProtection,
      /before update or delete on public\.commercial_policies/i
    );

    const priceProtection = migration.slice(
      migration.indexOf(
        "create or replace function billing_private.protect_commercial_execution_prices"
      ),
      migration.indexOf(
        "create or replace function billing_private.protect_tenant_entitlement_identity"
      )
    );
    assert.match(priceProtection, /policy_status is distinct from 'draft'/i);
    assert.match(priceProtection, /execution-class prices are immutable/i);
    assert.match(
      priceProtection,
      /before insert or update or delete on public\.commercial_execution_prices/i
    );
  });

  it("binds serving entitlement and one account to canonical tenants", () => {
    assert.match(migration, /tenant_id text not null[\s\S]*references public\.tenants/i);
    assert.match(migration, /tenant_entitlements_one_serving_idx/i);
    assert.match(migration, /tenant_id text not null unique[\s\S]*references public\.tenants/i);
    const accountTable = migration.slice(
      migration.indexOf("create table if not exists public.credit_accounts"),
      migration.indexOf("create table if not exists public.credit_ledger")
    );
    assert.doesNotMatch(accountTable, /\bbalance\b/i);
  });

  it("rejects cross-tenant entitlement correlation and immutable ownership changes", () => {
    assert.match(
      migration,
      /tenant_entitlements_entitlement_tenant_unique[\s\S]*unique \(entitlement_id, tenant_id\)/i
    );
    assert.match(
      migration,
      /credit_ledger_entitlement_tenant_fkey[\s\S]*foreign key \(entitlement_id, tenant_id\)[\s\S]*references public\.tenant_entitlements \(entitlement_id, tenant_id\)/i
    );

    const entitlementProtection = migration.slice(
      migration.indexOf(
        "create or replace function billing_private.protect_tenant_entitlement_identity"
      ),
      migration.indexOf(
        "create or replace function billing_private.validate_credit_ledger_settlement_type"
      )
    );
    for (const column of ["entitlement_id", "tenant_id", "created_at"]) {
      assert.match(
        entitlementProtection,
        new RegExp(`new\\.${column} is distinct from old\\.${column}`, "i")
      );
    }
    assert.match(entitlementProtection, /before update on public\.tenant_entitlements/i);
  });

  it("enforces append-only journal deltas and derived balances", () => {
    assert.match(migration, /credit_ledger_delta_convention/i);
    assert.match(migration, /reject_credit_ledger_update/i);
    assert.match(migration, /reject_credit_ledger_delete/i);
    assert.match(migration, /credit_account_balances_internal/i);
    assert.match(migration, /available_balance/i);
    assert.match(migration, /reserved_balance/i);
    assert.match(migration, /net_spent_credits/i);
  });

  it("guards idempotency and every duplicate logical effect", () => {
    for (const constraint of [
      "credit_ledger_account_idempotency_unique",
      "credit_ledger_monthly_grant_unique",
      "credit_ledger_bolt_on_payment_unique",
      "credit_ledger_generation_reservation_unique",
      "credit_ledger_reservation_settlement_unique",
      "credit_ledger_debit_refund_unique",
    ]) {
      assert.match(migration, new RegExp(constraint, "i"));
    }
  });

  it("makes project and financial correlations tenant scoped", () => {
    assert.match(migration, /projects_project_tenant_unique/i);
    assert.match(migration, /foreign key \(project_id, tenant_id\)/i);
    assert.match(
      migration,
      /foreign key \(reservation_entry_id, account_id, tenant_id\)/i
    );
    assert.match(migration, /foreign key \(debit_entry_id, account_id, tenant_id\)/i);
  });

  it("validates reservation and debit reference entry types on insertion", () => {
    const settlementValidation = migration.slice(
      migration.indexOf(
        "create or replace function billing_private.validate_credit_ledger_settlement_type"
      ),
      migration.indexOf(
        "create or replace function billing_private.reject_credit_ledger_mutation"
      )
    );

    assert.match(
      settlementValidation,
      /new\.entry_type in \('reservation_release', 'debit'\)[\s\S]*new\.reservation_entry_id[\s\S]*referenced_entry_type is distinct from 'reservation'/i
    );
    assert.match(
      settlementValidation,
      /new\.entry_type = 'refund'[\s\S]*new\.debit_entry_id[\s\S]*referenced_entry_type is distinct from 'debit'/i
    );
    assert.match(settlementValidation, /before insert on public\.credit_ledger/i);
    assert.doesNotMatch(settlementValidation, /constraint[\s\S]*check/i);
  });

  it("keeps every financial table server-only and RLS-ready", () => {
    for (const table of [
      "commercial_policies",
      "commercial_execution_prices",
      "tenant_entitlements",
      "credit_accounts",
      "credit_ledger",
    ]) {
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`, "i")
      );
    }
    assert.match(migration, /array\['anon', 'authenticated', 'service_role'\]/i);
    assert.match(migration, /with \(security_invoker = true\)/i);
  });

  it("documents the account-row locking transaction required by Postgres", () => {
    assert.match(migration, /select the tenant account for update/i);
    assert.match(migration, /provider and stripe[\s\S]*outside the account-row lock/i);
  });
});
