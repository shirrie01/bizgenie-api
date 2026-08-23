const { z } = require("zod");

const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");
const text = z.string().trim().min(1).max(2_000);
const context = z.string().trim().min(1).max(8_000);
const timestamp = z.string().datetime({ offset: true });
const location = z.string().trim().max(2_000).regex(/^(https?|gs|s3):\/\//i, "Invalid asset location");
const imageMimeType = z.enum(["image/jpeg", "image/png"]);
const videoMimeType = z.enum(["video/mp4"]);
const dimension = z.number().int().positive().max(50_000);

const videoGenerationStates = ["queued", "submitted", "processing", "completed", "failed"];
const videoApprovalStates = ["pending", "approved", "rejected"];
const videoQualityTiers = ["normal", "premium"];
const videoAspectRatios = ["16:9", "9:16"];
const videoDurations = [4, 6, 8];

const VideoInputImageSchema = z.object({
  asset_id: identifier,
  location: location.optional(),
  mime_type: imageMimeType.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
}).strict();

const ResolvedVideoInputImageSchema = z.object({
  asset_id: identifier,
  location: z.string().trim().max(2_000).regex(/^gs:\/\/[^/]+\/.+/i, "Invalid provider-readable asset location"),
  mime_type: imageMimeType,
  width: dimension.optional(),
  height: dimension.optional(),
}).strict();

const VideoGenerationRequestSchema = z.object({
  execution_id: identifier,
  generation_id: identifier,
  parent_generation_id: identifier.optional(),
  transaction_correlation_id: identifier.optional(),
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
  video_purpose: text,
  quality: z.enum(videoQualityTiers),
  aspect_ratio: z.enum(videoAspectRatios),
  duration_seconds: z.union(videoDurations.map((value) => z.literal(value))),
  additional_context: context.optional(),
  input_image: VideoInputImageSchema.optional(),
  reference_assets: z.array(VideoInputImageSchema).min(1).max(3).optional(),
}).strict().superRefine((request, ctx) => {
  if (request.parent_generation_id === request.generation_id) {
    ctx.addIssue({ code: "custom", path: ["parent_generation_id"], message: "A regeneration must use a new generation_id" });
  }
  if (request.input_image && request.reference_assets) {
    ctx.addIssue({ code: "custom", path: ["reference_assets"], message: "input_image and reference_assets cannot be combined" });
  }
  if (request.reference_assets && request.duration_seconds !== 8) {
    ctx.addIssue({ code: "custom", path: ["duration_seconds"], message: "Reference-image video generation requires an 8 second duration" });
  }
});

const NormalizedVideoAssetSourceSchema = z.object({
  location,
  mime_type: videoMimeType,
  width: dimension.optional(),
  height: dimension.optional(),
  duration_seconds: z.number().positive().max(60),
  container: z.literal("mp4"),
}).strict();

const NormalizedVideoAssetSchema = NormalizedVideoAssetSourceSchema.extend({
  asset_id: identifier.optional(),
  byte_size: z.number().int().positive().optional(),
}).strict();

const ProviderDiagnosticsSchema = z.object({
  filtered_count: z.number().int().nonnegative().optional(),
  request_id: z.string().trim().min(1).max(256).optional(),
}).strict();

const ProviderCostEvidenceSchema = z.object({
  provider_operation_id: z.string().trim().min(1).max(1_000),
  provider_model: z.string().trim().min(1).max(256),
  transaction_correlation_id: identifier.optional(),
}).strict();

const VideoProviderSubmissionSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  provider_job_id: z.string().trim().min(1).max(1_000),
  provider_model: z.string().trim().min(1).max(256),
  diagnostics: ProviderDiagnosticsSchema.optional(),
  cost_evidence: ProviderCostEvidenceSchema.optional(),
}).strict();

const VideoProviderPollSchema = z.object({
  provider: z.string().trim().min(1).max(100),
  provider_job_id: z.string().trim().min(1).max(1_000),
  provider_model: z.string().trim().min(1).max(256),
  status: z.enum(["processing", "completed", "failed"]),
  asset_source: NormalizedVideoAssetSourceSchema.optional(),
  error_code: z.literal("VIDEO_PROVIDER_FAILED").optional(),
  diagnostics: ProviderDiagnosticsSchema.optional(),
  cost_evidence: ProviderCostEvidenceSchema.optional(),
}).strict().superRefine((result, ctx) => {
  if (result.status === "completed" && !result.asset_source) {
    ctx.addIssue({ code: "custom", path: ["asset_source"], message: "asset_source is required for completed provider results" });
  }
  if (result.status !== "completed" && result.asset_source) {
    ctx.addIssue({ code: "custom", path: ["asset_source"], message: "asset_source is only allowed for completed provider results" });
  }
  if (result.status === "failed" && !result.error_code) {
    ctx.addIssue({ code: "custom", path: ["error_code"], message: "error_code is required for failed provider results" });
  }
});

const VideoGenerationRecordSchema = z.object({
  generation_id: identifier,
  parent_generation_id: identifier.optional(),
  transaction_correlation_id: identifier.optional(),
  execution_id: identifier,
  user_id: identifier,
  tenant_id: identifier.optional(),
  generation_job_id: identifier.optional(),
  project_id: identifier,
  brand_id: identifier.optional(),
  campaign_id: identifier.optional(),
  content_item_id: identifier.optional(),
  video_purpose: text,
  quality: z.enum(videoQualityTiers),
  aspect_ratio: z.enum(videoAspectRatios),
  duration_seconds: z.union(videoDurations.map((value) => z.literal(value))),
  status: z.enum(videoGenerationStates),
  approval_status: z.enum(videoApprovalStates).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  provider_job_id: z.string().trim().min(1).max(1_000).optional(),
  provider_model: z.string().trim().min(1).max(256).optional(),
  provider_diagnostics: ProviderDiagnosticsSchema.optional(),
  provider_cost_evidence: ProviderCostEvidenceSchema.optional(),
  asset: NormalizedVideoAssetSchema.optional(),
  error_code: z.string().trim().min(1).max(100).optional(),
  created_at: timestamp,
  updated_at: timestamp,
  completed_at: timestamp.optional(),
}).strict().superRefine((record, ctx) => {
  const providerFields = ["provider", "provider_job_id", "provider_model"];
  if (["submitted", "processing", "completed"].includes(record.status)) {
    for (const field of providerFields) if (!record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required while generation is ${record.status}` });
  }
  if (record.status === "queued") {
    for (const field of [...providerFields, "approval_status", "asset", "error_code", "completed_at"]) {
      if (record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is not allowed while generation is queued` });
    }
  }
  if (["submitted", "processing"].includes(record.status)) {
    for (const field of ["approval_status", "asset", "error_code", "completed_at"]) {
      if (record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is not allowed while generation is ${record.status}` });
    }
  }
  if (record.status === "completed") {
    for (const field of ["approval_status", "asset", "completed_at"]) if (!record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required for a completed generation` });
    if (record.error_code) ctx.addIssue({ code: "custom", path: ["error_code"], message: "error_code is not allowed for a completed generation" });
  }
  if (record.status === "failed") {
    for (const field of ["error_code", "completed_at"]) if (!record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required for a failed generation` });
    for (const field of ["approval_status", "asset"]) if (record[field]) ctx.addIssue({ code: "custom", path: [field], message: `${field} is not allowed for a failed generation` });
  }
});

module.exports = {
  NormalizedVideoAssetSchema,
  NormalizedVideoAssetSourceSchema,
  ProviderCostEvidenceSchema,
  ProviderDiagnosticsSchema,
  ResolvedVideoInputImageSchema,
  VideoGenerationRecordSchema,
  VideoGenerationRequestSchema,
  VideoInputImageSchema,
  VideoProviderPollSchema,
  VideoProviderSubmissionSchema,
  identifier,
  videoApprovalStates,
  videoAspectRatios,
  videoDurations,
  videoGenerationStates,
  videoQualityTiers,
};
