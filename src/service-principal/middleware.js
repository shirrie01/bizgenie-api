const SERVICE_CREDENTIAL_HEADER = "x-service-credential";

// Every denial reason (missing header, unknown credential, and insufficient
// scope) renders as this same fail-closed body. This mirrors the existing
// requireAdmin contract in index.js and deliberately does not enumerate
// which check failed.
const FORBIDDEN_RESPONSE = Object.freeze({ error: "Forbidden" });

function createRequireServicePrincipal({
  verifier,
  scope,
  logger = console,
}) {
  if (!verifier || typeof verifier.verifyCredential !== "function") {
    throw new TypeError(
      "requireServicePrincipal requires a service credential verifier"
    );
  }
  if (typeof scope !== "string" || !scope.trim()) {
    throw new TypeError(
      "requireServicePrincipal requires the scope this route needs"
    );
  }

  return function requireServicePrincipal(req, res, next) {
    try {
      const providedCredential = req.header(SERVICE_CREDENTIAL_HEADER);
      const actor = verifier.verifyCredential(providedCredential);

      if (!actor || actor.kind !== "service" || !actor.scopes.includes(scope)) {
        logger.warn?.("service principal denied", {
          path: req.path,
          required_scope: scope,
        });
        return res.status(403).json(FORBIDDEN_RESPONSE);
      }

      req.serviceActor = actor;
      return next();
    } catch {
      logger.warn?.("service principal denied", {
        path: req.path,
        required_scope: scope,
      });
      return res.status(403).json(FORBIDDEN_RESPONSE);
    }
  };
}

module.exports = {
  FORBIDDEN_RESPONSE,
  SERVICE_CREDENTIAL_HEADER,
  createRequireServicePrincipal,
};
