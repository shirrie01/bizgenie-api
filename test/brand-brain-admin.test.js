const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const request = require("supertest");
const { PostgresBrandBrainRepository } = require("../src/brand-brain");
const { createApp } = require("../index");
const { FakeBrandBrainPool } = require("./helpers/fake-brand-brain-pool");

const ADMIN_KEY = "brand-brain-admin-test-key";

function admin(client) {
  return client.set("x-admin-key", ADMIN_KEY);
}

function validInput(overrides = {}) {
  return {
    project_id: "project_001",
    name: "BizGenie",
    identity: { positioning: "AI Brand Operating System." },
    voice: { prohibited_terms: ["magic button"] },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("Brand Brain administration", () => {
  it("rejects unauthorised upsert and retrieval", async () => {
    const app = createApp();
    const upsert = await request(app)
      .put("/_admin/brand-brains/brand_001")
      .send(validInput());
    const get = await request(app).get("/_admin/brand-brains/brand_001");

    assert.equal(upsert.status, 403);
    assert.deepEqual(upsert.body, { error: "Forbidden" });
    assert.equal(get.status, 403);
    assert.deepEqual(get.body, { error: "Forbidden" });
  });

  it("prohibits admin-key-only identity creation", async () => {
    const response = await admin(request(createApp()).put("/_admin/brand-brains/new").send(validInput()));
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "BRAND_BRAIN_WRITE_FORBIDDEN");
  });

  it("preserves admin retrieval and non-identity edits but denies identity changes/removal", async () => {
    const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
    const repository = new InMemoryBrandBrainRepository();
    const record = { ...validInput(), brand_id: "brand_001", identity: { description: "Customer description" }, metadata: { version: 1, status: "approved", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" } };
    repository.upsert(record);
    const app = createApp({ brandBrainRepository: repository });
    const saved = await admin(request(app).put("/_admin/brand-brains/brand_001").send({ ...record, voice: { tone: "Warm" } }));
    assert.equal(saved.status, 200);
    for (const change of [{ name: "Changed" }, { identity: {} }, { identity: { description: "Changed" } }]) {
      const denied = await admin(request(app).put("/_admin/brand-brains/brand_001").send({ ...record, ...change }));
      assert.equal(denied.status, 403);
    }
    const fetched = await admin(request(app).get("/_admin/brand-brains/brand_001"));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.brand_brain.name, record.name);
    assert.equal(fetched.body.brand_brain.voice.tone, "Warm");
  });

  it("returns a safe structured error when persistent retrieval fails", async () => {
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool({
        failure: new Error("private provider diagnostic details"),
      }),
    });
    const response = await admin(
      request(createApp({ brandBrainRepository: repository })).get(
        "/_admin/brand-brains/brand_001"
      )
    );

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      error: {
        code: "BRAND_BRAIN_PERSISTENCE_UNAVAILABLE",
        message: "Brand Brain persistence is temporarily unavailable",
      },
    });
    assert.doesNotMatch(JSON.stringify(response.body), /private|provider|diagnostic/);
  });

  it("rejects malformed records with structured validation details", async () => {
    const response = await admin(
      request(createApp())
        .put("/_admin/brand-brains/brand_001")
        .send({ project_id: "bad project", voice: [] })
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.equal(response.body.error.message, "Request validation failed");
    assert.deepEqual(
      response.body.error.details.map(({ path }) => path),
      ["project_id", "name", "voice"]
    );
  });

  it("rejects malformed JSON with the shared structured response", async () => {
    const response = await admin(
      request(createApp())
        .put("/_admin/brand-brains/brand_001")
        .set("content-type", "application/json")
        .send('{"project_id":')
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            path: "",
            code: "invalid_json",
            message: "Malformed JSON request body",
          },
        ],
      },
    });
  });

  it("rejects route/body identity mismatch and project reassignment", async () => {
    const app = createApp();
    const mismatch = await admin(
      request(app)
        .put("/_admin/brand-brains/brand_001")
        .send(validInput({ brand_id: "brand_002" }))
    );
    assert.equal(mismatch.status, 400);

    const { InMemoryBrandBrainRepository } = require("../src/brand-brain");
    // Existing administrative project-conflict contract is tested on a seeded record.
    const repository = new InMemoryBrandBrainRepository();
    repository.upsert({ ...validInput(), brand_id: "brand_001", metadata: { version: 1, status: "approved", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" } });
    const seededApp = createApp({ brandBrainRepository: repository });
    const reassignment = await admin(
      request(seededApp)
        .put("/_admin/brand-brains/brand_001")
        .send(validInput({ project_id: "project_002" }))
    );
    assert.equal(reassignment.status, 409);
    assert.equal(reassignment.body.error.code, "BRAND_PROJECT_CONFLICT");
  });

  it("returns a structured 404 for an unknown Brand Brain", async () => {
    const response = await admin(
      request(createApp()).get("/_admin/brand-brains/brand_missing")
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "BRAND_BRAIN_NOT_FOUND");
  });
});
