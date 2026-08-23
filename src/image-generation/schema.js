const { z } = require("zod");

const IDENTIFIER_MAX_LENGTH = 128;
const TEXT_MAX_LENGTH = 2_000;
const CONTEXT_MAX_LENGTH = 8_000;
const MAX_REFERENCE_ASSETS = 5;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(IDENTIFIER_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");
const text = z.string().trim().min(1).max(TEXT_MAX_LENGTH);
const context = z.string().trim().min(1).max(CONTEXT_MAX_LENGTH);
const assetLocation = z
  .string()
  .trim()
  .max(2_000)
  .regex(/^(https?|gs|s3):\/\//i, "Invalid asset location");
const mimeType = z
  .string()
  .trim()
  .max(100)
  .regex(/^image\/[A-Za-z0-9.+-]+$/, "Invalid image MIME type");
const dimension = z.number().int().positive().max(50_000);
const timestamp = z.string().datetime({ offset: true });

const imageGenerationStates = ["queued", "processing", "completed", "failed"];
const imageApprovalStates = ["pending", "approved", "rejected"];
const imageAspectRatios = ["1:1", "4:5", "9:16", "16:9"];

const ReferenceAssetSchema = z
  .object({
    asset_id: identifier,
    // Kept optional for backwards-compatible parsing only. The service never
    // forwards a customer-supplied location; providers resolve the durable
    // asset_id through the rights-aware server-side loader.
    location: assetLocation.optional(),
    mime_type: mimeType.optional(),
    width: dimension.optional(),
    height: dimension.optional(),
  })
  .strict();

const ImageGenerationRequestSchema = z
  .object({
    execution_id: identifier,
    generation_id: identifier,
    parent_generation_id: identifier.optional(),
    user_id: identifier,
    project_id: identifier,
    brand_id: identifier.optional(),
    campaign_id: identifier.optional(),
    content_item_id: identifier.optional(),
    topic: text,
    platform: text.optional(),
    audience: text.optional(),
    goal: text.optional(),
    intent_stage: text.optional(),
    product_service_context: context.optional(),
    image_purpose: text,
    aspect_ratio: z.enum(imageAspectRatios),
    additional_context: context.optional(),
    reference_assets: z
      .array(ReferenceAssetSchema)
      .max(MAX_REFERENCE_ASSETS)
      .optional(),
  })
  .strict();

const NormalizedImageAssetSchema = z
  .object({
    asset_id: identifier.optional(),
    location: assetLocation,
    mime_type: mimeType,
    width: dimension.optional(),
    height: dimension.optional(),
  })
  .strict();

const NormalizedImageProviderResultSchema = z
  .object({
    provider: z.string().trim().min(1).max(100),
    provider_job_id: z.string().trim().min(1).max(256),
    asset: NormalizedImageAssetSchema,
  })
  .strict();

const ImageGenerationRecordSchema = z
  .object({
    generation_id: identifier,
    parent_generation_id: identifier.optional(),
    execution_id: identifier,
    user_id: identifier,
    tenant_id: identifier.optional(),
    generation_job_id: identifier.optional(),
    project_id: identifier,
    brand_id: identifier.optional(),
    campaign_id: identifier.optional(),
    content_item_id: identifier.optional(),
    image_purpose: text,
    aspect_ratio: z.enum(imageAspectRatios),
    status: z.enum(imageGenerationStates),
    approval_status: z.enum(imageApprovalStates).optional(),
    provider: z.string().trim().min(1).max(100).optional(),
    provider_job_id: z.string().trim().min(1).max(256).optional(),
    asset: NormalizedImageAssetSchema.optional(),
    error_code: z.string().trim().min(1).max(100).optional(),
    created_at: timestamp,
    updated_at: timestamp,
    completed_at: timestamp.optional(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.status === "completed") {
      for (const field of [
        "approval_status",
        "provider",
        "provider_job_id",
        "asset",
        "completed_at",
      ]) {
        if (!record[field]) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required for a completed generation`,
          });
        }
      }
      if (record.error_code) {
        ctx.addIssue({
          code: "custom",
          path: ["error_code"],
          message: "error_code is not allowed for a completed generation",
        });
      }
    }

    if (record.status === "failed") {
      for (const field of ["error_code", "completed_at"]) {
        if (!record[field]) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is required for a failed generation`,
          });
        }
      }
      for (const field of ["approval_status", "asset"]) {
        if (record[field]) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is not allowed for a failed generation`,
          });
        }
      }
    }

    if (["queued", "processing"].includes(record.status)) {
      for (const field of [
        "approval_status",
        "provider_job_id",
        "asset",
        "error_code",
        "completed_at",
      ]) {
        if (record[field]) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `${field} is not allowed while generation is ${record.status}`,
          });
        }
      }
    }
  });

module.exports = {
  CONTEXT_MAX_LENGTH,
  IDENTIFIER_MAX_LENGTH,
  ImageGenerationRecordSchema,
  ImageGenerationRequestSchema,
  MAX_REFERENCE_ASSETS,
  NormalizedImageAssetSchema,
  NormalizedImageProviderResultSchema,
  ReferenceAssetSchema,
  TEXT_MAX_LENGTH,
  imageApprovalStates,
  imageAspectRatios,
  imageGenerationStates,
};
