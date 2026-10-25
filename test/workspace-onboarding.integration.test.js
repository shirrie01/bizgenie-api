const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");
const { Pool } = require("pg");

const { PostgresCustomerWorkspaceRepository } = require("../src/customer-workspace");
const {
  PostgresWorkspaceOnboardingRepository,
  WorkspaceOnboardingService,
} = require("../src/workspace-onboarding");

const ADMIN_DATABASE_URL = process.env.TEST_DATABASE_URL;
const postgresDescribe = ADMIN_DATABASE_URL ? describe : describe.skip;
const AUTH_A = "11111111-1111-4111-8111-111111111111";
const AUTH_B = "22222222-2222-4222-8222-222222222222";
const SCOPE_A = { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" };
const SCOPE_A2 = { tenant_id: "tenant_a", project_id: "project_a2", brand_id: "brand_a2" };
const SCOPE_B = { tenant_id: "tenant_b", project_id: "project_b", brand_id: "brand_b" };
const actor = (id, scope) => ({ kind: "customer", auth_user_id: id, trusted_scope: scope });
let n = 0;
const body = (extra = {}) => ({ idempotency_key: `k-${++n}`, expected_version: 0, ...extra });

postgresDescribe("PostgresWorkspaceOnboardingRepository against a disposable PostgreSQL database", { concurrency: 1 }, () => {
  let adminPool, pool, database, service;
  const url = (name) => { const value = new URL(ADMIN_DATABASE_URL); value.pathname = `/${name}`; return value.toString(); };
  const build = () => new WorkspaceOnboardingService({
    repository: new PostgresWorkspaceOnboardingRepository({ pool }),
    workspaceRepository: new PostgresCustomerWorkspaceRepository({ pool }),
    brandBrainRepository: new (require("../src/brand-brain").PostgresBrandBrainRepository)({ pool }),
  });

  before(async () => {
    adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
    const client = await adminPool.connect();
    try {
      await client.query("select pg_advisory_lock(734921)");
      await client.query("do $r$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $r$");
    } finally {
      try { await client.query("select pg_advisory_unlock(734921)"); } finally { client.release(); }
    }
    database = `bizgenie_onboarding_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`create database ${database}`);
    pool = new Pool({ connectionString: url(database), max: 12 });
    await pool.query("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
    const directory = path.join(__dirname, "..", "supabase", "migrations");
    for (const filename of fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
      try { await pool.query(fs.readFileSync(path.join(directory, filename), "utf8")); }
      catch (error) { error.message = `${filename}: ${error.message}`; throw error; }
    }
    await pool.query("insert into auth.users(id) values($1),($2)", [AUTH_A, AUTH_B]);
    await pool.query("insert into public.customer_profiles(auth_user_id) values($1),($2)", [AUTH_A, AUTH_B]);
    await pool.query("insert into public.tenants(tenant_id,name,created_by) values('tenant_a','A',$1),('tenant_b','B',$2)", [AUTH_A, AUTH_B]);
    await pool.query("insert into public.tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner'),('tenant_b',$2,'owner')", [AUTH_A, AUTH_B]);
    await pool.query("insert into public.projects(project_id,tenant_id,name) values('project_a','tenant_a','A'),('project_a2','tenant_a','A2'),('project_b','tenant_b','B')");
    await pool.query("insert into public.brand_brains(brand_id,project_id,name,version,status,identity,created_at,updated_at) values('brand_a','project_a','A',7,'approved','{\"description\":\"We supply products for local customers.\"}','2026-01-01','2026-02-02'),('brand_a2','project_a2','A2',1,'approved',null,now(),now()),('brand_b','project_b','B',1,'approved',null,now(),now())");
    service = build();
  });
  after(async () => {
    await pool?.end();
    if (adminPool && database) {
      for (let i = 0; i < 20; i += 1) {
        try { await adminPool.query(`drop database if exists ${database}`); break; } catch { await new Promise((r) => setTimeout(r, 25)); }
      }
    }
    await adminPool?.end();
  });

  it("saves, resumes after a fresh service instance, and survives a retry after restart", async () => {
    const first = body({ sector_key: "perfume", channels: ["email", "instagram"], draft: { goal: "Sell scent" }, current_step: 3 });
    const saved = await service.save({ actor: actor(AUTH_A, SCOPE_A), request: first });
    assert.equal(saved.onboarding.version, 1);
    const restarted = build();
    const resumed = await restarted.get({ actor: actor(AUTH_A, SCOPE_A) });
    assert.deepEqual(resumed.onboarding, saved.onboarding);
    const replay = await restarted.save({ actor: actor(AUTH_A, SCOPE_A), request: first });
    assert.equal(replay.replayed, true);
    assert.equal(replay.onboarding.version, 1);
  });

  it("lets exactly one of several concurrent first writes win", async () => {
    const results = await Promise.allSettled(["email", "website", "tiktok", "facebook"].map((channel) =>
      service.save({ actor: actor(AUTH_A, SCOPE_A2), request: body({ channels: [channel] }) })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "VERSION_CONFLICT"));
    assert.equal((await service.get({ actor: actor(AUTH_A, SCOPE_A2) })).onboarding.version, 1);
  });

  it("isolates tenants and refuses a scope the customer is not a member of", async () => {
    assert.equal((await service.get({ actor: actor(AUTH_B, SCOPE_B) })).onboarding.version, 0);
    await assert.rejects(() => service.get({ actor: actor(AUTH_B, SCOPE_A) }), { code: "WORKSPACE_NOT_AUTHORIZED" });
    await assert.rejects(() => service.save({ actor: actor(AUTH_B, SCOPE_A), request: body({ sector_key: "beverage" }) }), { code: "WORKSPACE_NOT_AUTHORIZED" });
    assert.equal((await service.get({ actor: actor(AUTH_A, SCOPE_A) })).onboarding.sector.key, "perfume");
  });

  it("leaves the Brand Brain row byte-for-byte unchanged", async () => {
    const before = (await pool.query("select * from public.brand_brains where brand_id='brand_a'")).rows[0];
    await service.save({ actor: actor(AUTH_A, SCOPE_A), request: { idempotency_key: "bb-check", expected_version: 1, complete: true } });
    const after = (await pool.query("select * from public.brand_brains where brand_id='brand_a'")).rows[0];
    assert.deepEqual(after, before);
    assert.equal(Number(after.version), 7);
  });

  it("enforces integrity in the database itself", async () => {
    const insert = (cols, vals) => pool.query(
      `insert into public.workspace_onboarding_profiles (tenant_id,project_id,brand_id,profile_version,status,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash${cols})
       values ('tenant_b','project_b','brand_b',1,'in_progress',now(),now(),$1,'k',$2${vals})`,
      [AUTH_B, "a".repeat(64)]);
    await assert.rejects(() => insert(",sector_key", ",'crypto'"), /check/);
    await assert.rejects(() => insert(",sector_key", ",'perfume'"), /sector_source_pair/);
    await assert.rejects(() => insert(",channels", ",'[\"email\"]'::jsonb"), /channels_source_pair/);
    await assert.rejects(() => insert(",draft", ",'[]'::jsonb"), /check/);
    await assert.rejects(() => insert(",draft", `,'{"a":"${"x".repeat(12001)}"}'::jsonb`), /check/);
    await assert.rejects(() => insert(",current_step", ",21"), /check/);
    await assert.rejects(() => pool.query(
      "insert into public.workspace_onboarding_profiles (tenant_id,project_id,brand_id,profile_version,status,completed_at,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash) values ('tenant_b','project_b','brand_b',1,'completed',now(),now(),now(),$1,'k',$2)",
      [AUTH_B, "a".repeat(64)]), /requires_answers/);
    await assert.rejects(() => pool.query(
      "insert into public.workspace_onboarding_profiles (tenant_id,project_id,brand_id,profile_version,status,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash) values ('tenant_b','project_b','no_such_brand',1,'in_progress',now(),now(),$1,'k',$2)",
      [AUTH_B, "a".repeat(64)]), /foreign key/);
  });

  it("is unreachable by anon, authenticated and service_role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${role}`);
        await assert.rejects(() => client.query("select * from public.workspace_onboarding_profiles"), /permission denied/);
      } finally { await client.query("rollback"); client.release(); }
    }
  });

  it("reruns the migration without losing saved data", async () => {
    const before = await service.get({ actor: actor(AUTH_A, SCOPE_A) });
    const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261023100000_create_workspace_onboarding_profiles.sql"), "utf8");
    await pool.query(sql);
    assert.deepEqual((await service.get({ actor: actor(AUTH_A, SCOPE_A) })).onboarding, before.onboarding);
  });
  // Pause only the transaction's authority query, after the service-level check.
  function gatedService({ afterLock = false } = {}) {
    let ready, resume, once = true;
    const reached = new Promise(resolve => { ready = resolve; });
    const continued = new Promise(resolve => { resume = resolve; });
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { async query(sql, ...args) {
        if (once && String(sql).includes("for share of tm,p,b")) {
          once = false;
          if (afterLock) { const result = await client.query(sql, ...args); ready(); await continued; return result; }
          ready(); await continued;
        }
        return client.query(sql, ...args);
      }, release: () => client.release() };
    } };
    return { reached, resume, service: new WorkspaceOnboardingService({
      repository: new PostgresWorkspaceOnboardingRepository({ pool: wrapped }),
      workspaceRepository: new PostgresCustomerWorkspaceRepository({ pool }),
      brandBrainRepository: new (require("../src/brand-brain").PostgresBrandBrainRepository)({ pool }),
    }) };
  }

  it("rejects revocation after service authorization but before the transaction lock", { timeout: 15000 }, async () => {
    const before = await service.get({ actor: actor(AUTH_A, SCOPE_A) }), gate = gatedService();
    const writing = gate.service.save({ actor: actor(AUTH_A, SCOPE_A), request: body({ expected_version: before.onboarding.version, channels: ["website"] }) });
    const outcome = writing.then(value => ({ value }), error => ({ error }));
    try {
      await Promise.race([gate.reached, outcome.then(r => { throw r.error || new Error("Writer did not reach authority barrier"); })]);
      await pool.query("update public.tenant_memberships set role='member' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]);
      gate.resume(); const result = await outcome;
      assert.equal(result.error.code, "WORKSPACE_NOT_AUTHORIZED");
      assert.equal((await service.get({ actor: actor(AUTH_A, SCOPE_A) })).onboarding.version, before.onboarding.version, "member read stays authorized");
    } finally { gate.resume(); await outcome; await pool.query("update public.tenant_memberships set role='owner' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]); }
  });

  it("serializes a later revocation behind an already-authorized write lock", { timeout: 15000 }, async () => {
    const before = await service.get({ actor: actor(AUTH_A, SCOPE_A) }), gate = gatedService({ afterLock: true });
    const request = body({ expected_version: before.onboarding.version, channels: ["instagram"] });
    const writing = gate.service.save({ actor: actor(AUTH_A, SCOPE_A), request });
    const outcome = writing.then(value => ({ value }), error => ({ error }));
    const revoker = await pool.connect(); let revocation;
    try {
      await Promise.race([gate.reached, outcome.then(r => { throw r.error || new Error("Writer did not hold authority lock"); })]);
      const pid = (await revoker.query("select pg_backend_pid() pid")).rows[0].pid;
      revocation = revoker.query("update public.tenant_memberships set role='member' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]);
      let waiting = false; const deadline = Date.now() + 5000;
      while (!waiting && Date.now() < deadline) {
        waiting = (await pool.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type === "Lock";
        if (!waiting) await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(waiting, true, "real PostgreSQL lock blocks the revocation update");
      gate.resume(); const result = await outcome; if (result.error) throw result.error;
      assert.equal(result.value.onboarding.version, before.onboarding.version + 1);
      await revocation;
      await assert.rejects(() => service.save({ actor: actor(AUTH_A, SCOPE_A), request }), { code: "WORKSPACE_NOT_AUTHORIZED" });
    } finally { gate.resume(); await outcome; await revocation?.catch(() => {}); revoker.release(); await pool.query("update public.tenant_memberships set role='owner' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]); }
  });

  it("validates the locked Brand Brain, not draft text or an earlier service snapshot", { timeout: 15000 }, async () => {
    const before = await service.get({ actor: actor(AUTH_A, SCOPE_A) }), gate = gatedService();
    const writing = gate.service.save({ actor: actor(AUTH_A, SCOPE_A), request: body({ expected_version: before.onboarding.version, complete: true, draft: { description: "Not canonical" } }) });
    const outcome = writing.then(value => ({ value }), error => ({ error }));
    const brain = (await pool.query("select name,identity from public.brand_brains where brand_id='brand_a'")).rows[0];
    try {
      await Promise.race([gate.reached, outcome.then(r => { throw r.error || new Error("Writer missed barrier"); })]);
      await pool.query("update public.brand_brains set name='BizGenie Workspace',identity=$1 where brand_id='brand_a'", [{ description: "Customer-provided website or profile: https://example.test" }]);
      gate.resume(); const result = await outcome;
      assert.equal(result.error.code, "ONBOARDING_INCOMPLETE");
      assert.deepEqual(result.error.details.map(d => d.path), ["business_name", "description"]);
      assert.equal((await service.get({ actor: actor(AUTH_A, SCOPE_A) })).onboarding.version, before.onboarding.version);
    } finally { gate.resume(); await outcome; await pool.query("update public.brand_brains set name=$1,identity=$2 where brand_id='brand_a'", [brain.name, brain.identity]); }
  });

  it("rejects mismatched tenant/project and duplicate/unknown channel writes in SQL", async () => {
    const insert = (tenant, project, brand, channels) => pool.query(`insert into public.workspace_onboarding_profiles
      (tenant_id,project_id,brand_id,profile_version,status,channels,channels_source,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash)
      values($1,$2,$3,1,'in_progress',$4,'customer',now(),now(),$5,'adversary',$6)`, [tenant,project,brand,JSON.stringify(channels),AUTH_A,"a".repeat(64)]);
    await assert.rejects(() => insert("tenant_b", "project_a", "brand_a", ["email"]), /project_tenant_fkey/);
    await assert.rejects(() => insert("tenant_b", "project_b", "brand_b", ["email","email"]), /channels_values/);
    await assert.rejects(() => insert("tenant_b", "project_b", "brand_b", ["unsupported"]), /channels_values/);
  });

  for (const scenario of [
    ["disabled RLS", "alter table public.workspace_onboarding_profiles disable row level security", "alter table public.workspace_onboarding_profiles enable row level security"],
    ["table grant", "grant select on public.workspace_onboarding_profiles to authenticated", "revoke select on public.workspace_onboarding_profiles from authenticated"],
    ["column grant", "grant select(draft) on public.workspace_onboarding_profiles to authenticated", "revoke select(draft) on public.workspace_onboarding_profiles from authenticated"],
    ["public column grant", "grant select(draft) on public.workspace_onboarding_profiles to public", "revoke select(draft) on public.workspace_onboarding_profiles from public"],
    ["unexpected policy", "create policy onboarding_drift on public.workspace_onboarding_profiles using (true)", "drop policy onboarding_drift on public.workspace_onboarding_profiles"],
    ["extra column", "alter table public.workspace_onboarding_profiles add column unexpected text", "alter table public.workspace_onboarding_profiles drop column unexpected"],
  ]) it(`fails closed on schema drift: ${scenario[0]}`, async () => {
    const repo = new PostgresWorkspaceOnboardingRepository({ pool });
    try {
      await pool.query(scenario[1]);
      await assert.rejects(() => repo.get(SCOPE_A), { code: "ONBOARDING_UNAVAILABLE" });
      await assert.rejects(() => service.save({ actor: actor(AUTH_A, SCOPE_A), request: body({ sector_key: "charity" }) }), { code: "ONBOARDING_UNAVAILABLE" });
    } finally { await pool.query(scenario[2]); }
    await repo.preflight();
  });

  it("accepts the exact logically restored idempotency constraint without accepting weaker checks", async () => {
    const repo = new PostgresWorkspaceOnboardingRepository({ pool });
    const name = "workspace_onboarding_profiles_last_idempotency_key_check";
    const original = (await pool.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='workspace_onboarding_profiles'::regclass and conname=$1", [name])).rows[0].definition;
    try {
      // pg_dump emits this expression; reparsing flattens redundant AND grouping.
      await pool.query(`alter table workspace_onboarding_profiles drop constraint ${name}, add constraint ${name} ${original}`);
      await repo.preflight();
      await pool.query(`alter table workspace_onboarding_profiles drop constraint ${name}, add constraint ${name}
        check(length(last_idempotency_key)>=1 and length(last_idempotency_key)<=4096 and last_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')`);
      await assert.rejects(repo.preflight(), { code: "ONBOARDING_UNAVAILABLE" });
    } finally {
      await pool.query(`alter table workspace_onboarding_profiles drop constraint ${name}, add constraint ${name} ${original}`);
    }
    await repo.preflight();
  });

  it("detects a weakened named constraint rather than trusting its name", async () => {
    const repo = new PostgresWorkspaceOnboardingRepository({ pool });
    try {
      await pool.query("alter table public.workspace_onboarding_profiles drop constraint workspace_onboarding_channels_values, add constraint workspace_onboarding_channels_values check(true)");
      await assert.rejects(() => repo.preflight(), { code: "ONBOARDING_UNAVAILABLE" });
    } finally {
      await pool.query("alter table public.workspace_onboarding_profiles drop constraint workspace_onboarding_channels_values");
      await pool.query(fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261024090000_harden_workspace_onboarding_profiles.sql"), "utf8"));
    }
    await repo.preflight();
  });

  it("a lost commit acknowledgement returns 503 but same-key retry recovers the committed receipt", async () => {
    const before = await service.get({ actor: actor(AUTH_A, SCOPE_A) });
    let lose = true;
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { async query(sql, ...args) {
        const result = await client.query(sql, ...args);
        if (String(sql).toLowerCase() === "commit" && lose) { lose = false; throw new Error("synthetic acknowledgement loss"); }
        return result;
      }, release: () => client.release() };
    } };
    const broken = new WorkspaceOnboardingService({ repository: new PostgresWorkspaceOnboardingRepository({ pool: wrapped }),
      workspaceRepository: new PostgresCustomerWorkspaceRepository({ pool }),
      brandBrainRepository: new (require("../src/brand-brain").PostgresBrandBrainRepository)({ pool }) });
    const request = body({ expected_version: before.onboarding.version, channels: ["website"] });
    await assert.rejects(() => broken.save({ actor: actor(AUTH_A, SCOPE_A), request }), { code: "ONBOARDING_UNAVAILABLE" });
    const resumed = await build().save({ actor: actor(AUTH_A, SCOPE_A), request });
    assert.equal(resumed.replayed, true); assert.equal(resumed.onboarding.version, before.onboarding.version + 1);
    assert.deepEqual(resumed.onboarding.channels.values, ["website"]);
  });

});
