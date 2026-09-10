const { z } = require("zod");
const { createClient } = require("@supabase/supabase-js");
const { CustomerTrustedScopeSchema } = require("../authorization");
const { normalizedProjectUrl } = require("./tokenVerifier");

class CustomerScopeProvisioningConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CustomerScopeProvisioningConfigurationError";
    this.code = "CUSTOMER_SCOPE_PROVISIONING_CONFIGURATION_ERROR";
  }
}

class CustomerScopeProvisioningError extends Error {
  constructor(message = "Customer scope could not be provisioned") {
    super(message);
    this.name = "CustomerScopeProvisioningError";
    this.code = "CUSTOMER_SCOPE_PROVISIONING_FAILED";
  }
}

const CustomerScopeProvisioningRequestSchema = z
  .object({
    auth_user_id: z.uuid(),
    trusted_scope: CustomerTrustedScopeSchema,
  })
  .strict();

function resolveAuthAdmin(supabaseAdminClient) {
  const admin = supabaseAdminClient?.auth?.admin;
  if (
    !admin ||
    typeof admin.getUserById !== "function" ||
    typeof admin.updateUserById !== "function"
  ) {
    throw new CustomerScopeProvisioningConfigurationError(
      "A Supabase Auth admin client with getUserById and updateUserById is required"
    );
  }
  return admin;
}

function objectMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function trustedAppMetadata(existingAppMetadata, trustedScope) {
  return Object.freeze({
    ...objectMetadata(existingAppMetadata),
    tenant_id: trustedScope.tenant_id,
    project_id: trustedScope.project_id,
    brand_id: trustedScope.brand_id,
  });
}

class CustomerScopeProvisioner {
  constructor({ supabaseAdminClient }) {
    this.admin = resolveAuthAdmin(supabaseAdminClient);
  }

  async provisionTrustedScope(request) {
    const parsed = CustomerScopeProvisioningRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CustomerScopeProvisioningError();
    }

    const { auth_user_id, trusted_scope } = parsed.data;

    let existing;
    try {
      existing = await this.admin.getUserById(auth_user_id);
    } catch {
      throw new CustomerScopeProvisioningError();
    }

    if (existing?.error) {
      throw new CustomerScopeProvisioningError();
    }

    const appMetadata = trustedAppMetadata(
      existing?.data?.user?.app_metadata,
      trusted_scope
    );

    let updated;
    try {
      updated = await this.admin.updateUserById(auth_user_id, {
        app_metadata: appMetadata,
      });
    } catch {
      throw new CustomerScopeProvisioningError();
    }

    if (updated?.error) {
      throw new CustomerScopeProvisioningError();
    }

    return Object.freeze({
      auth_user_id,
      trusted_scope,
      requires_session_refresh: true,
    });
  }
}

class UnconfiguredCustomerScopeProvisioner {
  async provisionTrustedScope() {
    throw new CustomerScopeProvisioningError();
  }
}

function createCustomerScopeProvisioner({ supabaseAdminClient } = {}) {
  return new CustomerScopeProvisioner({ supabaseAdminClient });
}

function createCustomerScopeProvisionerFromEnv({
  env = process.env,
  createClientImpl = createClient,
} = {}) {
  const projectUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!projectUrl && !serviceRoleKey) {
    return new UnconfiguredCustomerScopeProvisioner();
  }
  if (!projectUrl || !serviceRoleKey) {
    throw new CustomerScopeProvisioningConfigurationError(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together for scope provisioning"
    );
  }

  const client = createClientImpl(normalizedProjectUrl(projectUrl), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return createCustomerScopeProvisioner({ supabaseAdminClient: client });
}

module.exports = {
  CustomerScopeProvisioningConfigurationError,
  CustomerScopeProvisioningError,
  CustomerScopeProvisioningRequestSchema,
  CustomerScopeProvisioner,
  UnconfiguredCustomerScopeProvisioner,
  createCustomerScopeProvisioner,
  createCustomerScopeProvisionerFromEnv,
  trustedAppMetadata,
};
