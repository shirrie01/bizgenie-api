const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");
const { loadCorsConfig } = require("../src/activation");
const {
  InMemoryPaidBetaRepository,
  PAID_BETA_CONSENT_VERSION,
  PAID_BETA_CONSENT_WORDING,
  PaidBetaCaptureService,
  PaidBetaPersistenceError,
} = require("../src/paid-beta");

const NOW = "2026-09-01T17:00:00.000Z";

function payload(overrides = {}) {
  return {
    name: "  Ada Lovelace  ",
    work_email: "Ada@Example.COM",
    business_name: "Analytical Engines Ltd",
    website_or_social_profile: "https://example.com/ada",
    business_stage: "250k-1m",
    primary_marketing_challenge: "Keeping launch campaigns consistent.",
    privacy_contact_consent: true,
    source: "homepage-paid-beta",
    submission_id: "submit_001",
    ...overrides,
  };
}

function setup({ maximumAttempts = 100 } = {}) {
  const repository = new InMemoryPaidBetaRepository();
  const service = new PaidBetaCaptureService({
    repository,
    config: {
      enabled: true,
      submissionHashSecret: "s".repeat(32),
      clientHashSecret: "c".repeat(32),
      consentVersion: PAID_BETA_CONSENT_VERSION,
      consentWording: PAID_BETA_CONSENT_WORDING,
      rateLimitMaxAttempts: maximumAttempts,
      rateLimitWindowSeconds: 900,
    },
    now: () => new Date(NOW),
  });
  const app = createApp({
    paidBetaCaptureService: service,
    logger: { info() {}, warn() {}, error() {} },
  });
  return { app, repository, service };
}

describe("public paid-beta interest capture", () => {
  it("accepts a valid interest and safely normalizes email and bounded text", async () => {
    const { app, repository } = setup();
    const response = await request(app).post("/public/paid-beta-interest").send(payload());
    assert.equal(response.status, 202);
    assert.equal(response.body.status, "received");
    assert.match(response.body.reference_id, /^pbi_[A-Za-z0-9_-]{24}$/);
    assert.equal(repository.interestsByEmail.size, 1);
    const stored = repository.interestsByEmail.get("ada@example.com");
    assert.equal(stored.name, "Ada Lovelace");
    assert.equal(stored.work_email, "ada@example.com");
    const receipt = repository.receiptsBySubmissionIdentity.get("submit_001");
    assert.equal(receipt.consent_version, PAID_BETA_CONSENT_VERSION);
    assert.equal(receipt.consent_wording, PAID_BETA_CONSENT_WORDING);
    assert.equal(receipt.consented_at, NOW);
  });

  it("returns structured sanitized validation for every invalid contract class", async () => {
    for (const invalid of [
      { name: undefined },
      { work_email: "not-an-email" },
      { business_stage: "enterprise" },
      { privacy_contact_consent: false },
      { primary_marketing_challenge: "x".repeat(1001) },
      { unknown_authority: "tenant_a" },
    ]) {
      const { app, repository } = setup();
      const candidate = payload(invalid);
      if (invalid.name === undefined) delete candidate.name;
      const response = await request(app).post("/public/paid-beta-interest").send(candidate);
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(response.body.error.message, "Request validation failed");
      assert.ok(Array.isArray(response.body.error.details));
      assert.equal(JSON.stringify(response.body).includes("tenant_a"), false);
      assert.equal(repository.interestsByEmail.size, 0);
    }
  });

  it("treats injection-like text as data and never reflects it in the receipt", async () => {
    const { app, repository } = setup();
    const injection = "<script>alert('x')</script>'; DROP TABLE paid_beta_interests; --";
    const response = await request(app).post("/public/paid-beta-interest").send(payload({
      primary_marketing_challenge: injection,
    }));
    assert.equal(response.status, 202);
    assert.equal(JSON.stringify(response.body).includes("script"), false);
    assert.equal(
      repository.interestsByEmail.get("ada@example.com").primary_marketing_challenge,
      injection
    );
  });

  it("replays one submission identity without a second record", async () => {
    const { app, repository } = setup();
    const first = await request(app).post("/public/paid-beta-interest").send(payload());
    const replay = await request(app).post("/public/paid-beta-interest").send(payload());
    assert.equal(replay.status, 202);
    assert.equal(replay.body.reference_id, first.body.reference_id);
    assert.equal(repository.interestsByEmail.size, 1);
    assert.equal(repository.receiptsBySubmissionIdentity.size, 1);
  });

  it("deduplicates matching email across identities without revealing it", async () => {
    const { app, repository } = setup();
    const first = await request(app).post("/public/paid-beta-interest").send(payload());
    const duplicate = await request(app).post("/public/paid-beta-interest").send(payload({
      work_email: "ada@example.com",
      submission_id: "submit_002",
    }));
    assert.equal(duplicate.status, first.status);
    assert.deepEqual(Object.keys(duplicate.body).sort(), Object.keys(first.body).sort());
    assert.notEqual(duplicate.body.reference_id, first.body.reference_id);
    assert.equal(repository.interestsByEmail.size, 1);
    assert.equal(repository.receiptsBySubmissionIdentity.size, 2);
  });

  it("converges concurrent duplicate submission", async () => {
    const { service, repository } = setup();
    const [first, second] = await Promise.all([
      service.capture(payload()),
      service.capture(payload()),
    ]);
    assert.equal(first.reference_id, second.reference_id);
    assert.equal(repository.interestsByEmail.size, 1);
    assert.equal(repository.receiptsBySubmissionIdentity.size, 1);
  });

  it("rejects reuse of a submission identity for different intent", async () => {
    const { app, repository } = setup();
    await request(app).post("/public/paid-beta-interest").send(payload());
    const response = await request(app).post("/public/paid-beta-interest").send(payload({
      business_name: "Different Business",
    }));
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "IDEMPOTENCY_KEY_CONFLICT");
    assert.equal(repository.interestsByEmail.size, 1);
    assert.equal(repository.receiptsBySubmissionIdentity.size, 1);
  });

  it("applies durable-boundary abuse semantics and sanitizes malformed/oversized payloads", async () => {
    const { app } = setup({ maximumAttempts: 2 });
    const malformed = await request(app)
      .post("/public/paid-beta-interest")
      .set("content-type", "application/json")
      .send("{");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, "VALIDATION_ERROR");
    const invalid = await request(app).post("/public/paid-beta-interest").send({});
    assert.equal(invalid.status, 400);
    const limited = await request(app).post("/public/paid-beta-interest").send(payload());
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "PAID_BETA_RATE_LIMITED");

    const oversizedSetup = setup();
    const oversized = await request(oversizedSetup.app)
      .post("/public/paid-beta-interest")
      .send(payload({ primary_marketing_challenge: "x".repeat(20000) }));
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.error.code, "PAYLOAD_TOO_LARGE");
  });

  it("exposes no public read/list route and leaves unrelated API behavior unchanged", async () => {
    const { app } = setup();
    const list = await request(app).get("/public/paid-beta-interest");
    assert.equal(list.status, 404);
    const root = await request(app).get("/");
    assert.equal(root.status, 200);
    const admin = await request(app).get("/_admin/ping");
    assert.equal(admin.status, 403);
  });

  it("sanitizes persistence failure without leaking stored data or database details", async () => {
    const repository = new InMemoryPaidBetaRepository();
    repository.captureInterest = async () => {
      throw new PaidBetaPersistenceError("postgresql://secret@example.invalid");
    };
    const service = new PaidBetaCaptureService({
      repository,
      config: {
        enabled: true,
        submissionHashSecret: "s".repeat(32),
        clientHashSecret: "c".repeat(32),
        consentVersion: PAID_BETA_CONSENT_VERSION,
        consentWording: PAID_BETA_CONSENT_WORDING,
        rateLimitMaxAttempts: 5,
        rateLimitWindowSeconds: 900,
      },
      now: () => new Date(NOW),
    });
    const app = createApp({
      paidBetaCaptureService: service,
      logger: { info() {}, warn() {}, error() {} },
    });
    const response = await request(app).post("/public/paid-beta-interest").send(payload());
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "PAID_BETA_CAPTURE_UNAVAILABLE");
    assert.equal(JSON.stringify(response.body).includes("postgresql"), false);
    assert.equal(JSON.stringify(response.body).includes("ada@example.com"), false);
  });

  it("uses only the existing exact-origin CORS allowlist", async () => {
    const { service } = setup();
    const corsConfig = loadCorsConfig({ env: {
      BIZGENIE_ENVIRONMENT: "staging",
      CORS_ENABLED: "true",
      CORS_ALLOWED_ORIGINS: "https://homepage.example",
    } });
    const app = createApp({
      paidBetaCaptureService: service,
      corsConfig,
      logger: { info() {}, warn() {}, error() {} },
    });
    const denied = await request(app)
      .post("/public/paid-beta-interest")
      .set("origin", "https://attacker.example")
      .send(payload());
    assert.equal(denied.status, 403);
    const allowed = await request(app)
      .post("/public/paid-beta-interest")
      .set("origin", "https://homepage.example")
      .send(payload());
    assert.equal(allowed.status, 202);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://homepage.example");
  });
});
