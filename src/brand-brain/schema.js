const { z } = require("zod");

const IDENTIFIER_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 200;
const PROSE_MAX_LENGTH = 2000;
const LIST_ITEM_MAX_LENGTH = 300;
const GOVERNANCE_ITEM_MAX_LENGTH = 200;
const LIST_MAX_ITEMS = 20;
const GOVERNANCE_MAX_ITEMS = 12;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(IDENTIFIER_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");
const name = z.string().trim().min(1).max(NAME_MAX_LENGTH);
const prose = z.string().trim().min(1).max(PROSE_MAX_LENGTH);
const listItem = z.string().trim().min(1).max(LIST_ITEM_MAX_LENGTH);
const governanceItem = z
  .string()
  .trim()
  .min(1)
  .max(GOVERNANCE_ITEM_MAX_LENGTH);
const list = z.array(listItem).max(LIST_MAX_ITEMS);
const governanceList = z
  .array(governanceItem)
  .max(GOVERNANCE_MAX_ITEMS);
const timestamp = z.string().datetime({ offset: true });

const brandBrainStatuses = ["draft", "approved", "archived"];

const IdentitySchema = z
  .object({
    description: prose.optional(),
    mission: prose.optional(),
    vision: prose.optional(),
    values: list.optional(),
    positioning: prose.optional(),
  })
  .strict();

const VoiceSchema = z
  .object({
    tone: prose.optional(),
    writing_style: prose.optional(),
    personality: prose.optional(),
    preferred_terms: list.optional(),
    prohibited_terms: governanceList.optional(),
  })
  .strict();

const AudienceSchema = z
  .object({
    summary: prose.optional(),
    pain_points: list.optional(),
    goals: list.optional(),
    objections: list.optional(),
    buying_triggers: list.optional(),
  })
  .strict();

const CommercialSchema = z
  .object({
    differentiators: list.optional(),
    primary_cta: prose.optional(),
    approved_claims: governanceList.optional(),
    prohibited_claims: governanceList.optional(),
  })
  .strict();

const CompetitorsSchema = z
  .object({
    names: list.optional(),
    notes: prose.optional(),
  })
  .strict();

const VisualSchema = z
  .object({
    colours: list.optional(),
    fonts: list.optional(),
    photography_style: prose.optional(),
  })
  .strict();

const MetadataSchema = z
  .object({
    version: z.number().int().positive().max(1_000_000),
    status: z.enum(brandBrainStatuses),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .strict();

const BrandBrainSchema = z
  .object({
    brand_id: identifier,
    project_id: identifier,
    name,
    identity: IdentitySchema.optional(),
    voice: VoiceSchema.optional(),
    audience: AudienceSchema.optional(),
    commercial: CommercialSchema.optional(),
    competitors: CompetitorsSchema.optional(),
    visual: VisualSchema.optional(),
    metadata: MetadataSchema,
  })
  .strict();

const UpsertBrandBrainSchema = BrandBrainSchema.extend({
  brand_id: identifier.optional(),
  metadata: MetadataSchema.partial().strict().optional(),
});

module.exports = {
  AudienceSchema,
  BrandBrainSchema,
  CommercialSchema,
  CompetitorsSchema,
  GOVERNANCE_ITEM_MAX_LENGTH,
  GOVERNANCE_MAX_ITEMS,
  IDENTIFIER_MAX_LENGTH,
  IdentitySchema,
  LIST_ITEM_MAX_LENGTH,
  LIST_MAX_ITEMS,
  MetadataSchema,
  NAME_MAX_LENGTH,
  PROSE_MAX_LENGTH,
  UpsertBrandBrainSchema,
  VisualSchema,
  VoiceSchema,
  brandBrainStatuses,
};
