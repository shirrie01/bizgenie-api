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
  BootstrapWorkspaceSchema,
  CreateAdditionalWorkspaceSchema,
  SelectWorkspaceSchema,
  parseBootstrapWorkspaceRequest,
  parseCreateAdditionalWorkspaceRequest,
  parseSelectWorkspaceRequest,
  parseCustomerActor,
  parseCustomerBrandBrainCorrectionRequest,
};
