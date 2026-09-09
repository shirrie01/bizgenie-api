const { z } = require("zod");
const { AuthenticationRequiredError } = require("./errors");

const IDENTIFIER_MAX_LENGTH = 128;
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(IDENTIFIER_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid identifier");

const CustomerTrustedScopeSchema = z
  .object({
    tenant_id: identifier,
    project_id: identifier,
    brand_id: identifier,
  })
  .strict();

const CustomerActorSchema = z
  .object({
    kind: z.literal("customer"),
    auth_user_id: z.uuid(),
    trusted_scope: CustomerTrustedScopeSchema.optional(),
  })
  .strict();

const ServiceActorSchema = z
  .object({
    kind: z.literal("service"),
    service_id: identifier,
    scopes: z.array(identifier).max(20),
  })
  .strict();

const AdministratorActorSchema = z
  .object({
    kind: z.literal("administrator"),
  })
  .strict();

const ActorSchema = z.discriminatedUnion("kind", [
  CustomerActorSchema,
  ServiceActorSchema,
  AdministratorActorSchema,
]);

function createCustomerActorFromVerifiedIdentity({
  verifiedAuthUserId,
  verifiedScope,
} = {}) {
  const candidate = {
    kind: "customer",
    auth_user_id: verifiedAuthUserId,
  };
  if (verifiedScope) candidate.trusted_scope = verifiedScope;

  const parsed = CustomerActorSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AuthenticationRequiredError();
  }

  return Object.freeze(parsed.data);
}

module.exports = {
  ActorSchema,
  AdministratorActorSchema,
  CustomerActorSchema,
  CustomerTrustedScopeSchema,
  IDENTIFIER_MAX_LENGTH,
  ServiceActorSchema,
  createCustomerActorFromVerifiedIdentity,
};
