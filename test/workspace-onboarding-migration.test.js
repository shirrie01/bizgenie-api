const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(path.join(
  __dirname, "..", "supabase", "migrations", "20261023100000_create_workspace_onboarding_profiles.sql",
), "utf8");
const ddl = migration.replace(/^--.*$/gm, "").replace(/comment on table[\s\S]*?;/gi, "");

describe("workspace onboarding migration contract", () => {
  it("adds one new server-owned table anchored to brand_brains and changes nothing existing", () => {
    assert.match(migration, /create table if not exists public\.workspace_onboarding_profiles\b/i);
    assert.match(migration, /primary key \(tenant_id, project_id, brand_id\)/i);
    assert.match(migration, /workspace_onboarding_profiles_brand_fkey[\s\S]*references public\.brand_brains \(project_id, brand_id\)/i);
    assert.doesNotMatch(ddl, /alter\s+table\s+public\.(?!workspace_onboarding_profiles)/i);
    assert.doesNotMatch(ddl, /drop\s+(table|column)|truncate|delete\s+from|update\s+public\./i);
  });

  it("keeps direct browser and service roles locked out", () => {
    assert.match(migration, /alter table public\.workspace_onboarding_profiles enable row level security/i);
    assert.match(migration, /revoke all on table public\.workspace_onboarding_profiles from public/i);
    assert.match(migration, /array\['anon','authenticated','service_role'\]/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on/i);
  });

  it("bounds every stored value and carries no billing, publishing or provider columns", () => {
    for (const rule of [/length\(draft::text\) <= 12000/, /jsonb_array_length\(channels\) <= 6/, /between 1 and 200/, /between 0 and 20/]) {
      assert.match(migration, rule);
    }
    assert.doesNotMatch(ddl, /stripe|price|billing|publish|publication|provider|openai|video|image/i);
  });
});
