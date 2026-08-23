const { z } = require("zod");

const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const uuid = z.string().uuid();
const storageBucket = z.string().trim().min(3).max(222).regex(/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/);
const storageKey = z.string().trim().min(1).max(1024).regex(/^assets\/[a-f0-9]{64}\/[a-f0-9]{64}\/(image|video)\/[0-9a-f-]{36}\.[a-z0-9]+$/);
const mimeType = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const mediaReferenceRights = Object.freeze([
  "image.generate.reference",
  "video.generate.reference",
]);

const MediaAssetSchema = z.object({
  asset_id: uuid,
  tenant_id: identifier,
  project_id: identifier,
  generation_job_id: identifier.optional(),
  generation_id: identifier.optional(),
  source_kind: z.enum(["generated", "reference"]),
  media_kind: z.enum(["image", "video"]),
  storage_bucket: storageBucket,
  storage_key: storageKey,
  mime_type: mimeType,
  width: z.number().int().positive().max(50_000).optional(),
  height: z.number().int().positive().max(50_000).optional(),
  duration_seconds: z.number().positive().max(60).optional(),
  byte_size: z.number().int().positive().optional(),
  allowed_uses: z.array(z.enum(mediaReferenceRights)).max(mediaReferenceRights.length),
  status: z.enum(["active", "revoked", "deleted"]),
  created_at: z.string().datetime({ offset: true }),
}).strict().superRefine((asset, ctx) => {
  if (asset.source_kind === "generated" && (!asset.generation_job_id || !asset.generation_id)) {
    ctx.addIssue({ code: "custom", path: ["generation_job_id"], message: "Generated media requires immutable generation authority" });
  }
  if (asset.media_kind === "image" && !asset.mime_type.startsWith("image/")) {
    ctx.addIssue({ code: "custom", path: ["mime_type"], message: "Image media requires an image MIME type" });
  }
  if (asset.media_kind === "video" && asset.mime_type !== "video/mp4") {
    ctx.addIssue({ code: "custom", path: ["mime_type"], message: "Video media requires video/mp4" });
  }
});

module.exports = {
  MediaAssetSchema,
  identifier,
  mediaReferenceRights,
  mimeType,
  storageBucket,
  storageKey,
};
