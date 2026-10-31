"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const request = require("supertest");
const { deliverPreview } = require("../src/media/previewDelivery");

const asset = Object.freeze({
  bucket: "private-bg-cl-007",
  key: "tenant/project/asset.mp4",
  mimeType: "video/mp4",
  mediaKind: "video",
  byteSize: 32,
  expectedGeneration: "42",
});

function fixture({ reserveDelivery, statPreview, openPreview, timeoutMs = 100 } = {}) {
  const calls = { reserve: 0, stat: 0, open: 0 };
  const storage = {
    bucket: asset.bucket,
    async statPreview(input) {
      calls.stat++;
      if (statPreview) return statPreview(input);
      return { size: 32, mimeType: "video/mp4", generation: "42" };
    },
    async openPreview(input) {
      calls.open++;
      if (openPreview) return openPreview(input);
      return new Response(Buffer.alloc(32), {
        headers: { "content-type": "video/mp4", "content-length": "32" },
      });
    },
  };
  const app = express();
  app.get("/", async (req, res) => {
    try {
      await deliverPreview(req, res, { ...asset, reserveDelivery: reserveDelivery && (async (...args) => {
        calls.reserve++;
        return reserveDelivery(...args);
      }) }, storage, { timeoutMs });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) res.status(error.status || 503).json({ error: error.code || "UNAVAILABLE" });
    }
  });
  return { app, calls };
}

test("delivery reservation is checked before metadata or object reads", async () => {
  const f = fixture({ reserveDelivery: async () => {
    const e = new Error("private billing token");
    e.code = "DISTRIBUTED_BUDGET_EXHAUSTED";
    e.status = 429;
    throw e;
  } });
  const res = await request(f.app).get("/");
  assert.equal(res.status, 429);
  assert.equal(res.body.error, "DISTRIBUTED_BUDGET_EXHAUSTED");
  assert.deepEqual(f.calls, { reserve: 1, stat: 0, open: 0 });
  assert.doesNotMatch(JSON.stringify(res.body), /private billing token/);
});

test("mismatched object generation fails closed before downloading bytes", async () => {
  const f = fixture({ statPreview: async () => ({ size: 32, mimeType: "video/mp4", generation: "43" }) });
  const res = await request(f.app).get("/");
  assert.equal(res.status, 503);
  assert.equal(f.calls.stat, 1);
  assert.equal(f.calls.open, 0);
});

test("reservation timeout fails closed and never begins a metadata request", async () => {
  const f = fixture({ timeoutMs: 20, reserveDelivery: () => new Promise(() => {}) });
  const res = await request(f.app).get("/").timeout({ deadline: 500 });
  assert.equal(res.status, 503);
  assert.equal(f.calls.reserve, 1);
  assert.equal(f.calls.stat, 0);
  assert.equal(f.calls.open, 0);
});

test("metadata promise resolving after deadline cannot initiate an object read", async () => {
  let release;
  const f = fixture({ timeoutMs: 20, statPreview: () => new Promise(resolve => {
    release = () => resolve({ size: 32, mimeType: "video/mp4", generation: "42" });
  }) });
  const res = await request(f.app).get("/").timeout({ deadline: 500 });
  assert.equal(res.status, 503);
  release();
  await new Promise(setImmediate);
  assert.equal(f.calls.open, 0);
});
