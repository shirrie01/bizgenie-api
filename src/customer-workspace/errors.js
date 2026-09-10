class CustomerWorkspaceValidationError extends Error {
  constructor(details = []) {
    super("Workspace setup request is invalid");
    this.name = "CustomerWorkspaceValidationError";
    this.code = "WORKSPACE_VALIDATION_ERROR";
    this.status = 400;
    this.details = details;
  }
}

class CustomerWorkspacePersistenceError extends Error {
  constructor() {
    super("Workspace setup is temporarily unavailable");
    this.name = "CustomerWorkspacePersistenceError";
    this.code = "WORKSPACE_PROVISIONING_UNAVAILABLE";
    this.status = 503;
  }
}

module.exports = {
  CustomerWorkspacePersistenceError,
  CustomerWorkspaceValidationError,
};
