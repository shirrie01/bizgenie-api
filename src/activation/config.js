class ActivationConfigurationError extends Error {
  constructor(message = "Staging activation configuration is invalid") {
    super(message);
    this.name = "ActivationConfigurationError";
    this.code = "ACTIVATION_CONFIGURATION_INVALID";
  }
}

function activationFlag(env, name) {
  const value = env[name];
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new ActivationConfigurationError(`${name} must be true or false`);
}

function requireActivationEnvironment(env) {
  const environment = env.BIZGENIE_ENVIRONMENT;
  if (!new Set(["staging", "production"]).has(environment)) {
    throw new ActivationConfigurationError(
      "BIZGENIE_ENVIRONMENT must be staging or production"
    );
  }
  if (
    environment === "production" &&
    !activationFlag(env, "PRODUCTION_ACTIVATION_ENABLED")
  ) {
    throw new ActivationConfigurationError(
      "Production activation is disabled"
    );
  }
  return environment;
}

module.exports = {
  ActivationConfigurationError,
  activationFlag,
  requireActivationEnvironment,
};
