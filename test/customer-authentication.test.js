const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  AuthenticationRequiredError,
} = require("../src/authorization");
const {
  CustomerAuthenticationConfigurationError,
  SupabaseCustomerTokenVerifier,
  UnconfiguredCustomerTokenVerifier,
  createSupabaseCustomerTokenVerifierFromEnv,
  extractBearerToken,
} = require("../src/authentication");

const PROJECT_URL = "https://bizgenie-test.supabase.co";
const USER_A = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-19T12:00:00.000Z");

function verifiedClaims(overrides = {}) {
  return {
    iss: `${PROJECT_URL}/auth/v1`,
    sub: USER_A,
    aud: "authenticated",
    exp: Math.floor(NOW.getTime() / 1000) + 300,
    iat: Math.floor(NOW.getTime() / 1000) - 60,
    role: "authenticated",
    ...overrides,
  };
}

function verifierWith(getClaims) {
  return new SupabaseCustomerTokenVerifier({
    supabaseClient: { auth: { getClaims } },
    projectUrl: PROJECT_URL,
    now: () => NOW,
  });
}

describe("Supabase customer token verification", () => {
  it("creates the canonical customer actor only after getClaims verifies the token", async () => {
    const calls = [];
    const verifier = verifierWith(async (token) => {
      calls.push(token);
      return { data: { claims: verifiedClaims() }, error: null };
    });

    const actor = await verifier.verifyAccessToken("signed-token-a");

    assert.deepEqual(calls, ["signed-token-a"]);
    assert.deepEqual(actor, {
      kind: "customer",
      auth_user_id: USER_A,
    });
    assert.equal(Object.isFrozen(actor), true);
  });

  it("rejects malformed and invalid-signature tokens with one sanitized error", async () => {
    for (const getClaims of [
      async () => ({ data: null, error: new Error("invalid JWT signature") }),
      async () => {
        throw new Error("provider diagnostics for malformed token");
      },
    ]) {
      const verifier = verifierWith(getClaims);
      await assert.rejects(
        verifier.verifyAccessToken("raw.jwt.value"),
        (error) => {
          assert.ok(error instanceof AuthenticationRequiredError);
          assert.equal(error.code, "AUTHENTICATION_REQUIRED");
          assert.doesNotMatch(error.message, /jwt|signature|provider/i);
          assert.doesNotMatch(JSON.stringify(error), /raw\.jwt\.value/);
          return true;
        }
      );
    }
  });

  it("rejects expired tokens even if a verifier dependency returns claims", async () => {
    const verifier = verifierWith(async () => ({
      data: {
        claims: verifiedClaims({
          exp: Math.floor(NOW.getTime() / 1000),
        }),
      },
      error: null,
    }));

    await assert.rejects(
      verifier.verifyAccessToken("expired-token"),
      AuthenticationRequiredError
    );
  });

  it("rejects wrong-project, wrong-audience, and invalid-subject claims", async () => {
    for (const overrides of [
      { iss: "https://other-project.supabase.co/auth/v1" },
      { aud: "service_role" },
      { sub: "request-body-user" },
    ]) {
      const verifier = verifierWith(async () => ({
        data: { claims: verifiedClaims(overrides) },
        error: null,
      }));
      await assert.rejects(
        verifier.verifyAccessToken("invalid-claims-token"),
        AuthenticationRequiredError
      );
    }
  });

  it("strictly extracts a single Bearer token", () => {
    assert.equal(extractBearerToken("Bearer one.token.value"), "one.token.value");
    assert.equal(extractBearerToken("bearer token-a"), "token-a");

    for (const header of [
      undefined,
      "",
      "Basic credentials",
      "Bearer",
      "Bearer token-a token-b",
      "Bearer token-a,token-b",
    ]) {
      assert.throws(() => extractBearerToken(header), AuthenticationRequiredError);
    }
  });
});

describe("Supabase verifier configuration", () => {
  it("builds a non-persistent server client from publishable configuration", async () => {
    let clientArguments;
    const verifier = createSupabaseCustomerTokenVerifierFromEnv({
      env: {
        SUPABASE_URL: `${PROJECT_URL}/`,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      createClientImpl(...args) {
        clientArguments = args;
        return {
          auth: {
            async getClaims() {
              return { data: { claims: verifiedClaims() }, error: null };
            },
          },
        };
      },
      now: () => NOW,
    });

    assert.deepEqual(clientArguments, [
      PROJECT_URL,
      "sb_publishable_test",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    ]);
    assert.equal(
      (await verifier.verifyAccessToken("signed-token-a")).auth_user_id,
      USER_A
    );
  });

  it("fails closed when unconfigured and rejects partial or insecure configuration", async () => {
    const unconfigured = createSupabaseCustomerTokenVerifierFromEnv({ env: {} });
    assert.ok(unconfigured instanceof UnconfiguredCustomerTokenVerifier);
    await assert.rejects(
      unconfigured.verifyAccessToken("anything"),
      AuthenticationRequiredError
    );

    for (const env of [
      { SUPABASE_URL: PROJECT_URL },
      { SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" },
      {
        SUPABASE_URL: "http://insecure.example",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
    ]) {
      assert.throws(
        () => createSupabaseCustomerTokenVerifierFromEnv({ env }),
        CustomerAuthenticationConfigurationError
      );
    }
  });
});
