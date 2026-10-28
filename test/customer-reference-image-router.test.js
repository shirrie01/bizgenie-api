const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const { createCustomerReferenceImageRouter } = require("../src/media/customerReferenceImageRouter");

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
function fixture({ allow = true, decode = async () => true, scan = async () => true } = {}) {
  const calls = [];
  const router = createCustomerReferenceImageRouter({
    tokenVerifier: { async verifyAccessToken(token) { calls.push("verify"); return { id: token }; } },
    authorizationService: { async authorizeProjectBrand() {
      calls.push("authorize");
      return allow ? { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", brand_status: "approved" } : null;
    } },
    repository: { async create(asset) { calls.push("create"); return asset; } },
    storage: {
      bucket: "private-media",
      async putObject({ data }) { calls.push("store"); return { byteSize: data.length }; },
      async delete() { calls.push("delete"); },
    },
    decodeImage: async (input) => { calls.push("decode"); return decode(input); },
    scanImage: async (input) => { calls.push("scan"); return scan(input); },
  });
  const app = express();
  app.use("/customer/references", router);
  return { app, calls };
}
const endpoint = "/customer/references/images?tenant_id=tenant-a&project_id=project-a&brand_id=brand-a";
function upload(app, url = endpoint, auth = true) {
  const req = request(app).post(url).set("Content-Type", "image/png");
  if (auth) req.set("Authorization", "Bearer fixture-token");
  return req.send(png);
}
test("requires a verified bearer token before authorization or storage", async () => {
  const { app, calls } = fixture();
  const res = await upload(app, endpoint, false);
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});
test("denies unapproved brand access before decoding and storage", async () => {
  const { app, calls } = fixture({ allow: false });
  const res = await upload(app);
  assert.equal(res.status, 404);
  assert.deepEqual(calls, ["verify", "authorize"]);
});
test("rejects client scope tampering before authorization", async () => {
  const { app, calls } = fixture();
  const res = await upload(app, endpoint + "&verified=true");
  assert.equal(res.status, 400);
  assert.deepEqual(calls, []);
});
test("decoding failure never scans, stores or writes a reference", async () => {
  const { app, calls } = fixture({ decode: async () => false });
  const res = await upload(app);
  assert.equal(res.status, 404);
  assert.deepEqual(calls, ["verify", "authorize", "decode"]);
});
test("scanner rejection never stores or writes a reference", async () => {
  const { app, calls } = fixture({ scan: async () => false });
  const res = await upload(app);
  assert.equal(res.status, 404);
  assert.deepEqual(calls, ["verify", "authorize", "decode", "scan"]);
});
test("authorized image passes decode and scan before scoped private storage", async () => {
  const { app, calls } = fixture();
  const res = await upload(app);
  assert.equal(res.status, 201);
  assert.equal(res.body.asset.media_kind, "image");
  assert.deepEqual(calls, ["verify", "authorize", "decode", "scan", "store", "create"]);
});
test("refuses to construct router without a decoder", () => {
  assert.throws(() => createCustomerReferenceImageRouter({
    tokenVerifier: { verifyAccessToken() {} },
    authorizationService: { authorizeProjectBrand() {} },
    repository: {}, storage: {}, scanImage: async () => true,
  }), /requires/);
});


test("rejects content-encoded upload without invoking any provider", async () => {
  const { app, calls } = fixture();
  const res = await request(app).post(endpoint)
    .set("Authorization", "Bearer fixture-token")
    .set("Content-Type", "image/png")
    .set("Content-Encoding", "gzip")
    .send(png);
  assert.equal(res.status, 415);
  assert.deepEqual(calls, []);
});

test("rejects invalid verifier identity before authorization", async () => {
  const calls = [];
  const router = createCustomerReferenceImageRouter({
    tokenVerifier: { async verifyAccessToken() { calls.push("verify"); return null; } },
    authorizationService: { async authorizeProjectBrand() { calls.push("authorize"); return null; } },
    repository: { async create() { calls.push("create"); } },
    storage: { bucket: "private-media", async putObject() { calls.push("store"); }, async delete() {} },
    decodeImage: async () => true, scanImage: async () => true,
  });
  const app = express(); app.use("/customer/references", router);
  const res = await upload(app);
  assert.equal(res.status, 401);
  assert.deepEqual(calls, ["verify"]);
});
