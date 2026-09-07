const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260903090000_create_campaign_spine_persistence.sql"
), "utf8");

const RELATIONS = [
  "campaigns",
  "campaign_content_items",
  "campaign_platform_variants",
  "campaign_revisions",
  "campaign_brand_snapshots",
  "campaign_preview_evidence",
  "campaign_approval_events",
  "campaign_schedule_entries",
  "campaign_manual_attempts",
  "campaign_attempt_resolutions",
  "campaign_publications",
  "campaign_publication_corrections",
  "campaign_events",
  "campaign_command_receipts",
];

describe("campaign-spine additive migration contract", () => {
  it("creates the fourteen exact I-B relations without legacy backfill", () => {
    for (const relation of RELATIONS) {
      assert.match(migration, new RegExp(`create table if not exists public\\.${relation}\\b`, "i"));
    }
    assert.doesNotMatch(migration, /insert\s+into\s+public\./i);
    assert.doesNotMatch(migration, /alter\s+table\s+public\.(generation_jobs|media_assets|credit_|brand_brains)\s+(add|drop|alter)/i);
  });

  it("enforces same-owner references, immutable evidence, and projection control", () => {
    assert.match(migration, /campaign_revisions_variant_fkey[\s\S]*tenant_id[\s\S]*project_id[\s\S]*brand_id[\s\S]*campaign_id[\s\S]*content_item_id[\s\S]*variant_id/i);
    assert.match(migration, /campaign_events_sequence_unique unique \(campaign_id, sequence\)/i);
    assert.match(migration, /campaign_command_receipts_identity_unique[\s\S]*namespace, tenant_id, project_id, auth_user_id, idempotency_key/i);
    assert.match(migration, /reject_immutable_campaign_record/i);
    assert.match(migration, /reject_campaign_projection_identity_change/i);
    assert.match(migration, /current_setting\('bizgenie\.campaign_command', true\) is distinct from txid_current\(\)::text/i);
    assert.match(migration, /on delete restrict/gi);
    assert.doesNotMatch(migration, /on delete cascade/i);
  });

  it("enables RLS and revokes every direct browser and service role", () => {
    assert.match(migration, /foreach relation_name in array array\[/i);
    assert.match(migration, /alter table public\.%I enable row level security/i);
    assert.match(migration, /revoke all on table public\.%I from public/i);
    assert.match(migration, /array\['anon','authenticated','service_role'\]/i);
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /security definer/i);
  });

  it("adds the contract's concurrency and read-path indexes", () => {
    for (const index of [
      "campaigns_tenant_project_updated_idx",
      "campaign_content_items_parent_idx",
      "campaign_platform_variants_parent_idx",
      "campaign_revisions_variant_number_idx",
      "campaign_events_stream_idx",
      "campaign_platform_variants_pending_attempt_unique",
      "campaign_schedule_entries_time_idx",
      "campaign_publications_time_idx",
    ]) {
      assert.match(migration, new RegExp(`create (?:unique )?index if not exists ${index}`, "i"));
    }
  });
});
