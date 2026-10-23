const { z } = require("zod");
const { CustomerActorSchema } = require("../authorization");
const { UpsertBrandBrainSchema } = require("../brand-brain/schema");
const { CustomerWorkspaceValidationError } = require("./errors");

const BootstrapWorkspaceSchema = z
  .object({
    business_name: z.string().trim().min(1).max(200).optional(),
    website_or_social_profile: z.string().trim().min(1).max(500).optional(),
    primary_marketing_challenge: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

const CreateAdditionalWorkspaceSchema = BootstrapWorkspaceSchema.extend({
  tenant_id: z.string().trim().min(1).max(200),
}).strict();

const SelectWorkspaceSchema = z
  .object({
    tenant_id: z.string().trim().min(1).max(200),
    project_id: z.string().trim().min(1).max(200),
    brand_id: z.string().trim().min(1).max(200),
  })
  .strict();

const CustomerBrandBrainCorrectionSchema = UpsertBrandBrainSchema
  .omit({ project_id: true })
  .extend({ project_id: z.string().optional() });

const channelPreferences = z.array(z.enum(["instagram", "tiktok", "facebook", "linkedin", "email", "website", "youtube", "other"]))
  .max(8).refine(items => new Set(items).size === items.length, "Duplicate channels are not allowed");
const draftText = max => z.string().trim().max(max).optional();
const OnboardingDraftSchema = z.object({
  workspace: SelectWorkspaceSchema.nullable(),
  step: z.enum(["welcome", "identity", "about", "customers", "channels", "brain", "recommendation"]),
  answers: z.object({ business_name: draftText(200), website_or_social_profile: draftText(500),
    primary_marketing_challenge: draftText(1000), sector_choice: draftText(200), industry_text: draftText(200),
    description: draftText(2000), audience: draftText(2000), primary_cta: draftText(2000), goal: draftText(2000),
    preferred_channels: channelPreferences.optional() }).strict(),
}).strict().refine(value => Buffer.byteLength(JSON.stringify(value), "utf8") <= 16000, "Draft exceeds storage limit");
const SaveOnboardingDraftSchema = z.object({ expected_version: z.number().int().min(0).max(2147483646),
  draft: OnboardingDraftSchema }).strict();

function validationDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function parseWith(schema, value) {
  const parsed = schema.safeParse(value || {});
  if (!parsed.success) {
    throw new CustomerWorkspaceValidationError(validationDetails(parsed.error));
  }
  return parsed.data;
}

function parseBootstrapWorkspaceRequest(value) {
  return parseWith(BootstrapWorkspaceSchema, value);
}

function parseCreateAdditionalWorkspaceRequest(value) {
  return parseWith(CreateAdditionalWorkspaceSchema, value);
}

function parseSelectWorkspaceRequest(value) {
  return parseWith(SelectWorkspaceSchema, value);
}

function parseCustomerActor(actor) {
  const parsed = CustomerActorSchema.safeParse(actor);
  if (!parsed.success) {
    throw new CustomerWorkspaceValidationError(validationDetails(parsed.error));
  }
  return parsed.data;
}

function parseCustomerBrandBrainCorrectionRequest(value) {
  return parseWith(CustomerBrandBrainCorrectionSchema, value);
}

module.exports = {
  OnboardingDraftSchema,
  SaveOnboardingDraftSchema,
  parseSaveOnboardingDraftRequest: value => parseWith(SaveOnboardingDraftSchema, value),
  BootstrapWorkspaceSchema,
  CreateAdditionalWorkspaceSchema,
  SelectWorkspaceSchema,
  parseBootstrapWorkspaceRequest,
  parseCreateAdditionalWorkspaceRequest,
  parseSelectWorkspaceRequest,
  parseCustomerActor,
  parseCustomerBrandBrainCorrectionRequest,
};
