const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  CustomerScopeProvisioningConfigurationError,
  CustomerScopeProvisioningError,
  createCustomerScopeProvisioner,
  createCustomerScopeProvisionerFromEnv,
  trustedAppMetadata,
  UnconfiguredCustomerScopeProvisioner,
} = require("../src/authentication");

const USER_A = "11111111-1111-4111-8111-111111111111";
const TRUSTED_SCOPE = Object.freeze({
  tenant_id: "tenant_a",
  project_id: "project_a",
  brand_id: "brand_a",
});

function adminClient({
  existingAppMetadata = { provider: "email", preserved_flag: true },
  getUserById = async (authUserId) => ({
    data: {
      user: {
        id: authUserId,
        app_metadata: existingAppMetadata,
      },
    },
    error: null,
  }),
  updateUserById = async () => ({ data: { user: { id: USER_A } }, error: null }),
} = {}) {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        admin: {
          async getUserById(...args) {
            calls.push(["getUserById", ...args]);
            return getUserById(...args);
          },
          async updateUserById(...args) {
            calls.push(["updateUserById", ...args]);
            return updateUserById(...args);
          },
        },
      },
    },
  };
}

describe("customer trusted scope provisioning", () => {
  it("merges trusted tenant/project/brand scope into existing app_metadata only", async () => {
    const { client, calls } = adminClient();
    const provisioner = createCustomerScopeProvisioner({ supabaseAdminClient: client });

    const result = await provisioner.provisionTrustedScope({
      auth_user_id: USER_A,
      trusted_scope: TRUSTED_SCOPE,
    });

    assert.deepEqual(result, {
      auth_user_id: USER_A,
      trusted_scope: TRUSTED_SCOPE,
      requires_session_refresh: true,
    });
    assert.deepEqual(calls, [
      ["getUserById", USER_A],
      [
        "updateUserById",
        USER_A,
        {
          app_metadata: {
            provider: "email",
            preserved_flag: true,
            tenant_id: "tenant_a",
            project_id: "project_a",
            brand_id: "brand_a",
          },
        },
      ],
    ]);
  });

  it("signals that existing customer JWTs must be refreshed before API use", async () => {
    const { client } = adminClient();
    const provisioner = createCustomerScopeProvisioner({ supabaseAdminClient: client });

    const result = await provisioner.provisionTrustedScope({
      auth_user_id: USER_A,
      trusted_scope: TRUSTED_SCOPE,
    });

    assert.equal(result.requires_session_refresh, true);
  });

  it("does not write user_metadata or accept client-supplied extra fields", async () => {
    const { client, calls } = adminClient();
    const provisioner = createCustomerScopeProvisioner({ supabaseAdminClient: client });

    await assert.rejects(
      provisioner.provisionTrustedScope({
        auth_user_id: USER_A,
        trusted_scope: TRUSTED_SCOPE,
        user_metadata: {
          tenant_id: "tenant_b",
          project_id: "project_b",
          brand_id: "brand_b",
        },
      }),
      CustomerScopeProvisioningError
    );

    assert.deepEqual(calls, []);
  });

  it("rejects incomplete or malformed trusted scope before calling Supabase", async () => {
    const { client, calls } = adminClient();
    const provisioner = createCustomerScopeProvisioner({ supabaseAdminClient: client });

    for (const request of [
      { auth_user_id: USER_A },
      {
        auth_user_id: USER_A,
        trusted_scope: { tenant_id: "tenant_a", project_id: "project_a" },
      },
      {
        auth_user_id: USER_A,
        trusted_scope: {
          tenant_id: "tenant a",
          project_id: "project_a",
          brand_id: "brand_a",
        },
      },
    ]) {
      await assert.rejects(
        provisioner.provisionTrustedScope(request),
        CustomerScopeProvisioningError
      );
    }

    assert.deepEqual(calls, []);
  });

  it("requires an injected Supabase Auth admin client", () => {
    for (const supabaseAdminClient of [undefined, {}, { auth: {} }, { auth: { admin: {} } }]) {
      assert.throws(
        () => createCustomerScopeProvisioner({ supabaseAdminClient }),
        CustomerScopeProvisioningConfigurationError
      );
    }
  });

  it("builds an admin client from server-only Supabase configuration", () => {
    let clientArguments;
    const provisioner = createCustomerScopeProvisionerFromEnv({
      env: {
        SUPABASE_URL: "https://bizgenie-test.supabase.co/",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
      createClientImpl(...args) {
        clientArguments = args;
        return adminClient().client;
      },
    });

    assert.deepEqual(clientArguments, [
      "https://bizgenie-test.supabase.co",
      "service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    ]);
    assert.equal(typeof provisioner.provisionTrustedScope, "function");
  });

  it("fails closed when trusted scope provisioning is unconfigured", async () => {
    const provisioner = createCustomerScopeProvisionerFromEnv({ env: {} });
    assert.ok(provisioner instanceof UnconfiguredCustomerScopeProvisioner);
    await assert.rejects(
      provisioner.provisionTrustedScope({
        auth_user_id: USER_A,
        trusted_scope: TRUSTED_SCOPE,
      }),
      CustomerScopeProvisioningError
    );
  });

  it("returns sanitized failures without leaking provider diagnostics", async () => {
    const { client } = adminClient({
      async updateUserById() {
        throw new Error("service role rejected raw provider details");
      },
    });
    const provisioner = createCustomerScopeProvisioner({ supabaseAdminClient: client });

    await assert.rejects(
      provisioner.provisionTrustedScope({
        auth_user_id: USER_A,
        trusted_scope: TRUSTED_SCOPE,
      }),
      (error) => {
        assert.ok(error instanceof CustomerScopeProvisioningError);
        assert.equal(error.code, "CUSTOMER_SCOPE_PROVISIONING_FAILED");
        assert.doesNotMatch(error.message, /service role|provider|raw/i);
        return true;
      }
    );
  });

  it("normalizes non-object existing app_metadata before writing trusted scope", () => {
    assert.deepEqual(trustedAppMetadata(null, TRUSTED_SCOPE), TRUSTED_SCOPE);
    assert.deepEqual(trustedAppMetadata(["bad"], TRUSTED_SCOPE), TRUSTED_SCOPE);
  });
});
