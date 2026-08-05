const assert = require("node:assert/strict");
const { after, beforeEach, describe, it } = require("node:test");
const request = require("supertest");
const { createApp } = require("../index");

const ADMIN_KEY = "mission-control-test-key";

function admin(client) {
  return client.set("x-admin-key", ADMIN_KEY);
}

function validReview(overrides = {}) {
  return {
    review_type: "weekly",
    status: "draft",
    evidence_pack_id: "evidence_pack_001",
    ...overrides,
  };
}

function validFinding(overrides = {}) {
  return {
    reviewer_role: "Technical and security architect",
    provider: "test-provider",
    title: "Unbounded provider retries",
    description: "Provider retries have no explicit upper bound.",
    severity: "high",
    confidence: 0.9,
    status: "open",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.ADMIN_KEY = ADMIN_KEY;
});

after(() => {
  delete process.env.ADMIN_KEY;
});

describe("existing route regression coverage", () => {
  it("preserves the root response", async () => {
    const response = await request(createApp()).get("/");

    assert.equal(response.status, 200);
    assert.equal(response.text, "BizGenie Cloud Run is up");
  });

  it("preserves admin ping authorisation and response", async () => {
    const unauthorised = await request(createApp()).get("/_admin/ping");
    assert.equal(unauthorised.status, 403);
    assert.deepEqual(unauthorised.body, { error: "Forbidden" });

    const authorised = await admin(
      request(createApp()).get("/_admin/ping")
    );
    assert.equal(authorised.status, 200);
    assert.deepEqual(authorised.body, { status: "ok" });
  });

  it("preserves generate-script validation response", async () => {
    const response = await admin(
      request(createApp()).post("/generate-script").send({})
    );

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      status: "failed",
      error: "Missing required fields",
      script_body: "",
    });
  });
});

describe("Mission Control authorisation", () => {
  const requests = [
    ["POST reviews", (app) => request(app).post("/_admin/mission-control/reviews")],
    [
      "GET review",
      (app) => request(app).get("/_admin/mission-control/reviews/review_001"),
    ],
    [
      "POST finding",
      (app) =>
        request(app).post(
          "/_admin/mission-control/reviews/review_001/findings"
        ),
    ],
    [
      "GET findings",
      (app) =>
        request(app).get(
          "/_admin/mission-control/reviews/review_001/findings"
        ),
    ],
  ];

  for (const [name, buildRequest] of requests) {
    it(`returns 403 for missing or invalid admin key on ${name}`, async () => {
      const missing = await buildRequest(createApp());
      assert.equal(missing.status, 403);
      assert.deepEqual(missing.body, { error: "Forbidden" });

      const invalid = await buildRequest(createApp()).set(
        "x-admin-key",
        "wrong-key"
      );
      assert.equal(invalid.status, 403);
      assert.deepEqual(invalid.body, { error: "Forbidden" });
    });
  }
});

describe("Mission Control reviews", () => {
  it("creates and fetches a review with server-generated identity fields", async () => {
    const app = createApp();
    const created = await admin(
      request(app)
        .post("/_admin/mission-control/reviews")
        .send(validReview())
    );

    assert.equal(created.status, 201);
    assert.match(created.body.review.review_id, /^review_[0-9a-f-]{36}$/);
    assert.equal(created.body.review.review_type, "weekly");
    assert.equal(created.body.review.status, "draft");
    assert.equal(
      created.body.review.evidence_pack_id,
      "evidence_pack_001"
    );
    assert.equal(
      new Date(created.body.review.created_at).toISOString(),
      created.body.review.created_at
    );

    const fetched = await admin(
      request(app).get(
        `/_admin/mission-control/reviews/${created.body.review.review_id}`
      )
    );

    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body, created.body);
  });

  it("returns a stable structured 400 response for invalid review input", async () => {
    const app = createApp();
    const makeRequest = () =>
      admin(
        request(app)
          .post("/_admin/mission-control/reviews")
          .send({ review_type: "annual" })
      );

    const first = await makeRequest();
    const second = await makeRequest();

    assert.equal(first.status, 400);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.error.code, "VALIDATION_ERROR");
    assert.equal(first.body.error.message, "Request validation failed");
    assert.ok(Array.isArray(first.body.error.details));
    assert.deepEqual(
      first.body.error.details.map(({ path }) => path),
      ["review_type", "status", "evidence_pack_id"]
    );
  });

  it("returns a structured 400 response for malformed JSON", async () => {
    const response = await admin(
      request(createApp())
        .post("/_admin/mission-control/reviews")
        .set("content-type", "application/json")
        .send('{"review_type":')
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

  it("returns a structured 404 response for an unknown review", async () => {
    const response = await admin(
      request(createApp()).get(
        "/_admin/mission-control/reviews/review_missing"
      )
    );

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: {
        code: "REVIEW_NOT_FOUND",
        message: "Review 'review_missing' was not found",
      },
    });
  });
});

describe("Mission Control findings", () => {
  it("adds a finding to a review and lists it", async () => {
    const app = createApp();
    const createdReview = await admin(
      request(app)
        .post("/_admin/mission-control/reviews")
        .send(validReview())
    );
    const reviewId = createdReview.body.review.review_id;

    const createdFinding = await admin(
      request(app)
        .post(`/_admin/mission-control/reviews/${reviewId}/findings`)
        .send(validFinding())
    );

    assert.equal(createdFinding.status, 201);
    assert.match(
      createdFinding.body.finding.finding_id,
      /^finding_[0-9a-f-]{36}$/
    );
    assert.equal(createdFinding.body.finding.review_id, reviewId);
    assert.equal(
      new Date(createdFinding.body.finding.created_at).toISOString(),
      createdFinding.body.finding.created_at
    );

    const listed = await admin(
      request(app).get(
        `/_admin/mission-control/reviews/${reviewId}/findings`
      )
    );

    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body, {
      findings: [createdFinding.body.finding],
    });
  });

  it("rejects an invalid finding with structured validation details", async () => {
    const app = createApp();
    const createdReview = await admin(
      request(app)
        .post("/_admin/mission-control/reviews")
        .send(validReview())
    );

    const response = await admin(
      request(app)
        .post(
          `/_admin/mission-control/reviews/${createdReview.body.review.review_id}/findings`
        )
        .send(validFinding({ confidence: 2 }))
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "VALIDATION_ERROR");
    assert.deepEqual(
      response.body.error.details.map(({ path }) => path),
      ["confidence"]
    );
  });

  it("does not add a finding to a non-existent review", async () => {
    const response = await admin(
      request(createApp())
        .post(
          "/_admin/mission-control/reviews/review_missing/findings"
        )
        .send(validFinding())
    );

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      error: {
        code: "REVIEW_NOT_FOUND",
        message: "Review 'review_missing' was not found",
      },
    });
  });
});
