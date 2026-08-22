const express = require("express");
const {
  FORBIDDEN_RESPONSE,
  createRequireServicePrincipal,
} = require("../service-principal");
const { buildMakeExecutionPayload } = require("./makePayload");

const DEFAULT_SCOPE = "generation:execute";

// This is the bounded seam a future Make/worker adapter may call. It is not
// an active dispatcher in BG-AUTH-002C. The verified service principal is a
// global BizGenie worker, not a tenant actor. Tenant/project/brand/customer
// authority is already fixed in the immutable job and cannot be supplied or
// replaced by service request data. The route accepts only that worker, the
// server-configured required scope, and an existing authorized job id; it
// returns nothing but the opaque job identity and bounded execution payload.
// No customer JWT, ADMIN_KEY, ownership identity, or billing authority is
// reachable through this router.
function createServiceExecutionRouter({
  jobRepository,
  servicePrincipalVerifier,
  requiredScope = DEFAULT_SCOPE,
  logger = console,
}) {
  if (!jobRepository) {
    throw new TypeError("A generation job repository is required");
  }
  if (!servicePrincipalVerifier) {
    throw new TypeError("A service principal verifier is required");
  }

  const router = express.Router();
  const requireServicePrincipal = createRequireServicePrincipal({
    verifier: servicePrincipalVerifier,
    scope: requiredScope,
    logger,
  });

  router.get(
    "/jobs/:job_id/execution-payload",
    requireServicePrincipal,
    async (req, res) => {
      try {
        const job = await jobRepository.getById(req.params.job_id);

        // A missing job and an out-of-scope job return the identical
        // denial as a wrong credential above: this boundary never
        // discloses whether a job id exists, only whether this exact
        // request is authorized end to end.
        if (
          !job ||
          !Array.isArray(job.allowed_scopes) ||
          !job.allowed_scopes.includes(requiredScope)
        ) {
          logger.warn?.("service execution denied", {
            required_scope: requiredScope,
          });
          return res.status(403).json(FORBIDDEN_RESPONSE);
        }

        const executionContent =
          (await jobRepository.getExecutionContent(job.job_id)) || {};

        return res
          .status(200)
          .json(buildMakeExecutionPayload(job, executionContent));
      } catch (error) {
        logger.error?.("service execution boundary error", {
          name: error?.name || "Error",
          code: error?.code || null,
        });
        return res.status(403).json(FORBIDDEN_RESPONSE);
      }
    }
  );

  return router;
}

module.exports = { DEFAULT_SCOPE, createServiceExecutionRouter };
