class GenerationBillingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

class GenerationCreditsUnavailableError extends GenerationBillingError {
  constructor() {
    super(
      402,
      "GENERATION_CREDITS_UNAVAILABLE",
      "There are not enough credits to run this generation"
    );
  }
}

class GenerationBillingUnavailableError extends GenerationBillingError {
  constructor() {
    super(
      503,
      "GENERATION_BILLING_UNAVAILABLE",
      "Generation billing is temporarily unavailable"
    );
  }
}

class GenerationBillingAuthorityError extends GenerationBillingError {
  constructor() {
    super(
      503,
      "GENERATION_BILLING_UNAVAILABLE",
      "Generation billing is temporarily unavailable"
    );
  }
}

function responseBody(error, kind) {
  const body = {
    status: "failed",
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (kind === "script") body.script_body = "";
  if (kind === "image") body.media = null;
  if (kind === "video") body.video = null;
  return body;
}

function sendGenerationBillingError(error, res, { kind }) {
  if (!(error instanceof GenerationBillingError)) return false;
  res.status(error.status).json(responseBody(error, kind));
  return true;
}

module.exports = {
  GenerationBillingAuthorityError,
  GenerationBillingError,
  GenerationBillingUnavailableError,
  GenerationCreditsUnavailableError,
  sendGenerationBillingError,
};
