const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { after, test } = require("node:test");
const { Pool } = require("pg");
const {
  PostgresBrandBrainRepository,
} = require("../src/brand-brain");

const connectionString = process.env.BRAND_BRAIN_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "BRAND_BRAIN_TEST_DATABASE_URL is required for the optional integration test"
  );
}

const pool = new Pool({
  connectionString,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
});
const repository = new PostgresBrandBrainRepository({ pool });
const suffix = randomUUID().replaceAll("-", "");
const brandId = `integration_brand_${suffix}`;
const projectId = `integration_project_${suffix}`;

after(async () => {
  await pool.query("DELETE FROM public.brand_brains WHERE brand_id = $1", [
    brandId,
  ]);
  await pool.end();
});

test("persists across real Postgres repository instances", async () => {
  const value = {
    brand_id: brandId,
    project_id: projectId,
    name: "Brand Brain integration test",
    metadata: {
      version: 1,
      status: "approved",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  await repository.initialize();
  await repository.upsert(value);

  const recreated = new PostgresBrandBrainRepository({ pool });
  assert.deepEqual(await recreated.getByProjectAndBrand(projectId, brandId), value);
  assert.equal(
    await recreated.getByProjectAndBrand(`other_${projectId}`, brandId),
    null
  );
});
