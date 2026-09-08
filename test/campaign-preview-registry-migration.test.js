const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260908100000_create_campaign_preview_registry.sql",
), "utf8");

describe("campaign preview registry migration contract", () => {
  it("creates the durable profile and render-receipt registry only", () => {
    assert.match(migration, /create table if not exists public\.campaign_preview_profiles\b/i);
    assert.match(migration, /create table if not exists public\.campaign_preview_render_receipts\b/i);
    assert.match(migration, /campaign_preview_render_receipts_identity_unique[\s\S]*tenant_id, project_id, rendered_by, campaign_id, variant_id, revision_id, idempotency_key/i);
    assert.match(migration, /campaign_preview_render_receipts_revision_fkey[\s\S]*tenant_id[\s\S]*project_id[\s\S]*brand_id[\s\S]*campaign_id[\s\S]*content_item_id[\s\S]*variant_id[\s\S]*revision_id/i);
    assert.doesNotMatch(migration, /alter\s+table\s+public\.(campaigns|campaign_content_items|campaign_platform_variants|campaign_revisions)\s+(add|drop|alter)/i);
  });

  it("seeds active profile versions with immutable profile hashes", () => {
    for (const profile of [
      "instagram.feed.text",
      "instagram.feed.image",
      "facebook.feed.text",
      "linkedin.feed.text",
      "tiktok.feed.video",
      "youtube.shorts.video",
      "email.message.text",
    ]) {
      assert.match(migration, new RegExp(`'${profile}'[\\s\\S]*'bizgenie-preview-renderer\\.v1'[\\s\\S]*'[a-f0-9]{64}'[\\s\\S]*'active'`, "i"));
    }
    assert.match(migration, /on conflict \(profile_id, profile_version\) do nothing/i);
  });

  it("keeps direct browser and service roles locked out", () => {
    assert.match(migration, /alter table public\.%I enable row level security/i);
    assert.match(migration, /revoke all on table public\.%I from public/i);
    assert.match(migration, /array\['anon','authenticated','service_role'\]/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on/i);
  });
});
