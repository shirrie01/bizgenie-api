const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const migrationsDirectory = path.join(__dirname, "..", "supabase", "migrations");
const migrationFilename = "20260820010000_create_stripe_subscription_lifecycle.sql";
const migration = fs.readFileSync(
  path.join(migrationsDirectory, migrationFilename),
  "utf8"
);
const generationJobsMigration = fs.readFileSync(
  path.join(migrationsDirectory, "20260821000000_create_generation_jobs.sql"),
  "utf8"
);
const billingFoundationMigration = fs.readFileSync(
  path.join(
    migrationsDirectory,
    "20260819231206_create_commercial_credit_ledger_foundation.sql"
  ),
  "utf8"
);

describe("BG-BILL-002B Stripe lifecycle migration", () => {
  it("binds one canonical Stripe customer to one tenant", () => {
    assert.match(migration, /stripe_customer_mappings[\s\S]*tenant_id text primary key/i);
    assert.match(migration, /stripe_customer_id text not null unique/i);
    assert.match(migration, /stripe_customer_mappings_tenant_customer_unique/i);
  });

  it("locks subscription ownership and historical commercial policy", () => {
    assert.match(migration, /stripe_subscription_mappings_customer_tenant_fkey/i);
    assert.match(migration, /stripe_subscription_mappings_entitlement_tenant_fkey/i);
    assert.match(migration, /new\.policy_id is distinct from old\.policy_id/i);
    assert.match(migration, /new\.stripe_price_id is distinct from old\.stripe_price_id/i);
    assert.match(migration, /Stripe subscription ownership and commercial policy are immutable/i);
    assert.match(migration, /reject_stripe_customer_mapping_delete/i);
    assert.match(migration, /reject_stripe_subscription_mapping_delete/i);
  });

  it("fails safely for same-second reordering and terminal resurrection", () => {
    assert.match(migration, /new\.last_event_created = old\.last_event_created/i);
    assert.match(migration, /new\.last_event_id is distinct from old\.last_event_id/i);
    assert.match(migration, /Different same-second Stripe events cannot reorder subscription state/i);
    assert.match(migration, /A terminal Stripe subscription cannot be resurrected/i);
  });

  it("persists event identity without storing raw payment payloads", () => {
    assert.match(migration, /create table if not exists public\.stripe_webhook_events/i);
    assert.match(migration, /stripe_event_id text primary key/i);
    assert.match(migration, /intent_hash text not null/i);
    const table = migration.slice(
      migration.indexOf("create table if not exists public.stripe_webhook_events"),
      migration.indexOf("create table if not exists public.stripe_bolt_on_payment_evidence")
    );
    assert.doesNotMatch(table, /raw_payload|card_number|authorization_header/i);
  });

  it("provides append-only bolt-on evidence and server-only RLS boundaries", () => {
    assert.match(migration, /create table if not exists public\.stripe_bolt_on_payment_evidence/i);
    assert.match(migration, /payment_reference text primary key/i);
    for (const table of [
      "stripe_customer_mappings",
      "stripe_subscription_mappings",
      "stripe_webhook_events",
      "stripe_bolt_on_payment_evidence",
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
    assert.match(migration, /array\['anon', 'authenticated', 'service_role'\]/i);
    assert.doesNotMatch(migration, /security\s+definer/i);
    assert.match(
      billingFoundationMigration,
      /revoke all on schema billing_private from public/i
    );
    assert.match(migration, /reject_stripe_mapping_delete\(\)[\s\S]*from public/i);
  });

  it("orders before AUTH-002C without duplicating generation or financial authority", () => {
    const filenames = fs.readdirSync(migrationsDirectory).sort();
    assert.ok(
      filenames.indexOf(migrationFilename) <
        filenames.indexOf("20260821000000_create_generation_jobs.sql")
    );
    assert.doesNotMatch(migration, /create table if not exists public\.generation_jobs/i);
    assert.doesNotMatch(generationJobsMigration, /stripe_customer_mappings|stripe_webhook_events/i);

    const definitionNames = (sql) => [
      ...sql.matchAll(/^\s*(?:constraint|add constraint)\s+([a-z0-9_]+)/gim),
      ...sql.matchAll(/^\s*create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z0-9_]+)/gim),
    ].map((match) => match[1]);
    const stripeNames = definitionNames(migration);
    const otherNames = filenames
      .filter((filename) => filename.endsWith(".sql") && filename !== migrationFilename)
      .flatMap((filename) =>
        definitionNames(fs.readFileSync(path.join(migrationsDirectory, filename), "utf8"))
      );
    assert.equal(new Set(stripeNames).size, stripeNames.length);
    assert.deepEqual(
      stripeNames.filter((name) => new Set(otherNames).has(name)),
      []
    );
  });
});
