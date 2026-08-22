const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20260821000000_create_generation_jobs.sql"
  ),
  "utf8"
);

describe("generation jobs migration", () => {
  it("creates a provider/price/secret-free immutable job table", () => {
    assert.match(migration, /create table if not exists public\.generation_jobs/i);
    const tableDefinition = migration.slice(
      migration.indexOf("create table if not exists public.generation_jobs"),
      migration.indexOf("-- A job's ownership is tenant/project/brand")
    );
    assert.doesNotMatch(
      tableDefinition,
      /provider|model|\bprice\b|\bcost\b|secret|callback|asset_location/i
    );
  });

  it("binds every job to its owning tenant, project, brand, and customer actor", () => {
    assert.match(
      migration,
      /generation_jobs_project_tenant_fkey[\s\S]*foreign key \(project_id, tenant_id\)[\s\S]*references public\.projects \(project_id, tenant_id\)/i
    );
    assert.match(
      migration,
      /tenant_id text not null[\s\S]*references public\.tenants \(tenant_id\) on delete restrict/i
    );
    assert.match(
      migration,
      /generation_jobs_project_tenant_fkey[\s\S]*references public\.projects \(project_id, tenant_id\)[\s\S]*on delete restrict/i
    );
    assert.match(
      migration,
      /generation_jobs_project_brand_fkey[\s\S]*foreign key \(project_id, brand_id\)[\s\S]*references public\.brand_brains \(project_id, brand_id\)[\s\S]*on delete restrict/i
    );
    assert.match(
      migration,
      /auth_user_id uuid not null[\s\S]*references public\.customer_profiles \(auth_user_id\) on delete restrict/i
    );
  });

  it("guards idempotent retries with one unique key per logical job", () => {
    assert.match(
      migration,
      /generation_jobs_idempotency_unique[\s\S]*\(tenant_id, project_id, idempotency_key\)/i
    );
  });

  it("makes the job table append-only", () => {
    assert.match(migration, /reject_generation_job_mutation/i);
    assert.match(migration, /before update on public\.generation_jobs/i);
    assert.match(migration, /before delete on public\.generation_jobs/i);
    assert.match(migration, /immutable and cannot be updated or deleted/i);
  });

  it("bounds allowed_scopes and keeps the table RLS-ready and server-only", () => {
    assert.match(migration, /jsonb_typeof\(allowed_scopes\) = 'array'/i);
    assert.match(migration, /jsonb_array_length\(allowed_scopes\) between 1 and 5/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /array\['anon', 'authenticated', 'service_role'\]/i);
    assert.match(
      migration,
      /revoke all on schema generation_jobs_private from public/i
    );
    assert.match(
      migration,
      /revoke all on function[\s\S]*reject_generation_job_mutation\(\)[\s\S]*from public/i
    );
    assert.match(migration, /set search_path = ''/i);
  });
});
