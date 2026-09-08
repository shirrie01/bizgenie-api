const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260908120000_create_campaign_goal_recommendations.sql",
), "utf8");
const ddl = migration.replace(/^--.*$/gm, "").replace(/comment on table[\s\S]*?;/gi, "");

describe("campaign goal recommendation migration contract", () => {
  it("creates the durable recommendation receipt registry only", () => {
    assert.match(migration, /create table if not exists public\.campaign_goal_recommendations\b/i);
    assert.match(migration, /campaign_goal_recommendations_identity_unique[\s\S]*tenant_id, project_id, requested_by, brand_id, idempotency_key/i);
    assert.match(migration, /campaign_goal_recommendations_brand_fkey[\s\S]*references public\.brand_brains \(project_id, brand_id\)/i);
    assert.doesNotMatch(migration, /alter\s+table\s+public\.(campaigns|campaign_content_items|campaign_platform_variants|campaign_revisions)\s+(add|drop|alter)/i);
  });

  it("keeps direct browser and service roles locked out", () => {
    assert.match(migration, /alter table public\.campaign_goal_recommendations enable row level security/i);
    assert.match(migration, /revoke all on table public\.campaign_goal_recommendations from public/i);
    assert.match(migration, /array\['anon','authenticated','service_role'\]/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on/i);
  });

  it("does not introduce publishing, billing or provider execution columns", () => {
    assert.doesNotMatch(ddl, /stripe|price|billing|publish|publication|provider|openai|video|image/i);
  });
});
