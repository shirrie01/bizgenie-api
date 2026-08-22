class ServicePrincipalConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ServicePrincipalConfigurationError";
    this.code = "SERVICE_PRINCIPAL_CONFIGURATION_ERROR";
  }
}

// A single fail-closed denial for every service-boundary failure mode
// (missing credential, wrong credential, unknown scope, missing job, or
// out-of-scope job). The boundary intentionally does not distinguish these
// cases in its response so it cannot be used to enumerate valid job ids,
// scopes, or credentials.
class ServicePrincipalDeniedError extends Error {
  constructor() {
    super("The service execution boundary denied this request");
    this.name = "ServicePrincipalDeniedError";
    this.status = 403;
    this.code = "SERVICE_PRINCIPAL_FORBIDDEN";
  }
}

module.exports = {
  ServicePrincipalConfigurationError,
  ServicePrincipalDeniedError,
};
