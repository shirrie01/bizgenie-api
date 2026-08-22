class GenerationJobConflictError extends Error {
  constructor() {
    super(
      "An existing generation job with this idempotency key has different ownership"
    );
    this.name = "GenerationJobConflictError";
    this.status = 409;
    this.code = "GENERATION_JOB_CONFLICT";
  }
}

class GenerationJobNotFoundError extends Error {
  constructor() {
    super("The requested generation job is not available");
    this.name = "GenerationJobNotFoundError";
    this.status = 404;
    this.code = "GENERATION_JOB_NOT_FOUND";
  }
}

module.exports = {
  GenerationJobConflictError,
  GenerationJobNotFoundError,
};
