const { z } = require("zod");
const { OnboardingValidationError } = require("./errors");

// Mirrors the Premium Studio sector keys (BG-STUDIO-007/008-FE). "neutral" is the explicit no-sector layout.
const SECTOR_KEYS = Object.freeze(["leasing", "perfume", "aesthetics", "beverage", "charity", "takeaway", "neutral"]);
// Lower-case keys. Channels are preferences for planning only; none implies a connection or publishing right.
const CHANNEL_KEYS = Object.freeze(["instagram", "tiktok", "facebook", "linkedin", "email", "website"]);
const SOURCES = Object.freeze(["customer", "inferred"]);
// Names the platform or legacy clients generated when the customer gave none (G4).
const PLACEHOLDER_BRAND_NAMES = Object.freeze(["BizGenie Workspace", "Customer Campaign Workspace"]);
const MAX_STEP = 20;

const identifier = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const text = (max) => z.string().trim().min(1).max(max).nullable().optional();

const DraftSchema = z
  .object({
    business_name: text(200),
    website_or_social_profile: text(500),
    primary_marketing_challenge: text(1000),
    description: text(2000),
    audience_summary: text(2000),
    primary_cta: text(500),
    goal: text(2000),
  })
  .strict();

const SaveOnboardingSchema = z
  .object({
    idempotency_key: identifier,
    expected_version: z.number().int().min(0).max(1_000_000),
    sector_key: z.enum(SECTOR_KEYS).nullable().optional(),
    sector_source: z.enum(SOURCES).optional(),
    industry_text: text(200),
    channels: z.array(z.enum(CHANNEL_KEYS)).max(CHANNEL_KEYS.length).optional(),
    channels_source: z.enum(SOURCES).optional(),
    current_step: z.number().int().min(0).max(MAX_STEP).nullable().optional(),
    draft: DraftSchema.optional(),
    complete: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.channels && new Set(value.channels).size !== value.channels.length) {
      ctx.addIssue({ code: "custom", path: ["channels"], message: "Channels must be unique" });
    }
  });

function details(error) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message }));
}

function parseSaveOnboardingRequest(value) {
  const parsed = SaveOnboardingSchema.safeParse(value || {});
  if (!parsed.success) throw new OnboardingValidationError(details(parsed.error));
  return parsed.data;
}

module.exports = {
  CHANNEL_KEYS,
  DraftSchema,
  MAX_STEP,
  PLACEHOLDER_BRAND_NAMES,
  SECTOR_KEYS,
  SOURCES,
  SaveOnboardingSchema,
  parseSaveOnboardingRequest,
};
