const { createHash } = require("node:crypto");
const { z } = require("zod");

const consentText = {
  contact_text_sha256: "I agree that BizGenie may use these details to contact me about early access to BizGenie.",
  marketing_text_sha256: "I would also like occasional news about BizGenie. I can unsubscribe at any time. (Optional)",
};
const consentHashes = Object.fromEntries(Object.entries(consentText)
  .map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]));
const text = (max) => z.string().trim().min(1).max(max).refine((value) => !value.includes("\u0000"));
const campaign = z.string().min(1).max(64).regex(/^[a-z0-9._:-]+$/);
const priorities = z.array(z.enum([
  "brand_consistency", "faster_content", "campaign_planning", "publishing", "performance", "image_video",
])).max(6).refine((values) => new Set(values).size === values.length);

const Lead = z.strictObject({
  contract_version: z.literal("early-access-interest.v1"),
  submission_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  name: text(120),
  work_email: text(254).transform((value) => value.toLowerCase()).pipe(z.email()),
  business_name: text(160),
  industry: z.enum(["agency", "ecommerce", "professional_services", "hospitality", "product_brand", "other"]),
  intention: z.enum(["early_access", "founding_customer"]),
  marketing_priorities: priorities,
  notes: z.string().trim().max(500).refine((value) => !value.includes("\u0000")).default(""),
  privacy_contact_consent: z.literal(true),
  marketing_consent: z.boolean(),
  consent: z.strictObject({
    version: z.literal("early-access-contact-v1"),
    contact_text_sha256: z.literal(consentHashes.contact_text_sha256),
    marketing_text_sha256: z.literal(consentHashes.marketing_text_sha256),
    shown_at: z.iso.datetime({ offset: true }),
  }),
  source: z.strictObject({
    utm_source: campaign.optional(),
    utm_medium: campaign.optional(),
    utm_campaign: campaign.optional(),
    referrer_host: z.string().max(100).regex(/^[a-z0-9.\-]+$/i).optional(),
    landing_path: z.literal("/").optional(),
  }).default({}),
  client: z.strictObject({ elapsed_ms: z.number().int().min(0).max(86400000) }),
});

module.exports = { Lead, consentHashes };
