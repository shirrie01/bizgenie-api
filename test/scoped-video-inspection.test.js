const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { AuthorizationService } = require("../src/authorization");
const { createVideoInspector, createHardenedVideoInspector, MAX_BYTES } = require("../src/media/videoInspection");
const { createScopedVideoInspectionService } = require("../src/media/scopedVideoInspection");
const { integrationFixture } = require("./helpers/media-integration");
const { content } = require("./helpers/campaign-regressions");
const videoBytes = readFileSync(path.join(__dirname, "fixtures/video-inspection/silent-h264.mp4"));
async function fixture(options = {}, data = videoBytes) {
  const f = await integrationFixture({ kind: "video", videoBytes: data });
  f.authorizationRepository.brands.set("project_a\0brand_a", { brand_id: "brand_a", project_id: "project_a", status: "approved" });
  const tokenVerifier = { async verifyAccessToken(token) {
    if (token === "a") return f.context.actor;
    if (token === "b") return { kind: "customer", auth_user_id: "22222222-2222-4222-8222-222222222222" };
    throw new Error("secret-private-token");
  } };
  const configuration = { repository: f.repository, storage: f.storage, tokenVerifier,
    authorizationService: new AuthorizationService({ repository: f.authorizationRepository }),
    inspect: createVideoInspector(), ...options };
  const q = { accessToken: "a", tenantId: "tenant_a", projectId: "project_a", brandId: "brand_a", campaignId: f.s.id,
    variantId: f.target.variant_id, revisionId: f.target.revision_id, assetId: f.assetId, expectedVersion: 2 };
  return { ...f, q, configuration, service: createScopedVideoInspectionService(configuration) };
}

test("scoped real byte inspection pins generation and digest, returns no storage authority and mutates nothing", async () => {
  const f = await fixture(), before = await f.s.get(); const r = await f.service.inspect(f.q);
  assert.equal(r.status, "measured"); assert.equal(r.measurement.video.codec, "h264");
  assert.equal(r.identity.asset_id, f.assetId); assert.equal(r.identity.content_sha256, r.measurement.sha256);
  assert.match(r.identity.source_binding, /^[a-f0-9]{64}$/); assert.equal(r.provisionable, false);
  const gets = f.state.storage.filter(s => new URL(s.url).searchParams.has("generation"));
  assert.equal(gets.length, 1); const u = new URL(gets[0].url);
  assert.equal(u.searchParams.get("generation"), u.searchParams.get("ifGenerationMatch"));
  assert.deepEqual(await f.s.get(), before); assert.equal(f.registry.receipts.size, 0); assert.equal(f.state.providerCalls, 1);
  const json = JSON.stringify(r);
  for (const forbidden of ["private-media-integration", "assets/", "gs://", "fixture-gcs-token", "accessToken", "storage_bucket", "storage_key"]) assert.ok(!json.includes(forbidden));
});

for (const patch of [{ accessToken: "expired" }, { accessToken: "b" }, { tenantId: "tenant_b" }, { brandId: "foreign" },
  { campaignId: randomUUID() }, { variantId: randomUUID() }, { revisionId: randomUUID() }, { expectedVersion: 1 }, { assetId: randomUUID() }]) {
  test(`denies forged or stale scope ${Object.keys(patch)[0]} before storage`, async () => {
    const f = await fixture(); const r = await f.service.inspect({ ...f.q, ...patch });
    assert.equal(r.status, "unavailable"); assert.equal(f.state.storage.length, 0);
  });
}

test("client attestations and extra request fields are rejected", async () => {
  const f = await fixture(); const r = await f.service.inspect({ ...f.q, inspection: { status: "measured" } });
  assert.equal(r.reason, "INVALID_INSPECTION_REQUEST"); assert.equal(f.state.storage.length, 0);
});

for (const field of ["status", "allowed_uses"]) test(`revoked ${field} is denied before storage`, async () => {
  const f = await fixture(); const row = f.mediaRepository.assets.get(f.assetId);
  if (field === "status") row.status = "revoked"; else row.allowed_uses = [];
  assert.equal((await f.service.inspect(f.q)).reason, "MEDIA_NOT_AVAILABLE"); assert.equal(f.state.storage.length, 0);
});

test("generation/job brand lineage mismatch denies inspection", async () => {
  const f = await fixture(); f.state.jobBrand = "brand_b";
  assert.equal((await f.service.inspect(f.q)).status, "unavailable"); assert.equal(f.state.storage.length, 0);
});

test("GCS object replacement after stat has no unpinned fallback", async () => {
  const f = await fixture(); f.state.onStat = o => { o.generation = String(Number(o.generation) + 1); };
  assert.equal((await f.service.inspect(f.q)).status, "unavailable");
  assert.equal(f.state.storage.filter(s => new URL(s.url).searchParams.has("generation")).length, 1);
});

for (const change of ["rights", "generation", "revision", "membership"]) test(`post-inspection ${change} change discards result`, async () => {
  const f = await fixture(), local = createVideoInspector();
  const service = createScopedVideoInspectionService({ ...f.configuration, inspect: async b => {
    const r = await local(b);
    if (change === "rights") f.mediaRepository.assets.get(f.assetId).status = "revoked";
    if (change === "generation") { for (const o of f.state.objects.values()) o.generation = String(Number(o.generation) + 1); }
    if (change === "revision") await f.s.cmd("save_revision", { variant_id: f.target.variant_id, content: { ...content, body: "Changed", asset_refs: [{ asset_id: f.assetId, role: "primary" }] }, change_reason: "Race proof" });
    if (change === "membership") f.authorizationRepository.memberships.clear();
    return r;
  } });
  assert.equal((await service.inspect(f.q)).status, "unavailable");
});

test("oversize is rejected at metadata before reading bytes", async () => {
  const f = await fixture(); const repo = Object.create(f.repository);
  repo.getMediaPreviewAsset = async (...args) => ({ ...await f.repository.getMediaPreviewAsset(...args), byteSize: null });
  f.storage.statPreview = async () => ({ size: MAX_BYTES + 1, generation: "123", mimeType: "video/mp4" });
  const service = createScopedVideoInspectionService({ ...f.configuration, repository: repo });
  assert.equal((await service.inspect(f.q)).reason, "OBJECT_TOO_LARGE"); assert.equal(f.state.storage.length, 0);
});

for (const kind of ["short", "long", "encoding", "length"]) test(`rejects ${kind} upstream transfer`, async () => {
  const f = await fixture(); f.storage.openPreview = async () => new Response(
    kind === "short" ? videoBytes.subarray(1) : kind === "long" ? Buffer.concat([videoBytes, Buffer.from([0])]) : videoBytes,
    { status: 206, headers: { "content-type": "video/mp4", "content-length": String(videoBytes.length + (kind === "length" ? 1 : 0)),
      "content-range": `bytes 0-${videoBytes.length - 1}/${videoBytes.length}`, ...(kind === "encoding" ? { "content-encoding": "gzip" } : {}) } });
  assert.equal((await f.service.inspect(f.q)).status, "unavailable");
});

test("actual malformed MP4 bytes return invalid, never an approval", async () => {
  const f = await fixture({}, videoBytes.subarray(0, 32));
  assert.equal((await f.service.inspect(f.q)).status, "invalid"); assert.equal((await f.s.get()).approvals.size, 0);
});

test("timeout/cancellation propagate without unbounded orphan work", async () => {
  const f = await fixture({ timeoutMs: 40 }); const resolvers = [];
  const service = createScopedVideoInspectionService({ ...f.configuration, inspect: () => new Promise(resolve => resolvers.push(resolve)) });
  const results = await Promise.all([service.inspect(f.q), service.inspect(f.q)]);
  assert.ok(results.every(r => r.reason === "INSPECTION_TIMEOUT"));
  assert.equal((await service.inspect(f.q)).reason, "INSPECTION_BUSY");
  for (const resolve of resolvers) resolve({ status: "unavailable", reason: "CANCELLED" });
  await new Promise(resolve => setTimeout(resolve, 0));
});

test("cancelled late storage response body is cleaned up", async () => {
  const f = await fixture({ timeoutMs: 30 }); let release, cancelled = 0;
  f.storage.openPreview = () => new Promise(resolve => { release = resolve; });
  const pending = f.service.inspect(f.q);
  for (let i = 0; i < 50 && !release; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await pending).reason, "INSPECTION_TIMEOUT");
  release(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(cancelled, 1);
});

test("pre-cancelled request does no auth or storage work", async () => {
  const f = await fixture(); const c = new AbortController(); c.abort();
  assert.equal((await f.service.inspect(f.q, { signal: c.signal })).reason, "CANCELLED"); assert.equal(f.state.storage.length, 0);
});

test("per-instance request and reserved-byte budgets do not silently refund failed reads", async () => {
  const f = await fixture({ maxRequestsPerWindow: 1 });
  assert.equal((await f.service.inspect(f.q)).status, "measured");
  assert.equal((await f.service.inspect(f.q)).reason, "INSPECTION_REQUEST_BUDGET");
  const bytes = createScopedVideoInspectionService({ ...f.configuration, maxRequestsPerWindow: 8, maxBytesPerWindow: videoBytes.length });
  assert.equal((await bytes.inspect(f.q)).status, "measured");
  assert.equal((await bytes.inspect(f.q)).reason, "INSPECTION_BYTE_BUDGET");
});

test("forged measured output from a constructor callback is not trusted", async () => {
  const f = await fixture({ inspect: async () => ({ status: "measured", sha256: "0".repeat(64), byte_size: videoBytes.length }) });
  assert.equal((await f.service.inspect(f.q)).reason, "INSPECTION_RESULT_UNTRUSTED");
});

test("hardened sandbox has no local-probe fallback; restricted hosts fail closed", async () => {
  const r = await createHardenedVideoInspector()(videoBytes);
  if (r.status === "measured") assert.equal(r.source, "local_ffprobe_bytes_v1");
  else { assert.equal(r.status, "unavailable"); assert.match(r.reason, /^INSPECTION_(SANDBOX_UNAVAILABLE|TOOL_UNAVAILABLE|TOOL_VERSION_UNAPPROVED)$/); }
});

test("default service never silently selects unsandboxed inspection", async () => {
  const f = await fixture(); const { inspect, ...configuration } = f.configuration;
  const r = await createScopedVideoInspectionService(configuration).inspect(f.q);
  assert.ok(r.status === "measured" || (r.status === "unavailable" && /^INSPECTION_/.test(r.reason)));
});

test("authorization to another brand in the same project is not campaign authority", async () => {
  const f = await fixture();
  f.authorizationRepository.brands.set("project_a\0brand_b", { brand_id: "brand_b", project_id: "project_a", status: "approved" });
  assert.equal((await f.service.inspect({ ...f.q, brandId: "brand_b" })).reason, "MEDIA_NOT_AVAILABLE");
  assert.equal(f.state.storage.length, 0);
});

test("unknown tool diagnostics cannot leak private identifiers through reason strings", async () => {
  const f = await fixture({ inspect: async () => ({ status: "unavailable", reason: "PRIVATE_BUCKET_TOKEN" }) });
  const r = await f.service.inspect(f.q);
  assert.equal(r.reason, "INSPECTION_RESULT_UNTRUSTED"); assert.ok(!JSON.stringify(r).includes("PRIVATE_BUCKET_TOKEN"));
});
