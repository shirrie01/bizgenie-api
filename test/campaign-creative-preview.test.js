const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryCampaignRepository, InMemoryPreviewRegistry } = require("../src/campaigns");
const { InMemoryAuthorizationRepository, AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const { scenario, context, content, NOW } = require("./helpers/campaign-regressions");
const USER = context.actor.auth_user_id, OTHER = "22222222-2222-4222-8222-222222222222";

async function fixture({ format = "text", media = false } = {}) {
  const assetId = randomUUID();
  const evidence = { asset_id: assetId, tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a",
    status: "active", source_kind: "generated", media_kind: format, job_id: "job_1", allowed_uses: ["campaign.preview"],
    manifest: { asset_id: assetId, mime_type: format === "video" ? "video/mp4" : "image/png", width: 1200, height: 1200, duration_ms: null, byte_size: 1000 },
    storage_bucket: "private-never-expose", storage_key: "private-key-never-expose" };
  let available = true, failure = false;
  const registry = new InMemoryPreviewRegistry({ now: () => new Date(NOW) });
  const repository = new InMemoryCampaignRepository({ now: () => new Date(NOW), authorize: async () => true,
    captureBrandSnapshot: async () => ({ brand_snapshot_id: randomUUID(), tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_version: 1,
      source_updated_at: NOW, source_schema_version: "brand-brain.v1", snapshot: { name: "Private Brand", private_positioning: "never-expose" }, snapshot_hash: "a".repeat(64), captured_at: NOW }),
    resolvePreviewReceipt: (...args) => registry.resolvePreviewReceipt(...args), validatePreview: (...args) => registry.validatePreview(...args),
    resolveMedia: async () => { if (failure) throw new Error("private storage failure"); return available ? structuredClone(evidence) : null; },
  });
  const s = await scenario(repository);
  const copy = { ...content, title: "Actual saved title", body: "Actual persisted customer-visible copy <not HTML>", caption: "Saved caption", alt_text: "Saved alternative text",
    asset_refs: media ? [{ asset_id: assetId, role: "primary" }] : [] };
  const target = await s.add(format, copy);
  const authorizationRepository = new InMemoryAuthorizationRepository({
    customerProfiles: [{ auth_user_id: USER }, { auth_user_id: OTHER }],
    tenants: [{ tenant_id: "tenant_a", name: "A", created_by: USER }, { tenant_id: "tenant_b", name: "B", created_by: OTHER }],
    memberships: [{ tenant_id: "tenant_a", auth_user_id: USER, role: "owner" }, { tenant_id: "tenant_b", auth_user_id: OTHER, role: "owner" }],
    projects: [{ project_id: "project_a", tenant_id: "tenant_a", name: "A" }, { project_id: "project_b", tenant_id: "tenant_b", name: "B" }],
    brands: [{ brand_id: "brand_a", project_id: "project_a", name: "A", status: "approved" }],
  });
  const app = createApp({ campaignRepository: repository, previewRegistry: registry, authorizationRepository,
    customerTokenVerifier: { async verifyAccessToken(token) {
      if (!["a", "b"].includes(token)) throw new AuthenticationRequiredError();
      return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: token === "a" ? USER : OTHER });
    } }, logger: { info() {}, warn() {}, error() {} } });
  const path = `/customer/campaigns/${s.id}/variants/${target.variant_id}/creative-preview`;
  const get = async ({ token = "a", ...patch } = {}) => {
    const campaign = await s.get();
    const req = request(app).get(path).query({ tenant_id: "tenant_a", project_id: "project_a", revision_id: target.revision_id, expected_campaign_version: campaign.version, ...patch });
    if (token) req.set("authorization", `Bearer ${token}`);
    return req;
  };
  return { s, target, repository, registry, copy, get, path, app, evidence, assetId, revoke: () => { available = false; }, fail: () => { failure = true; }, recover: () => { failure = false; } };
}

test("returns actual persisted copy and identity without rendering, mutation or hidden provenance", async () => {
  const f = await fixture(), before = await f.s.get();
  const response = await f.get();
  assert.equal(response.status, 200);
  const p = response.body.preview;
  assert.deepEqual(p.copy, Object.fromEntries(Object.entries(f.copy).filter(([key]) => key !== "asset_refs")));
  assert.equal(p.content_status, "available"); assert.equal(p.copy_status, "available");
  assert.equal(p.platform, "instagram"); assert.equal(p.content_type, "text");
  assert.equal(p.campaign_id, f.s.id); assert.equal(p.variant_id, f.target.variant_id); assert.equal(p.revision_id, f.target.revision_id);
  assert.equal(p.provenance.revision_source, "manual"); // Generated text currently shares manual save_revision provenance; don't guess.
  assert.equal(p.approval_status, "not_approved"); assert.equal(p.acknowledgement_status, "not_acknowledged");
  assert.equal(p.platform_preview.status, "unrendered"); assert.equal(p.platform_preview.artifact_url, null);
  assert.deepEqual(p.media, []); assert.equal(p.read_only, true);
  assert.match(response.headers["cache-control"], /no-store/); assert.match(response.headers.vary, /Authorization/);
  assert.deepEqual((await f.get()).body, response.body);
  assert.deepEqual(await f.s.get(), before); assert.equal(f.registry.receipts.size, 0);
  assert.doesNotMatch(JSON.stringify(p), /private_positioning|never-expose|auth_user_id|brand_snapshots|render_input_hash|content_hash/);
});
test("requires customer bearer authentication and never accepts the admin key", async () => {
  const f = await fixture();
  for (const token of [null, "invalid"]) assert.equal((await f.get({ token })).status, 401);
  assert.equal((await request(f.app).get(f.path).set("x-admin-key", "admin").query({ tenant_id: "tenant_a", project_id: "project_a", revision_id: f.target.revision_id, expected_campaign_version: 2 })).status, 401);
});
test("rejects cross-tenant campaigns, spoofed scope and nonexistent variants without content leakage", async () => {
  const f = await fixture();
  for (const patch of [{ token: "b" }, { token: "b", tenant_id: "tenant_b", project_id: "project_b" }, { project_id: "project_b" }]) {
    const r = await f.get(patch); assert.equal(r.status, 404); assert.doesNotMatch(JSON.stringify(r.body), /Actual persisted/);
  }
  const missing = await request(f.app).get(f.path.replace(f.target.variant_id, randomUUID())).set("authorization", "Bearer a").query({ tenant_id: "tenant_a", project_id: "project_a", revision_id: f.target.revision_id, expected_campaign_version: 2 });
  assert.equal(missing.status, 404);
});
test("requires explicit version/revision and rejects stale campaign or revision", async () => {
  const f = await fixture();
  for (const patch of [{ expected_campaign_version: 1 }, { revision_id: randomUUID() }]) {
    const r = await f.get(patch); assert.equal(r.status, 409); assert.equal(r.body.error.code, "VERSION_CONFLICT");
  }
  assert.equal((await f.get({ expected_campaign_version: "1.5" })).status, 400);
  assert.equal((await f.get({ revision_id: "invalid" })).status, 400);
  assert.equal((await f.get({ revision_id: undefined })).status, 400);
  assert.equal((await f.get({ expected_campaign_version: undefined })).status, 400);
  await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { ...f.copy, body: "Updated copy" }, change_reason: "Edit" });
  assert.equal((await f.get()).status, 409);
});
for (const format of ["image", "video"]) {
  test(`authorised generated ${format} references disclose no private storage or invented URL`, async () => {
    const f = await fixture({ format, media: true });
    const r = await f.get(); assert.equal(r.status, 200);
    assert.deepEqual(r.body.preview.media, [{ asset_id: f.assetId, role: "primary", media_kind: format, mime_type: format === "video" ? "video/mp4" : "image/png",
      source_kind: "generated", status: "unavailable", reason: "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE", url: null }]);
    assert.equal(r.body.preview.content_status, "unavailable"); assert.equal(r.body.preview.copy_status, "available");
    assert.doesNotMatch(JSON.stringify(r.body), /private-key|storage_bucket|storage_key|job_1/);
    f.revoke(); const revoked = await f.get(); assert.equal(revoked.status, 200);
    assert.equal(revoked.body.preview.media[0].reason, "ASSET_NOT_AVAILABLE"); assert.equal(revoked.body.preview.media[0].source_kind, null);
  });
}
test("missing media never becomes a placeholder image or video", async () => {
  const f = await fixture({ format: "image" });
  const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.body.preview.content_status, "unavailable"); assert.deepEqual(r.body.preview.media, []);
});
test("media ownership, rights, kind, manifest and generation binding are rechecked on read", async () => {
  for (const patch of [{ tenant_id: "tenant_b" }, { project_id: "project_b" }, { brand_id: "brand_b" }, { allowed_uses: [] }, { source_kind: "reference" }, { media_kind: "video" }, { job_id: "wrong" }, { manifest: { mime_type: "wrong" } }]) {
    const f = await fixture({ format: "image", media: true }); Object.assign(f.evidence, patch);
    const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.body.preview.media[0].reason, "ASSET_NOT_AVAILABLE");
  }
});
test("media resolver failure is a sanitised retryable error, not usable content", async () => {
  const f = await fixture({ format: "image", media: true }); f.fail();
  const r = await f.get(); assert.equal(r.status, 503); assert.equal(r.body.error.code, "CAMPAIGN_TEMPORARILY_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(r.body), /private storage failure/);
  f.recover(); assert.equal((await f.get()).status, 200);
});
test("receipt/acknowledgement/approval guards are unchanged and a GET confers no approval", async () => {
  const f = await fixture();
  await f.s.cmd("submit_review", f.target);
  await f.get();
  await assert.rejects(() => f.s.cmd("approve", { ...f.target, preview_id: randomUUID(), approved: true }), e => e.code === "PREVIEW_REQUIRED");
  const receipt = await f.registry.renderPreview(context, await f.s.get(), { ...f.target, idempotency_key: "render" });
  const replay = await f.registry.renderPreview(context, await f.s.get(), { ...f.target, idempotency_key: "render" }); assert.deepEqual(receipt, replay);
  const ack = await f.s.cmd("acknowledge_preview", { ...f.target, render_receipt_id: receipt.render_receipt_id, acknowledged: true });
  assert.equal((await f.get()).body.preview.acknowledgement_status, "acknowledged");
  await f.s.cmd("approve", { ...f.target, preview_id: ack.created_ids.preview_ids[0], approved: true });
  assert.equal((await f.get()).body.preview.approval_status, "approved");
  assert.equal((await f.get()).body.preview.platform_preview.status, "unrendered");
  await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { ...f.copy, body: "Revised" }, change_reason: "Edit after approval" });
  await assert.rejects(() => f.s.cmd("approve", { ...f.target, preview_id: ack.created_ids.preview_ids[0], approved: true }), e => e.code === "PREVIEW_REQUIRED");
  assert.equal((await f.get()).status, 409);
});
test("retired preview profiles cannot report a current acknowledgement", async () => {
  const f = await fixture(); await f.s.cmd("submit_review", f.target);
  const receipt = await f.registry.renderPreview(context, await f.s.get(), { ...f.target, idempotency_key: "render" });
  await f.s.cmd("acknowledge_preview", { ...f.target, render_receipt_id: receipt.render_receipt_id, acknowledged: true });
  for (const profile of f.registry.profiles.values()) profile.status = "retired";
  const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.body.preview.acknowledgement_status, "not_acknowledged");
  assert.equal(r.body.preview.platform_preview.status, "unrendered");
});
test("empty persisted text is unavailable without invented fallback copy", async () => {
  const f = await fixture();
  await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { title: null, body: null, caption: null, alt_text: null, asset_refs: [] }, change_reason: "Empty draft" });
  const revision = (await f.s.variant(f.target)).current_revision_id;
  const r = await f.get({ revision_id: revision });
  assert.equal(r.status, 200); assert.equal(r.body.preview.content_status, "unavailable"); assert.equal(r.body.preview.copy_status, "unavailable");
  assert.deepEqual(r.body.preview.copy, { title: null, body: null, caption: null, alt_text: null });
});
