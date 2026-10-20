const test = require("node:test");
const assert = require("node:assert/strict");
const { CustomerReferenceImageService, detectImageMime } = require("../src/media/customerReferenceImageService");

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const authority = { verified:true, tenant_id:"tenant-a", project_id:"project-a", brand_id:"brand-a" };

function harness({ scanner = async () => true, createFails = false } = {}) {
  const events = [];
  const storage = {
    bucket:"private-media",
    async putObject(input) { events.push(["put", input.key]); return { byteSize: input.data.length }; },
    async delete(input) { events.push(["delete", input.key]); },
  };
  const repository = {
    async create(asset) { events.push(["create", asset]); if (createFails) throw new Error("db"); return asset; },
  };
  return { service:new CustomerReferenceImageService({repository, storage, scanImage:scanner}), events };
}

test("detectImageMime identifies supported signature", () => {
  assert.equal(detectImageMime(png), "image/png");
  assert.equal(detectImageMime(Buffer.from("not an image")), null);
});

test("stores brand-scoped reference only after scanner passes", async () => {
  const {service,events} = harness();
  const result = await service.ingest({authority, data:png, mimeType:"image/png"});
  assert.match(result.asset_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(events.map(e=>e[0]), ["put","create"]);
  const asset = events[1][1];
  assert.equal(asset.source_kind, "reference");
  assert.equal(asset.brand_id, "brand-a");
  assert.equal(asset.tenant_id, "tenant-a");
  assert.deepEqual(asset.allowed_uses, ["image.generate.reference","video.generate.reference","campaign.preview"]);
  assert.match(asset.storage_key, /^assets\/[a-f0-9]{64}\/[a-f0-9]{64}\/image\/[0-9a-f-]{36}\.png$/);
});

test("rejects unverified authority before storage", async () => {
  const {service,events} = harness();
  await assert.rejects(service.ingest({authority:{...authority, verified:false},data:png,mimeType:"image/png"}));
  assert.equal(events.length,0);
});

test("rejects spoofed MIME and malformed image before storage", async () => {
  const {service,events} = harness();
  await assert.rejects(service.ingest({authority,data:png,mimeType:"image/jpeg"}));
  await assert.rejects(service.ingest({authority,data:Buffer.from("garbage"),mimeType:"image/png"}));
  assert.equal(events.length,0);
});

test("fails closed when scanner rejects or errors", async () => {
  for (const scanner of [async()=>false,async()=>{throw Error("offline");}]) {
    const {service,events} = harness({scanner});
    await assert.rejects(service.ingest({authority,data:png,mimeType:"image/png"}));
    assert.equal(events.length,0);
  }
});

test("removes stored object when database insert fails", async () => {
  const {service,events} = harness({createFails:true});
  await assert.rejects(service.ingest({authority,data:png,mimeType:"image/png"}));
  assert.deepEqual(events.map(e=>e[0]),["put","create","delete"]);
});
