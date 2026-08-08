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

  it("authorises upsert and retrieval with server metadata defaults", async () => {
    const app = createApp();
    const created = await admin(
      request(app)
        .put("/_admin/brand-brains/brand_001")
        .send(validInput())
    );

    assert.equal(created.status, 200);
    assert.equal(created.body.brand_brain.brand_id, "brand_001");
    assert.equal(created.body.brand_brain.project_id, "project_001");
    assert.deepEqual(created.body.brand_brain.metadata, {
      version: 1,
      status: "approved",
      created_at: created.body.brand_brain.metadata.created_at,
      updated_at: created.body.brand_brain.metadata.updated_at,
    });

    const fetched = await admin(
      request(app).get("/_admin/brand-brains/brand_001")
    );
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body, created.body);
  });

  it("authorises persistent upsert and retrieval through the Postgres repository", async () => {
    const repository = new PostgresBrandBrainRepository({
      pool: new FakeBrandBrainPool(),
    });
    const app = createApp({ brandBrainRepository: repository });

    const created = await admin(
      request(app)
        .put("/_admin/brand-brains/brand_persistent")
        .send(validInput())
    );
    const fetched = await admin(
      request(app).get("/_admin/brand-brains/brand_persistent")
    );

    assert.equal(created.status, 200);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body, created.body);
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

    await admin(
      request(app)
        .put("/_admin/brand-brains/brand_001")
        .send(validInput())
    );
    const reassignment = await admin(
      request(app)
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
