class MissionControlError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends MissionControlError {
  constructor(details) {
    super(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
}

class ReviewNotFoundError extends MissionControlError {
  constructor(reviewId) {
    super(404, "REVIEW_NOT_FOUND", `Review '${reviewId}' was not found`);
  }
}

class DuplicateIdError extends MissionControlError {
  constructor(resource, id) {
    super(409, "DUPLICATE_ID", `${resource} '${id}' already exists`);
  }
}

function formatZodIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function sendMissionControlError(error, res) {
  if (!(error instanceof MissionControlError)) {
    return false;
  }

  const body = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details) {
    body.error.details = error.details;
  }

  res.status(error.status).json(body);
  return true;
}

module.exports = {
  DuplicateIdError,
  MissionControlError,
  ReviewNotFoundError,
  ValidationError,
  formatZodIssues,
  sendMissionControlError,
};
