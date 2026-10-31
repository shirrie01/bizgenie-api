"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { createCustomerReferenceImageRouter } = require("../src/media/customerReferenceImageRouter");

const endpoint = "/customer/references/images?tenant_id=tenant-a&project_id=project-a&brand_id=brand-a";
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);

function fixture({ grant, tokenVerifier } = {}) {
  const calls = [];
  const app = express();
  app.use("/customer/references", createCustomerReferenceImageRouter({
    tokenVerifier: { async verifyAccessToken(token) {
      calls.push("verify");
      return tokenVerifier ? tokenVerifier(token) : { sub: "actor-a" };
    } },
    authorizationService: { async authorizeProjectBrand() {
      calls.push("authorize");
      return grant === undefined ? { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", brand_status: "approved" } : grant;
    } },
    repository: { async create(asset) { calls.push("create"); return asset; } },
    storage: { bucket: "private-test", async putObject({data}) { calls.push("put"); return {byteSize:data.length}; }, async delete() { calls.push("delete"); } },
    decodeImage: async () => { calls.push("decode"); return true; },
    scanImage: async () => { calls.push("scan"); return true; },
  }));
  return { app, calls };
}
function upload(app, url=endpoint, auth="Bearer test-token") {
  return request(app).post(url).set("Content-Type","image/png").set("Authorization",auth).send(png);
}

test("wrong tenant grant never reaches decoding or persistence", async () => {
  const f=fixture({grant:{tenant_id:"tenant-b",project_id:"project-a",brand_id:"brand-a",brand_status:"approved"}});
  const res=await upload(f.app);
  assert.equal(res.status,404);
  assert.deepEqual(f.calls,["verify","authorize"]);
});
test("wrong project grant never reaches decoding or persistence", async () => {
  const f=fixture({grant:{tenant_id:"tenant-a",project_id:"project-b",brand_id:"brand-a",brand_status:"approved"}});
  const res=await upload(f.app);
  assert.equal(res.status,404);
  assert.deepEqual(f.calls,["verify","authorize"]);
});
test("wrong brand grant never reaches decoding or persistence", async () => {
  const f=fixture({grant:{tenant_id:"tenant-a",project_id:"project-a",brand_id:"brand-b",brand_status:"approved"}});
  const res=await upload(f.app);
  assert.equal(res.status,404);
  assert.deepEqual(f.calls,["verify","authorize"]);
});
test("unapproved brand grant never reaches decoding or persistence", async () => {
  const f=fixture({grant:{tenant_id:"tenant-a",project_id:"project-a",brand_id:"brand-a",brand_status:"pending"}});
  const res=await upload(f.app);
  assert.equal(res.status,404);
  assert.deepEqual(f.calls,["verify","authorize"]);
});
test("token verifier failure cannot reach brand authorization", async () => {
  const f=fixture({tokenVerifier:async()=>{throw Error("private token detail");}});
  const res=await upload(f.app);
  assert.equal(res.status,404);
  assert.deepEqual(f.calls,["verify"]);
  assert.doesNotMatch(JSON.stringify(res.body),/private token detail/);
});
test("malformed bearer token cannot reach any verifier", async () => {
  const f=fixture();
  const res=await upload(f.app,endpoint,"Bearer invalid token");
  assert.equal(res.status,401);
  assert.deepEqual(f.calls,[]);
});
