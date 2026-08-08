const express = require("express");
const { BrandBrainSchema, UpsertBrandBrainSchema } = require("./schema");
const {
  BrandBrainNotFoundError,
  BrandBrainValidationError,
  formatZodIssues,
  sendBrandBrainError,
} = require("./errors");

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BrandBrainValidationError(formatZodIssues(result.error.issues));
  }
  return result.data;
}

function createBrandBrainRouter({ repository, now = () => new Date() }) {
  if (!repository) {
    throw new Error("A Brand Brain repository is required");
  }

  const router = express.Router();

  router.put("/:brandId", async (req, res, next) => {
    try {
      const input = parse(UpsertBrandBrainSchema, req.body);
      if (input.brand_id && input.brand_id !== req.params.brandId) {
        throw new BrandBrainValidationError([
          {
            path: "brand_id",
            code: "custom",
            message: "brand_id must match the brandId route parameter",
          },
        ]);
      }

      const existing = await repository.getByBrandId(req.params.brandId);
      const timestamp = now().toISOString();
      const record = parse(BrandBrainSchema, {
        ...input,
        brand_id: req.params.brandId,
        metadata: {
          version: input.metadata?.version ?? existing?.metadata.version ?? 1,
          status:
            input.metadata?.status ?? existing?.metadata.status ?? "approved",
          created_at:
            existing?.metadata.created_at ??
            input.metadata?.created_at ??
            timestamp,
          updated_at: input.metadata?.updated_at ?? timestamp,
        },
      });

      return res.json({ brand_brain: await repository.upsert(record) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:brandId", async (req, res, next) => {
    try {
      const record = await repository.getByBrandId(req.params.brandId);
      if (!record) {
        throw new BrandBrainNotFoundError(req.params.brandId);
      }
      return res.json({ brand_brain: record });
    } catch (error) {
      return next(error);
    }
  });

  router.use((error, _req, res, next) => {
    if (sendBrandBrainError(error, res)) {
      return;
    }
    next(error);
  });

  return router;
}

module.exports = {
  createBrandBrainRouter,
};
