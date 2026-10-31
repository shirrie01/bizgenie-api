"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CustomerReferenceImageService } = require("../src/media/customerReferenceImageService");

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const authority = { verified: true, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a" };

function fixture({ decodeImage = async () => true, scanImage = async () => true } = {}) {
  const calls = [];
  const repository = { async create(asset) { calls.push("create"); return asset; } };
  const storage = {
    bucket: "private-test",
    async putObject({ data }) { calls.push("put"); return { byteSize: data.length }; },
    async delete() { calls.push("delete"); },
  };
  return {
    calls,
    service: new CustomerReferenceImageService({
      repository, storage,
      decodeImage: async input => { calls.push("decode"); return decodeImage(input); },
      scanImage: async input => { calls.push("scan"); return scanImage(input); },
    }),
  };
}

test("decoder must approve before scanner and storage can run", async () => {
  for (const decodeImage of [async () => false, async () => { throw new Error("private decoder error"); }]) {
    const f = fixture({ decodeImage });
    await assert.rejects(f.service.ingest({ authority, data: png, mimeType: "image/png" }));
    assert.deepEqual(f.calls, ["decode"]);
  }
});

test("scanner must explicitly return true; false, missing or exception never persist", async () => {
  for (const scanImage of [
    async () => false,
    async () => undefined,
    async () => ({ clean: true }),
    async () => { throw new Error("private scanner error"); },
  ]) {
    const f = fixture({ scanImage });
    await assert.rejects(f.service.ingest({ authority, data: png, mimeType: "image/png" }));
    assert.deepEqual(f.calls, ["decode", "scan"]);
  }
});

test("only explicit decoder and scanner approvals allow private persistence", async () => {
  const f = fixture();
  const result = await f.service.ingest({ authority, data: png, mimeType: "image/png" });
  assert.equal(result.media_kind, "image");
  assert.deepEqual(f.calls, ["decode", "scan", "put", "create"]);
});

test("unverified tenant scope never reaches decoder or scanner", async () => {
  const f = fixture();
  await assert.rejects(f.service.ingest({ authority: { ...authority, verified: false }, data: png, mimeType: "image/png" }));
  assert.deepEqual(f.calls, []);
});
