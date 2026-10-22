const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const request = require("supertest");
const { createApp } = require("../index");
const { InMemoryCampaignRepository } = require("../src/campaigns");
const { InMemoryAuthorizationRepository, AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require("../src/authorization");
const { GoogleCloudMediaStorage, objectKey, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } = require("../src/media");
const { MAX_VIDEO_TRANSFER_BYTES } = require("../src/media/previewDelivery");
const { scenario, context, content, NOW } = require("./helpers/campaign-regressions");
const OTHER = "22222222-2222-4222-8222-222222222222";
async function fixture({ mime = "image/png", size = 32, configured = true } = {}) {
  const id = randomUUID(), video = mime === "video/mp4", kind = video ? "video" : "image";
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" }[mime];
  const asset = { asset_id: id, tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", status: "active", source_kind: "generated", media_kind: kind, job_id: "job_1", allowed_uses: ["campaign.preview"],
    storage_bucket: "private-preview-test", storage_key: objectKey({ tenantId: "tenant_a", projectId: "project_a", mediaKind: kind, assetId: id, extension: ext }), mime_type: mime,
    manifest: { asset_id: id, mime_type: mime, byte_size: size, width: 100, height: 100, duration_ms: video ? 4000 : null } };
  const state = { requests: [], bytes: 0, statPatch: {}, responsePatch: {}, missing: false, unavailable: false, bodyDelta: 0 };
  const storage = new GoogleCloudMediaStorage({ bucket: asset.storage_bucket, accessTokenProvider: async () => "fake-storage-token",
    fetchImpl: async (url, init) => {
      state.requests.push({ url, init }); const parsed = new URL(url);
      assert.equal(parsed.hostname, "storage.googleapis.com"); assert.equal(init.redirect, "error");
      if (parsed.searchParams.has("fields")) return new Response(JSON.stringify({ size: String(size), contentType: mime, generation: "42", ...state.statPatch }));
      state.bytes++;
      assert.equal(parsed.searchParams.get("generation"), "42"); assert.equal(parsed.searchParams.get("ifGenerationMatch"), "42");
      if (state.unavailable) return new Response("do not expose bucket/key/credentials", { status: 404 });
      const range = init.headers.Range?.match(/^bytes=(\d+)-(\d+)$/);
      const count = range ? Number(range[2]) - Number(range[1]) + 1 : size;
      const headers = { "content-type": mime, "content-length": String(count), ...(range ? { "content-range": `bytes ${range[1]}-${range[2]}/${size}` } : {}), ...state.responsePatch };
      return new Response(Buffer.alloc(count + state.bodyDelta, 7), { status: state.ignoreRange ? 200 : range ? 206 : 200, headers });
    } });
  const repository = new InMemoryCampaignRepository({ now: () => new Date(NOW), authorize: async () => true,
    captureBrandSnapshot: async () => ({ brand_snapshot_id: randomUUID(), tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a", source_version: 1, source_updated_at: NOW, source_schema_version: "brand-brain.v1", snapshot: { name: "Private" }, snapshot_hash: "a".repeat(64), captured_at: NOW }),
    resolveMedia: async () => state.missing ? null : structuredClone(asset) });
  const s = await scenario(repository), target = await s.add(kind, { ...content, asset_refs: [{ asset_id: id, role: "primary" }] });
  const authRepo = new InMemoryAuthorizationRepository({ customerProfiles: [{ auth_user_id: context.actor.auth_user_id }, { auth_user_id: OTHER }],
    tenants: [{ tenant_id: "tenant_a", name: "A", created_by: context.actor.auth_user_id }, { tenant_id: "tenant_b", name: "B", created_by: OTHER }],
    memberships: [{ tenant_id: "tenant_a", auth_user_id: context.actor.auth_user_id, role: "owner" }, { tenant_id: "tenant_b", auth_user_id: OTHER, role: "owner" }],
    projects: [{ project_id: "project_a", tenant_id: "tenant_a", name: "A" }, { project_id: "project_b", tenant_id: "tenant_b", name: "B" }], brands: [] });
  const app = createApp({ campaignRepository: repository, mediaPreviewStorage: configured ? storage : null, authorizationRepository: authRepo,
    customerTokenVerifier: { async verifyAccessToken(token) { if (!["a", "b"].includes(token)) throw new AuthenticationRequiredError(); return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: token === "a" ? context.actor.auth_user_id : OTHER }); } },
    corsConfig: { enabled: true, allowedOrigins: ["https://studio.example"] }, logger: { error() {}, warn() {}, info() {} } });
  const path = `/customer/campaigns/${s.id}/variants/${target.variant_id}/revisions/${target.revision_id}/assets/${id}/preview`;
  const get = ({ method = "get", token = "a", pathOverride = path, query = {}, headers = {} } = {}) => {
    const r = request(app)[method](pathOverride).query({ tenant_id: "tenant_a", project_id: "project_a", expected_campaign_version: 2, ...query });
    if (token) r.set("authorization", `Bearer ${token}`); for (const [key, value] of Object.entries(headers)) r.set(key, value); return r;
  };
  return { app, s, target, asset, storage, state, path, get };
}
for (const mime of ["image/png", "image/jpeg", "image/webp", "video/mp4"]) test(`delivers existing ${mime} bytes without state mutation or leaked authority`, async () => {
  const f = await fixture({ mime }), before = await f.s.get();
  const r = await f.get().buffer(true).parse((res, done) => { const parts=[]; res.on("data",part=>parts.push(part)); res.on("end",()=>done(null,Buffer.concat(parts))); });
  assert.deepEqual(r.body, Buffer.alloc(32,7));
  assert.equal(r.status, 200); assert.equal(r.headers["content-type"], mime); assert.equal(r.headers["content-length"], "32");
  assert.match(r.headers["cache-control"], /no-store/); assert.match(r.headers.vary, /Authorization/); assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(f.state.bytes, 1); assert.deepEqual(await f.s.get(), before);
  assert.doesNotMatch(JSON.stringify(r.headers), /private-preview-test|storage.googleapis|assets\//);
});
test("HEAD checks authorization and object metadata without opening bytes", async () => {
  const f = await fixture(); const r = await f.get({ method: "head" }); assert.equal(r.status, 200); assert.equal(r.headers["content-length"], "32"); assert.equal(f.state.requests.length, 1); assert.equal(f.state.bytes, 0);
});
test("denies missing identity, admin-key substitution and foreign scope before storage access", async () => {
  const f = await fixture();
  for (const patch of [{ token: null }, { token: "invalid" }, { token: null, headers: { "x-admin-key": "irrelevant" } }]) assert.equal((await f.get(patch)).status, 401);
  for (const patch of [{ token: "b" }, { token: "b", query: { tenant_id: "tenant_b", project_id: "project_b" } }, { query: { project_id: "project_b" } }]) assert.equal((await f.get(patch)).status, 404);
  assert.equal(f.state.requests.length, 0);
});
test("requires exact version, current revision, known variant and referenced asset before storage", async () => {
  const f = await fixture();
  assert.equal((await f.get({ query: { expected_campaign_version: 1 } })).status, 409);
  assert.equal((await f.get({ query: { expected_campaign_version: undefined } })).status, 400);
  assert.equal((await f.get({ query: { expected_campaign_version: "1e2" } })).status, 400);
  assert.equal((await f.get({ pathOverride: f.path.replace(f.target.revision_id, randomUUID()) })).status, 409);
  assert.equal((await f.get({ pathOverride: f.path.replace(f.target.variant_id, randomUUID()) })).status, 404);
  assert.equal((await f.get({ pathOverride: f.path.replace(f.asset.asset_id, randomUUID()) })).status, 404);
  assert.equal(f.state.requests.length, 0);
});
test("revoked/missing/foreign/rightless/mismatched generation and manifest media never reaches storage", async () => {
  for (const patch of [{ status: "revoked" }, { source_kind: "reference" }, { tenant_id: "tenant_b" }, { project_id: "project_b" }, { brand_id: "brand_b" }, { job_id: "wrong" }, { allowed_uses: [] }, { storage_key: "https://untrusted.invalid/key" }, { mime_type: "text/html" }, { manifest: { mime_type: "image/png", byte_size: 1 } }]) {
    const f = await fixture(); Object.assign(f.asset, patch); assert.equal((await f.get()).status, 404); assert.equal(f.state.requests.length, 0);
  }
  const f = await fixture(); f.state.missing = true; assert.equal((await f.get()).status, 404); assert.equal(f.state.requests.length, 0);
});
test("unconfigured or wrong-bucket storage fails closed after authority checks", async () => {
  const f = await fixture({ configured: false }); assert.equal((await f.get()).status, 503); assert.equal(f.state.requests.length, 0);
  const wrong = await fixture(); wrong.storage.bucket = "different-private-bucket"; assert.equal((await wrong.get()).status, 503); assert.equal(wrong.state.requests.length, 0);
});
for (const [range, expected] of [["bytes=0-7", "bytes 0-7/32"], ["bytes=8-", "bytes 8-31/32"], ["bytes=-8", "bytes 24-31/32"], ["bytes=0-999", "bytes 0-31/32"]]) test(`single video range ${range} has exact 206 semantics`, async () => {
  const f = await fixture({ mime: "video/mp4" }); const r = await f.get({ headers: { Range: range } }); assert.equal(r.status, 206); assert.equal(r.headers["content-range"], expected);
});
test("rejects malformed/multiple/unsafe/unsatisfiable video ranges and all image ranges", async () => {
  const f = await fixture({ mime: "video/mp4" });
  for (const Range of ["bytes=0-2,4-6", "bytes=-0", "bytes=32-40", "bytes=9-1", "bytes=9007199254740992-", "bytes=-", "items=0-1"]) {
    const r = await f.get({ headers: { Range } }); assert.equal(r.status, 416); assert.equal(r.headers["content-range"], "bytes */32");
  }
  assert.equal(f.state.bytes, 0);
  const image = await fixture(); assert.equal((await image.get({ headers: { Range: "bytes=0-7" } })).status, 416); assert.equal(image.state.bytes, 0);
});
test("large video requires a bounded range and never downloads a whole object by accident", async () => {
  const f = await fixture({ mime: "video/mp4", size: MAX_VIDEO_TRANSFER_BYTES + 1 });
  for (const headers of [{}, { Range: "bytes=0-" }, { Range: `bytes=0-${MAX_VIDEO_TRANSFER_BYTES}` }, { Range: `bytes=-${MAX_VIDEO_TRANSFER_BYTES + 1}` }]) assert.equal((await f.get({ headers })).status, 416);
  assert.equal(f.state.bytes, 0); assert.equal((await f.get({ headers: { Range: "bytes=0-7" } })).status, 206);
});
test("object size/MIME/generation metadata limits are checked before the byte read", async () => {
  for (const statPatch of [{ size: String(MAX_IMAGE_BYTES + 1) }, { contentType: "text/html" }, { generation: "untrusted" }, { size: "31" }]) {
    const f = await fixture(); f.state.statPatch = statPatch; assert.equal((await f.get()).status, 503); assert.equal(f.state.bytes, 0);
  }
});
test("upstream errors and range/length/type inconsistencies are sanitized before response bytes", async () => {
  for (const patch of [{ unavailable: true }, { responsePatch: { "content-length": "1" } }, { responsePatch: { "content-type": "text/html" } }, { responsePatch: { "content-encoding": "gzip" } }, { ignoreRange: true }, { responsePatch: { "content-range": "bytes 1-8/32" } }]) {
    const f = await fixture({ mime: "video/mp4" }); Object.assign(f.state, patch);
    const r = await f.get({ headers: { Range: "bytes=0-7" } }); assert.equal(r.status, 503); assert.doesNotMatch(JSON.stringify(r.body), /bucket|credentials|storage_key|private-preview/);
  }
});
test("short and overlong streams terminate the connection instead of reporting complete success", async () => {
  for (const bodyDelta of [-1, 1]) { const f = await fixture(); f.state.bodyDelta = bodyDelta; await assert.rejects(f.get(), /aborted|socket hang up|ECONNRESET/); }
});
test("route-specific exact-origin CORS exposes ranges without broadening other routes", async () => {
  const f = await fixture(); const r = await f.get({ headers: { Origin: "https://studio.example" } });
  assert.equal(r.status, 200); assert.match(r.headers.vary, /Origin/); assert.match(r.headers.vary, /Authorization/); assert.match(r.headers["access-control-expose-headers"], /Content-Range/);
  assert.equal((await f.get({ headers: { Origin: "https://foreign.example" } })).status, 403);
  const preflight = await request(f.app).options(f.path).set("origin", "https://studio.example").set("access-control-request-method", "HEAD").set("access-control-request-headers", "authorization,range"); assert.equal(preflight.status, 204);
  const other = await request(f.app).options("/customer/generate-video").set("origin", "https://studio.example").set("access-control-request-method", "HEAD").set("access-control-request-headers", "range"); assert.equal(other.status, 403);
});
test("conditional ranges are rejected instead of inventing an If-Range validator",async()=>{
  const f=await fixture({mime:"video/mp4"});assert.equal((await f.get({headers:{Range:"bytes=0-7","If-Range":"untrusted"}})).status,400);assert.equal(f.state.requests.length,0);
});
test("authorised objects over the inherited image/video caps return 413 without downloading",async()=>{
  for(const [mime,size] of [["image/png",MAX_IMAGE_BYTES+1],["video/mp4",MAX_VIDEO_BYTES+1]]){
    const f=await fixture({mime,size});assert.equal((await f.get()).status,413);assert.equal(f.state.bytes,0);
  }
});
