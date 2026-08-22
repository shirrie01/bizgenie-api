const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  ServicePrincipalConfigurationError,
  ServicePrincipalDeniedError,
  StaticServiceCredentialVerifier,
  UnconfiguredServiceCredentialVerifier,
  createServiceCredentialVerifierFromEnv,
} = require("../src/service-principal");
const { ServiceActorSchema } = require("../src/authorization");

const CREDENTIAL = "service-principal-credential-value-001";
const ADMIN_KEY = "admin-key-value-001";

function verifier(overrides = {}) {
  return new StaticServiceCredentialVerifier({
    serviceId: "make",
    credential: CREDENTIAL,
    scopes: ["generation:execute"],
    ...overrides,
  });
}

describe("StaticServiceCredentialVerifier", () => {
  it("verifies the exact configured credential and returns a frozen, bounded actor", () => {
    const actor = verifier().verifyCredential(CREDENTIAL);
    assert.deepEqual(actor, {
      kind: "service",
      service_id: "make",
      scopes: ["generation:execute"],
    });
    assert.equal(Object.isFrozen(actor), true);
    assert.equal(Object.isFrozen(actor.scopes), true);
    assert.throws(() => {
      actor.scopes.push("generation:admin");
    }, TypeError);
  });

  it("defines a global worker with no tenant, project, brand, or customer authority", () => {
    const actor = verifier().verifyCredential(CREDENTIAL);
    assert.deepEqual(Object.keys(actor).sort(), ["kind", "scopes", "service_id"]);

    for (const injectedAuthority of [
      { tenant_id: "tenant_a" },
      { project_id: "project_a" },
      { brand_id: "brand_a" },
      { auth_user_id: "11111111-1111-4111-8111-111111111111" },
      { execution_class: "text.standard" },
    ]) {
      assert.equal(
        ServiceActorSchema.safeParse({ ...actor, ...injectedAuthority }).success,
        false
      );
    }
  });

  it("rejects a wrong, empty, or non-string credential", () => {
    for (const bad of ["wrong", "", undefined, null, 12345]) {
      assert.throws(
        () => verifier().verifyCredential(bad),
        ServicePrincipalDeniedError
      );
    }
  });

  it("never accepts a customer bearer token or the ADMIN_KEY value as its own credential", () => {
    const instance = verifier();
    assert.throws(
      () => instance.verifyCredential("Bearer some.customer.jwt"),
      ServicePrincipalDeniedError
    );
    assert.throws(
      () => instance.verifyCredential(ADMIN_KEY),
      ServicePrincipalDeniedError
    );
  });

  it("requires a service_id, a credential of reasonable length, and at least one bounded scope", () => {
    assert.throws(
      () => verifier({ serviceId: "" }),
      ServicePrincipalConfigurationError
    );
    assert.throws(
      () => verifier({ credential: "short" }),
      ServicePrincipalConfigurationError
    );
    assert.throws(
      () => verifier({ scopes: [] }),
      ServicePrincipalConfigurationError
    );
    assert.throws(
      () => verifier({ scopes: Array.from({ length: 21 }, (_, i) => `scope_${i}`) }),
      ServicePrincipalConfigurationError
    );
  });
});

describe("UnconfiguredServiceCredentialVerifier", () => {
  it("fails closed for every credential when unconfigured", () => {
    const instance = new UnconfiguredServiceCredentialVerifier();
    for (const value of [CREDENTIAL, "", undefined, "anything"]) {
      assert.throws(
        () => instance.verifyCredential(value),
        ServicePrincipalDeniedError
      );
    }
  });
});

describe("createServiceCredentialVerifierFromEnv", () => {
  it("returns a fail-closed verifier when nothing is configured", () => {
    const instance = createServiceCredentialVerifierFromEnv({ env: {} });
    assert.ok(instance instanceof UnconfiguredServiceCredentialVerifier);
  });

  it("requires SERVICE_PRINCIPAL_ID, SERVICE_PRINCIPAL_CREDENTIAL, and SERVICE_PRINCIPAL_SCOPES together", () => {
    for (const env of [
      { SERVICE_PRINCIPAL_ID: "make" },
      { SERVICE_PRINCIPAL_CREDENTIAL: CREDENTIAL },
      { SERVICE_PRINCIPAL_SCOPES: "generation:execute" },
      { SERVICE_PRINCIPAL_ID: "make", SERVICE_PRINCIPAL_CREDENTIAL: CREDENTIAL },
    ]) {
      assert.throws(
        () => createServiceCredentialVerifierFromEnv({ env }),
        ServicePrincipalConfigurationError
      );
    }
  });

  it("builds a working verifier from complete configuration", () => {
    const instance = createServiceCredentialVerifierFromEnv({
      env: {
        SERVICE_PRINCIPAL_ID: "make",
        SERVICE_PRINCIPAL_CREDENTIAL: CREDENTIAL,
        SERVICE_PRINCIPAL_SCOPES: "generation:execute, generation:retry",
        ADMIN_KEY,
      },
    });
    const actor = instance.verifyCredential(CREDENTIAL);
    assert.deepEqual(actor.scopes, ["generation:execute", "generation:retry"]);
  });

  it("refuses to start if SERVICE_PRINCIPAL_CREDENTIAL equals ADMIN_KEY", () => {
    assert.throws(
      () =>
        createServiceCredentialVerifierFromEnv({
          env: {
            SERVICE_PRINCIPAL_ID: "make",
            SERVICE_PRINCIPAL_CREDENTIAL: ADMIN_KEY,
            SERVICE_PRINCIPAL_SCOPES: "generation:execute",
            ADMIN_KEY,
          },
        }),
      ServicePrincipalConfigurationError
    );
  });
});
