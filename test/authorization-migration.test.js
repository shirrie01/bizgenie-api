const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { describe, it } = require("node:test");

const migration = readFileSync(
  join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260818010000_create_customer_tenant_authorization_foundation.sql"
  ),
  "utf8"
).toLowerCase();

describe("customer tenant ownership migration", () => {
  it("anchors customer profiles to the auth.users primary key", () => {
    assert.match(migration, /auth_user_id uuid primary key/);
    assert.match(migration, /references auth\.users \(id\)/);
  });

  it("creates role-capable tenant membership with one row per user and tenant", () => {
    assert.match(migration, /primary key \(tenant_id, auth_user_id\)/);
    assert.match(migration, /role in \('owner', 'member'\)/);
    assert.match(migration, /tenant_memberships_auth_user_tenant_idx/);
  });

  it("makes every project belong to exactly one tenant", () => {
    assert.match(migration, /tenant_id text not null[\s\S]*references public\.tenants/);
    assert.match(migration, /create table if not exists public\.projects/);
    assert.match(migration, /project_id text primary key/);
  });

  it("prevents ordinary updates from transferring project ownership", () => {
    assert.match(migration, /if new\.tenant_id is distinct from old\.tenant_id/);
    assert.match(migration, /project tenant ownership is immutable/);
    assert.match(migration, /before update on public\.projects/);
  });

  it("links Brand Brain to projects without bypassing deliberate legacy backfill", () => {
    assert.match(migration, /brand_brains_project_id_fkey/);
    assert.match(migration, /foreign key \(project_id\)/);
    assert.match(migration, /references public\.projects \(project_id\)/);
    assert.match(migration, /not valid/);
  });

  it("enables RLS while retaining server-only table privileges", () => {
    for (const table of [
      "customer_profiles",
      "tenants",
      "tenant_memberships",
      "projects",
    ]) {
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`)
      );
      assert.match(
        migration,
        new RegExp(`revoke all on table public\\.${table} from authenticated`)
      );
    }
  });
});
