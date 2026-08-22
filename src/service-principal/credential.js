const { createHash, timingSafeEqual } = require("node:crypto");
const { ServiceActorSchema } = require("../authorization");
const {
  ServicePrincipalConfigurationError,
  ServicePrincipalDeniedError,
} = require("./errors");

const MAX_SCOPES = 20;

function denied() {
  return new ServicePrincipalDeniedError();
}

// Compares two secrets in constant time regardless of their length by
// comparing fixed-length digests instead of the raw values. This avoids
// leaking credential length through timing while still being safe for
// arbitrary-length operator-configured secrets.
function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) {
    return false;
  }
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

class ServiceCredentialVerifier {
  // eslint-disable-next-line class-methods-use-this
  verifyCredential(_providedCredential) {
    throw new Error(
      "ServiceCredentialVerifier.verifyCredential is not implemented"
    );
  }
}

// Fail-closed default used whenever no service principal has been
// configured. Every credential is rejected; this mirrors
// UnconfiguredCustomerTokenVerifier and UnconfiguredImageGenerationProvider
// elsewhere in this codebase.
class UnconfiguredServiceCredentialVerifier extends ServiceCredentialVerifier {
  // eslint-disable-next-line class-methods-use-this
  verifyCredential() {
    throw denied();
  }
}

// Verifies a single, narrowly scoped service principal read directly from
// server configuration. This is intentionally independent of ADMIN_KEY and
// of customer JWT verification: it has its own secret, its own identifier,
// and its own bounded scope set, so neither of the other two credentials can
// ever satisfy it and it can never satisfy either of them.
class StaticServiceCredentialVerifier extends ServiceCredentialVerifier {
  constructor({ serviceId, credential, scopes }) {
    super();
    if (typeof serviceId !== "string" || !serviceId.trim()) {
      throw new ServicePrincipalConfigurationError(
        "A service_id is required to configure a service principal"
      );
    }
    if (typeof credential !== "string" || credential.trim().length < 16) {
      throw new ServicePrincipalConfigurationError(
        "SERVICE_PRINCIPAL_CREDENTIAL must be configured with a value of at least 16 characters"
      );
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new ServicePrincipalConfigurationError(
        "At least one bounded scope is required to configure a service principal"
      );
    }
    if (scopes.length > MAX_SCOPES) {
      throw new ServicePrincipalConfigurationError(
        `A service principal may not be configured with more than ${MAX_SCOPES} scopes`
      );
    }

    // Freezing the actor shape at construction time means the verifier can
    // only ever return this exact, already-validated identity: nothing about
    // a request can change service_id or widen scopes at verification time.
    const parsedActor = ServiceActorSchema.safeParse({
      kind: "service",
      service_id: serviceId,
      scopes,
    });
    if (!parsedActor.success) {
      throw new ServicePrincipalConfigurationError(
        "The configured service principal does not satisfy the service actor contract"
      );
    }

    this.credential = credential;
    this.actor = Object.freeze({
      ...parsedActor.data,
      scopes: Object.freeze([...parsedActor.data.scopes]),
    });
  }

  // eslint-disable-next-line class-methods-use-this
  verifyCredential(providedCredential) {
    if (typeof providedCredential !== "string" || !providedCredential) {
      throw denied();
    }
    if (!constantTimeEquals(providedCredential, this.credential)) {
      throw denied();
    }
    return this.actor;
  }
}

function parseScopesFromEnvValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

// Builds the service principal verifier strictly from server
// environment/secrets, never from a request. Returns a fail-closed verifier
// when unconfigured so startup and existing behavior are unaffected until an
// operator deliberately configures the service boundary.
//
// Hard separation from ADMIN_KEY: if SERVICE_PRINCIPAL_CREDENTIAL is ever
// configured to the same value as ADMIN_KEY, construction fails closed
// instead of silently allowing ADMIN_KEY to authenticate as the service
// principal.
function createServiceCredentialVerifierFromEnv({ env = process.env } = {}) {
  const serviceId = env.SERVICE_PRINCIPAL_ID;
  const credential = env.SERVICE_PRINCIPAL_CREDENTIAL;
  const scopes = parseScopesFromEnvValue(env.SERVICE_PRINCIPAL_SCOPES);

  if (!serviceId && !credential && scopes.length === 0) {
    return new UnconfiguredServiceCredentialVerifier();
  }
  if (!serviceId || !credential || scopes.length === 0) {
    throw new ServicePrincipalConfigurationError(
      "SERVICE_PRINCIPAL_ID, SERVICE_PRINCIPAL_CREDENTIAL, and SERVICE_PRINCIPAL_SCOPES must be configured together"
    );
  }
  if (
    typeof env.ADMIN_KEY === "string" &&
    env.ADMIN_KEY &&
    constantTimeEquals(env.ADMIN_KEY, credential)
  ) {
    throw new ServicePrincipalConfigurationError(
      "SERVICE_PRINCIPAL_CREDENTIAL must not equal ADMIN_KEY"
    );
  }

  return new StaticServiceCredentialVerifier({ serviceId, credential, scopes });
}

module.exports = {
  ServiceCredentialVerifier,
  StaticServiceCredentialVerifier,
  UnconfiguredServiceCredentialVerifier,
  constantTimeEquals,
  createServiceCredentialVerifierFromEnv,
};
