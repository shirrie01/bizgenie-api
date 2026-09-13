const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { PostgresCampaignRepository } = require("../src/campaigns/postgresRepository");
const { CampaignPersistenceError } = require("../src/campaigns/errors");

const context = {
  actor: { kind: "customer", auth_user_id: "11111111-1111-4111-8111-111111111111" },
  tenant_id: "tenant_a",
  project_id: "project_a",
  membership_role: "owner",
  policy_version: "campaign-owner.v1",
};

const command = {
  contract_version: "campaign-spine.v1",
  idempotency_key: "diagnostic_test",
  expected_campaign_version: 0,
  command_type: "create_campaign",
  tenant_id: "tenant_a",
  project_id: "project_a",
  payload: {
    brand_id: "brand_a",
    name: "Diagnostic campaign",
    goal: "Verify safe logging",
    display_timezone: "Europe/London",
  },
};

describe("campaign persistence diagnostics", () => {
  it("logs only safe bounded metadata and preserves the generic persistence error", async () => {
    const raw = Object.assign(new Error("constraint failed Bearer secret-token service_role_key=super-secret"), {
      code: "23514",
      constraint: "campaign_commit",
      schema: "public",
      table: "campaign_content_items",
      routine: "exec_stmt_raise",
      detail: "SECRET_DETAIL_VALUE",
      where: "SECRET_WHERE_VALUE",
      query: "select SECRET_QUERY_VALUE",
      parameters: ["SECRET_PARAMETER_VALUE"],
    });
    const logs = [];
    const repository = new PostgresCampaignRepository({
      pool: { connect: async () => { throw raw; } },
      logger: { error: (...args) => logs.push(args) },
    });

    await assert.rejects(
      () => repository.executeCommand(context, command),
      (error) => {
        assert.ok(error instanceof CampaignPersistenceError);
        assert.equal(error.code, "CAMPAIGN_TEMPORARILY_UNAVAILABLE");
        assert.equal(error.message, "Campaign state is temporarily unavailable");
        return true;
      },
    );

    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "campaign persistence failed");
    assert.deepEqual(Object.keys(logs[0][1]), [
      "stage", "command_type", "pg_code", "constraint", "schema", "table", "routine", "message",
    ]);
    assert.equal(logs[0][1].stage, "connect");
    assert.equal(logs[0][1].command_type, "create_campaign");
    assert.equal(logs[0][1].pg_code, "23514");
    assert.equal(logs[0][1].constraint, "campaign_commit");
    assert.equal(logs[0][1].schema, "public");
    assert.equal(logs[0][1].table, "campaign_content_items");
    assert.equal(logs[0][1].routine, "exec_stmt_raise");
    assert.match(logs[0][1].message, /Bearer \[REDACTED\]/);
    assert.match(logs[0][1].message, /service_role_key=\[REDACTED\]/);

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      "secret-token", "super-secret", "SECRET_DETAIL_VALUE", "SECRET_WHERE_VALUE",
      "SECRET_QUERY_VALUE", "SECRET_PARAMETER_VALUE",
    ]) assert.equal(serialized.includes(forbidden), false, forbidden);
  });

  it("cannot let a broken logger mask the persistence failure", async () => {
    const repository = new PostgresCampaignRepository({
      pool: { connect: async () => { throw Object.assign(new Error("database unavailable"), { code: "08006" }); } },
      logger: { error: () => { throw new Error("logger failed"); } },
    });

    await assert.rejects(() => repository.executeCommand(context, command), CampaignPersistenceError);
  });
});
