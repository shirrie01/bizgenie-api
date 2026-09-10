const { z } = require("zod");
const { CustomerActorSchema } = require("../authorization");
const { CustomerWorkspaceValidationError } = require("./errors");

const BootstrapWorkspaceSchema = z
  .object({
    business_name: z.string().trim().min(1).max(200).optional(),
    website_or_social_profile: z.string().trim().min(1).max(500).optional(),
    primary_marketing_challenge: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

function validationDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function parseBootstrapWorkspaceRequest(value) {
  const parsed = BootstrapWorkspaceSchema.safeParse(value || {});
  if (!parsed.success) {
    throw new CustomerWorkspaceValidationError(validationDetails(parsed.error));
  }
  return parsed.data;
}

function parseCustomerActor(actor) {
  const parsed = CustomerActorSchema.safeParse(actor);
  if (!parsed.success) {
    throw new CustomerWorkspaceValidationError(validationDetails(parsed.error));
  }
  return parsed.data;
}

module.exports = {
  BootstrapWorkspaceSchema,
  parseBootstrapWorkspaceRequest,
  parseCustomerActor,
};
