class AuthenticationRequiredError extends Error {
  constructor() {
    super("A verified customer identity is required");
    this.name = "AuthenticationRequiredError";
    this.status = 401;
    this.code = "AUTHENTICATION_REQUIRED";
  }
}

class AuthorizationDeniedError extends Error {
  constructor() {
    super("The requested resource is not available");
    this.name = "AuthorizationDeniedError";
    this.status = 404;
    this.code = "RESOURCE_NOT_AVAILABLE";
  }
}

module.exports = {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
};
