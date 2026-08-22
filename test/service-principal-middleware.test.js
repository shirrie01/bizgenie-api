const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  FORBIDDEN_RESPONSE,
  createRequireServicePrincipal,
} = require("../src/service-principal/middleware");

class FakeVerifier {
  constructor({ credential, actor, throwOnMismatch = true } = {}) {
    this.credential = credential;
    this.actor = actor;
    this.throwOnMismatch = throwOnMismatch;
    this.calls = [];
  }

  verifyCredential(provided) {
    this.calls.push(provided);
    if (provided === this.credential) {
      return this.actor;
    }
    if (this.throwOnMismatch) {
      throw new Error("denied");
    }
    return null;
  }
}

function fakeReqRes({ header } = {}) {
  const jsonCalls = [];
  const req = {
    path: "/_service/generation-jobs/jobs/job_1/execution-payload",
    header: () => header,
  };
  const res = {
    statusCode: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      jsonCalls.push(body);
      return this;
    },
  };
  return { req, res, jsonCalls };
}

describe("requireServicePrincipal", () => {
  it("rejects a missing credential header with the fail-closed body", () => {
    const verifier = new FakeVerifier({
      credential: "svc-secret",
      actor: { kind: "service", service_id: "make", scopes: ["generation:execute"] },
    });
    const middleware = createRequireServicePrincipal({
      verifier,
      scope: "generation:execute",
    });
    const { req, res, jsonCalls } = fakeReqRes({ header: undefined });
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(jsonCalls, [FORBIDDEN_RESPONSE]);
  });

  it("rejects an unknown credential without enumerating the reason", () => {
    const verifier = new FakeVerifier({
      credential: "svc-secret",
      actor: { kind: "service", service_id: "make", scopes: ["generation:execute"] },
    });
    const middleware = createRequireServicePrincipal({
      verifier,
      scope: "generation:execute",
    });
    const { req, res, jsonCalls } = fakeReqRes({ header: "wrong-credential" });

    middleware(req, res, () => {
      throw new Error("next must not be called");
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(jsonCalls, [FORBIDDEN_RESPONSE]);
  });

  it("rejects a verified service principal missing the required scope", () => {
    const verifier = new FakeVerifier({
      credential: "svc-secret",
      actor: { kind: "service", service_id: "make", scopes: ["some:other:scope"] },
      throwOnMismatch: false,
    });
    const middleware = createRequireServicePrincipal({
      verifier,
      scope: "generation:execute",
    });
    const { req, res, jsonCalls } = fakeReqRes({ header: "svc-secret" });

    middleware(req, res, () => {
      throw new Error("next must not be called");
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(jsonCalls, [FORBIDDEN_RESPONSE]);
  });

  it("admits a verified service principal with the required scope and attaches it to the request", () => {
    const actor = Object.freeze({
      kind: "service",
      service_id: "make",
      scopes: ["generation:execute"],
    });
    const verifier = new FakeVerifier({ credential: "svc-secret", actor });
    const middleware = createRequireServicePrincipal({
      verifier,
      scope: "generation:execute",
    });
    const { req, res } = fakeReqRes({ header: "svc-secret" });
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.deepEqual(req.serviceActor, actor);
  });

  it("never authenticates using a customer bearer token or an admin key value", () => {
    const actor = Object.freeze({
      kind: "service",
      service_id: "make",
      scopes: ["generation:execute"],
    });
    const verifier = new FakeVerifier({ credential: "svc-secret", actor });
    const middleware = createRequireServicePrincipal({
      verifier,
      scope: "generation:execute",
    });

    for (const header of [
      "Bearer some.customer.jwt",
      "customer-admin-key-value",
    ]) {
      const { req, res, jsonCalls } = fakeReqRes({ header });
      middleware(req, res, () => {
        throw new Error("next must not be called");
      });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(jsonCalls, [FORBIDDEN_RESPONSE]);
    }
  });
});
