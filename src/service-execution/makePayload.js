const { sanitizeExecutionInput } = require("../generation-jobs/executionInput");

// Builds exactly what may cross the Make boundary: an opaque job identity
// and a bounded execution payload. This function never receives, and could
// not forward even by accident, a customer JWT, ADMIN_KEY, provider secret,
// tenant/project/brand identity, or any billing authority — none of those
// are parameters, and job.job_id is the only identity value included.
function buildMakeExecutionPayload(job, executionContent = {}) {
  return Object.freeze({
    job_id: job.job_id,
    execution_class: job.execution_class,
    // Reapply the allow-list at the final boundary. Creation already stores
    // sanitized content, but a corrupted or legacy row must not be able to
    // smuggle authority or secrets into a downstream request.
    execution_input: Object.freeze(sanitizeExecutionInput(executionContent)),
  });
}

module.exports = { buildMakeExecutionPayload };
