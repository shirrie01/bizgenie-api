const express = require("express");
const { z } = require("zod");
const { CustomerReferenceImageService, DEFAULT_MAX_CUSTOMER_IMAGE_BYTES } = require("./customerReferenceImageService");

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const scope = z.object({ tenant_id: identifier, project_id: identifier, brand_id: identifier }).strict();
const MAX_REQUEST_BYTES = DEFAULT_MAX_CUSTOMER_IMAGE_BYTES;

/**
 * Fail-closed customer image reference router.
 *
 * Intentionally NOT mounted in index.js until production has an independently
 * verified scanner and image decoder. This avoids an unsafe upload feature.
 * verifyBrandScope must construct authority from the verified access token and
 * approved project/brand write policy, never from client-controlled flags.
 */
function createCustomerReferenceImageRouter({ tokenVerifier, authorizationService, repository, storage, scanImage }) {
  if (!tokenVerifier?.verifyAccessToken || !authorizationService?.authorizeProjectBrand || !repository || !storage || typeof scanImage !== "function") {
    throw new TypeError("Customer reference router requires authentication, brand policy, storage and scanner");
  }
  const ingestion = new CustomerReferenceImageService({ repository, storage, scanImage });
  const router = express.Router();

  router.post("/images", express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: MAX_REQUEST_BYTES,
    inflate: false,
  }), async (req, res) => {
    try {
      const parsed = scope.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: { code: "INVALID_SCOPE" } });
      const tokenMatch = req.header("authorization")?.match(/^Bearer ([^\s,]+)$/i);
      if (!tokenMatch) return res.status(401).json({ error: { code: "AUTHENTICATION_REQUIRED" } });
      const actor = await tokenVerifier.verifyAccessToken(tokenMatch[1]);
      const { tenant_id, project_id, brand_id } = parsed.data;
      const granted = await authorizationService.authorizeProjectBrand({
        actor, tenantId: tenant_id, projectId: project_id, brandId: brand_id,
        action: "project:write", requireApprovedBrand: true,
      });
      if (!granted || granted.tenant_id !== tenant_id || granted.project_id !== project_id) {
        return res.status(404).json({ error: { code: "RESOURCE_NOT_AVAILABLE" } });
      }
      if (!Buffer.isBuffer(req.body)) return res.status(415).json({ error: { code: "UNSUPPORTED_MEDIA_TYPE" } });
      const mimeType = req.header("content-type")?.split(";")[0].trim().toLowerCase();
      const result = await ingestion.ingest({
        authority: { verified: true, tenant_id, project_id, brand_id },
        data: req.body, mimeType,
      });
      return res.status(201).json({ asset: result });
    } catch {
      return res.status(404).json({ error: { code: "RESOURCE_NOT_AVAILABLE" } });
    }
  });
  return router;
}

module.exports = { createCustomerReferenceImageRouter };
