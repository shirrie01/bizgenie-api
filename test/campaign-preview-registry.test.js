const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { PostgresPreviewRegistry, hashIntent } = require("../src/campaigns");

const AUTH_USER = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const VARIANT_ID = "44444444-4444-4444-8444-444444444444";
const REVISION_ID = "55555555-5555-4555-8555-555555555555";
const RECEIPT_ID = "66666666-6666-4666-8666-666666666666";
const NOW = "2026-09-08T12:00:00.000Z";

function campaign() {
  const content = { title: null, body: "Launch update", caption: null, alt_text: null, asset_refs: [] };
  const revision = {
    revision_id: REVISION_ID,
    content,
    content_hash: hashIntent({ content }),
  };
  const variant = {
    variant_id: VARIANT_ID,
    workflow: "review",
    current_revision_id: REVISION_ID,
    platform: "instagram",
    placement: "feed",
    revisions: new Map([[REVISION_ID, revision]]),
  };
  return {
    tenant_id: "tenant_a",
    project_id: "project_a",
    brand_id: "brand_a",
    campaign_id: CAMPAIGN_ID,
    items: new Map([[
      ITEM_ID,
      {
        content_item_id: ITEM_ID,
        format: "text",
        variants: new Map([[VARIANT_ID, variant]]),
      },
    ]]),
  };
}

describe("PostgresPreviewRegistry", () => {
  it("converges concurrent duplicate render receipts through PostgreSQL conflict return", async () => {
    const profile = {
      profile_id: "instagram.feed.text",
      profile_version: 1,
      profile_hash: hashIntent({
        profile_id: "instagram.feed.text",
        profile_version: 1,
        platform: "instagram",
        placement: "feed",
        format: "text",
        renderer_version: "bizgenie-preview-renderer.v1",
      }),
      platform: "instagram",
      placement: "feed",
      format: "text",
      renderer_version: "bizgenie-preview-renderer.v1",
      status: "active",
    };
    const calls = [];
    const client = {
      async query(sql, params = []) {
        calls.push(sql);
        if (/from public\.campaign_preview_profiles/i.test(sql)) return { rows: [profile], rowCount: 1 };
        if (/insert into public\.campaign_preview_render_receipts/i.test(sql)) {
          assert.match(sql, /on conflict on constraint campaign_preview_render_receipts_identity_unique/i);
          assert.match(sql, /returning \*/i);
          const row = Object.fromEntries([
            "render_receipt_id",
            "tenant_id",
            "project_id",
            "brand_id",
            "campaign_id",
            "content_item_id",
            "variant_id",
            "revision_id",
            "revision_content_hash",
            "profile_id",
            "profile_version",
            "profile_hash",
            "platform",
            "placement",
            "format",
            "renderer_version",
            "render_input_hash",
            "preview_digest",
            "rendered_at",
            "rendered_by",
            "idempotency_key",
          ].map((column, index) => [column, params[index]]));
          row.render_receipt_id = RECEIPT_ID;
          return { rows: [row], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const registry = new PostgresPreviewRegistry({
      pool: { connect: async () => client },
      now: () => new Date(NOW),
      idFactory: () => "77777777-7777-4777-8777-777777777777",
    });

    const receipt = await registry.renderPreview(
      {
        tenant_id: "tenant_a",
        project_id: "project_a",
        actor: { kind: "customer", auth_user_id: AUTH_USER },
      },
      campaign(),
      { variant_id: VARIANT_ID, revision_id: REVISION_ID, idempotency_key: "render_once" },
    );

    assert.equal(receipt.render_receipt_id, RECEIPT_ID);
    assert.equal(receipt.platform, "instagram");
    assert.equal(receipt.render_input_hash, undefined);
    assert.equal(receipt.profile_hash, undefined);
    assert.equal(calls.filter((sql) => /insert into public\.campaign_preview_render_receipts/i.test(sql)).length, 1);
  });
});
