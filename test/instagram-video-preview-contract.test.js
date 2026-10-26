const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { InMemoryPreviewRegistry, hashIntent } = require("../src/campaigns");
const { rangeFor, MAX_VIDEO_TRANSFER_BYTES } = require("../src/media/previewDelivery");
const { integrationFixture } = require("./helpers/media-integration");
const { content } = require("./helpers/campaign-regressions");
const proposal = require("../docs/media/contracts/instagram-feed-video-preview.v1.proposed.json");

// Explicit synthetic test registration, not approval/provisioning or media conformance.
const profile = () => ({ ...proposal.registry_identity, status: "active" });
const fixture = () => integrationFixture({ kind: "video", platform: "instagram", previewProfiles: [profile()] });
async function render(f) {
  await f.s.cmd("submit_review", f.target);
  return f.registry.renderPreview(f.context, await f.s.get(), { ...f.target, idempotency_key: randomUUID() });
}
async function acknowledge(f, receipt) {
  return f.s.cmd("acknowledge_preview", { ...f.target, render_receipt_id: receipt.render_receipt_id, acknowledged: true });
}
async function approve(f, ack) {
  return f.s.cmd("approve", { ...f.target, preview_id: ack.created_ids.preview_ids[0], approved: true });
}

test("proposed contract and registry identity have independently pinned digests", () => {
  assert.equal(hashIntent(proposal), "3438970ac117a87dfd2393f7a808ec332e41831bb3948cf824cc4c179b8444ef");
  const identity = proposal.registry_identity;
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(identity).sort(([a], [b]) => a.localeCompare(b))));
  const digest = createHash("sha256").update(canonical).digest("hex");
  assert.equal(digest, "858e82f419c2efba01d40052076895e6e86c1fa1e82c05a18c5046769492babb");
  const registry = new InMemoryPreviewRegistry({ profiles: [profile()] });
  assert.equal(registry.activeProfile(identity).profile_hash, digest);
  assert.equal(proposal.status, "proposal_not_provisionable");
});

test("all historical SQL seed hashes match memory; candidate is absent from both default registries", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260908100000_create_campaign_preview_registry.sql"), "utf8");
  const rows = [...sql.matchAll(/\('([^']+)', 1, '[^']+', '[^']+', '[^']+', '[^']+', '([a-f0-9]{64})', 'active'\)/g)];
  const registry = new InMemoryPreviewRegistry();
  assert.equal(rows.length, registry.profiles.size);
  for (const [, id, digest] of rows) assert.equal(registry.profiles.get(`${id}:1`).profile_hash, digest);
  assert.equal(registry.activeProfile(proposal.registry_identity), undefined);
  assert.ok(!rows.some(([, id]) => id === profile().profile_id));
});

test("Instagram video remains fail-closed without explicit synthetic registration", async () => {
  const f = await integrationFixture({ kind: "video", platform: "instagram" });
  await assert.rejects(() => render(f), { code: "PREVIEW_VERSION_UNAVAILABLE" });
  assert.equal(f.registry.receipts.size, 0);
});

test("candidate receipt binds exact revision and identity; explicit same-actor approval leaves publishing untouched", async () => {
  const f = await fixture(); const receipt = await render(f);
  assert.equal(receipt.profile_id, "instagram.feed.video");
  assert.equal(receipt.renderer_version, proposal.registry_identity.renderer_version);
  assert.equal(receipt.revision_id, f.target.revision_id);
  const ack = await acknowledge(f, receipt); await approve(f, ack);
  const c = await f.s.get();
  assert.equal((await f.s.variant(f.target)).workflow, "approved");
  assert.equal(c.attempts.size, 0); assert.equal(c.publications.size, 0);
  assert.equal(f.state.providerCalls, 1); // Mock transport only; no new generation on review.
});

test("another actor cannot approve someone else's acknowledgement", async () => {
  const f = await fixture(); const ack = await acknowledge(f, await render(f));
  f.s.setActor({ ...f.context, actor: { kind: "customer", auth_user_id: "22222222-2222-4222-8222-222222222222" } });
  await f.s.unchanged(() => approve(f, ack));
});

test("stale campaign versions cannot approve an otherwise valid current receipt", async () => {
  const f = await fixture(); const ack = await acknowledge(f, await render(f));
  await assert.rejects(() => f.repository.executeCommand(f.context, {
    contract_version: "campaign-spine.v1", idempotency_key: randomUUID(), expected_campaign_version: 0,
    command_type: "approve", tenant_id: f.scope.tenant_id, project_id: f.scope.project_id, campaign_id: f.s.id,
    payload: { ...f.target, preview_id: ack.created_ids.preview_ids[0], approved: true },
  }), { code: "VERSION_CONFLICT" });
});

test("old revision receipt cannot be acknowledged after an edit and resubmission", async () => {
  const f = await fixture(); const receipt = await render(f);
  await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { ...content, body: "Changed copy", asset_refs: [{ asset_id: f.assetId, role: "primary" }] }, change_reason: "Explicit revision" });
  const revised = { ...f.target, revision_id: (await f.s.variant(f.target)).current_revision_id };
  await f.s.cmd("submit_review", revised);
  await f.s.unchanged(() => f.s.cmd("acknowledge_preview", { ...revised, render_receipt_id: receipt.render_receipt_id, acknowledged: true }));
});

for (const phase of ["acknowledgement", "approval"]) test(`profile revocation denies ${phase} and receipt replay`, async () => {
  const f = await fixture(); const receipt = await render(f);
  const ack = phase === "approval" ? await acknowledge(f, receipt) : null;
  f.registry.profiles.get("instagram.feed.video:1").status = "revoked";
  await f.s.unchanged(() => ack ? approve(f, ack) : acknowledge(f, receipt));
  await assert.rejects(async () => f.registry.renderPreview(f.context, await f.s.get(), { ...f.target, idempotency_key: "replay" }), { code: "PREVIEW_VERSION_UNAVAILABLE" });
});

for (const revoke of ["status", "rights"]) test(`${revoke} revoked after acknowledgement blocks approval and bytes before storage`, async () => {
  const f = await fixture(); const ack = await acknowledge(f, await render(f));
  const asset = f.mediaRepository.assets.get(f.assetId);
  if (revoke === "status") asset.status = "revoked"; else asset.allowed_uses = [];
  await f.s.unchanged(() => approve(f, ack));
  const res = await request(f.app).get(f.deliveryPath).set("authorization", "Bearer a").query({ ...f.scope, expected_campaign_version: (await f.s.get()).version });
  assert.equal(res.status, 404); assert.equal(f.state.storage.length, 0);
});

test("foreign tenant cannot resolve candidate receipts or access media", async () => {
  const f = await fixture(); const receipt = await render(f);
  const foreign = { ...f.context, tenant_id: "tenant_b", project_id: "project_b" };
  assert.equal(await f.registry.resolvePreviewReceipt(foreign, receipt), null);
  await assert.rejects(async () => f.registry.renderPreview(foreign, await f.s.get(), { ...f.target, idempotency_key: "foreign" }), { code: "RESOURCE_NOT_AVAILABLE" });
  const res = await request(f.app).get(f.deliveryPath).set("authorization", "Bearer b").query({ ...f.scope, expected_campaign_version: (await f.s.get()).version });
  assert.equal(res.status, 404); assert.equal(f.state.storage.length, 0);
});

test("candidate never substitutes for a different placement/platform/format", () => {
  const registry = new InMemoryPreviewRegistry({ profiles: [profile()] });
  for (const mismatch of [{ placement: "reels" }, { platform: "tiktok" }, { format: "image" }]) {
    assert.equal(registry.activeProfile({ ...proposal.registry_identity, ...mismatch }), undefined);
  }
});

test("exact 32 MiB client object needs four explicit <=8 MiB ranges; open full range is denied", () => {
  const size = proposal.bizgenie_preview_constraints.max_object_bytes;
  assert.equal(MAX_VIDEO_TRANSFER_BYTES, proposal.bizgenie_preview_constraints.max_transfer_bytes);
  const parts = [];
  for (let start = 0; start < size; start += MAX_VIDEO_TRANSFER_BYTES) parts.push(rangeFor(`bytes=${start}-${start + MAX_VIDEO_TRANSFER_BYTES - 1}`, size, true));
  assert.equal(parts.length, 4);
  assert.equal(parts.reduce((bytes, r) => bytes + r.end - r.start + 1, 0), size);
  assert.throws(() => rangeFor("bytes=0-", size, true), { status: 416 });
  assert.throws(() => rangeFor(`bytes=0-${MAX_VIDEO_TRANSFER_BYTES}`, size, true), { status: 416 });
  // Backend does NOT enforce the proposed total client ceiling. HEAD/client policy is still required.
  assert.equal(rangeFor("bytes=0-7", size + 1, true).end, 7);
});

test("revoked-media approval can be explicitly revoked without restoring rights; replacement remains Draft", async () => {
  const f = await fixture(); const ack = await acknowledge(f, await render(f));
  const approved = await approve(f, ack); const approvalId = approved.created_ids.approval_ids[0];
  f.mediaRepository.assets.get(f.assetId).status = "revoked";
  await f.s.cmd("revoke_approval", { variant_id: f.target.variant_id, approval_id: approvalId, reason: "Asset rights revoked" });
  assert.equal((await f.s.variant(f.target)).workflow, "review");
  assert.equal((await f.s.variant(f.target)).active_approval_id, null);
  await f.s.unchanged(() => approve(f, ack));
  await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { ...content, asset_refs: [] }, change_reason: "Remove revoked media; replacement required" });
  const variant = await f.s.variant(f.target);
  assert.equal(variant.workflow, "draft");
  assert.equal(variant.revisions.get(f.target.revision_id).content.asset_refs[0].asset_id, f.assetId);
  await f.s.unchanged(() => f.s.cmd("submit_review", { ...f.target, revision_id: variant.current_revision_id }));
  assert.equal(f.mediaRepository.assets.get(f.assetId).status, "revoked");
});
