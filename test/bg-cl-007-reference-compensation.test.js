"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CustomerReferenceImageService } = require("../src/media/customerReferenceImageService");

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const authority = { verified: true, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a" };

function make({ repositoryCreate, storagePut, storageDelete } = {}) {
  const events = [];
  const storage = {
    bucket: "private-media",
    async putObject(input) { events.push("put"); return storagePut ? storagePut(input) : { byteSize: input.data.length }; },
    async delete(input) { events.push("delete"); if (storageDelete) return storageDelete(input); },
  };
  const repository = {
    async create(input) { events.push("create"); return repositoryCreate ? repositoryCreate(input) : input; },
  };
  return { events, service: new CustomerReferenceImageService({
    repository, storage, scanImage: async () => true, decodeImage: async () => true,
  }) };
}

test("storage write failure never attempts a repository insert", async () => {
  const f = make({ storagePut: async () => { throw Error("private storage credentials"); } });
  await assert.rejects(f.service.ingest({ authority, data: png, mimeType: "image/png" }));
  assert.deepEqual(f.events, ["put"]);
});

test("repository rejection triggers object cleanup and denies success", async () => {
  const f = make({ repositoryCreate: async () => { throw Error("database offline"); } });
  await assert.rejects(f.service.ingest({ authority, data: png, mimeType: "image/png" }));
  assert.deepEqual(f.events, ["put", "create", "delete"]);
});

test("cleanup failure still denies success and does not expose internal error", async () => {
  const f = make({
    repositoryCreate: async () => { throw Error("private database"); },
    storageDelete: async () => { throw Error("private storage cleanup"); },
  });
  await assert.rejects(
    f.service.ingest({ authority, data: png, mimeType: "image/png" }),
    error => {
      assert.doesNotMatch(error.message, /private database|private storage cleanup/);
      return true;
    }
  );
  assert.deepEqual(f.events, ["put", "create", "delete"]);
});
