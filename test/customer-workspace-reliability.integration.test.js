const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, beforeEach, after, describe, it } = require('node:test');
const { Pool } = require('pg');
const { PostgresCustomerWorkspaceRepository, CustomerWorkspaceService } = require('../src/customer-workspace');
const { PostgresBrandBrainRepository } = require('../src/brand-brain');
const url = process.env.TEST_DATABASE_URL;
const user = '11111111-1111-4111-8111-111111111111';
const actor = { kind: 'customer', auth_user_id: user };
(url ? describe : describe.skip)('Workspace bootstrap reliability in disposable PostgreSQL', { concurrency: 1 }, () => {
  let admin, pool, database, repository, service;
  before(async () => {
    admin = new Pool({ connectionString: url });
    const client = await admin.connect();
    try {
      await client.query('select pg_advisory_lock(734921)');
      await client.query("do $r$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $r$");
    } finally { try { await client.query('select pg_advisory_unlock(734921)'); } finally { client.release(); } }
    database = `workspace_reliability_${process.pid}_${Date.now()}`;
    await admin.query(`create database ${database}`);
    const target = new URL(url); target.pathname = `/${database}`;
    pool = new Pool({ connectionString: target.toString(), max: 8 });
    await pool.query("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select null::uuid'");
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await pool.query('insert into auth.users values($1)', [user]);
    repository = new PostgresCustomerWorkspaceRepository({ pool });
    service = new CustomerWorkspaceService({ repository, brandBrainRepository: new PostgresBrandBrainRepository({ pool }) });
  });
  beforeEach(async () => {
    await pool.query('delete from brand_brains; delete from projects; delete from tenant_memberships; delete from tenants; delete from customer_profiles');
  });
  after(async () => { await pool?.end(); if (database) await admin.query(`drop database ${database}`); await admin?.end(); });
  const bootstrap = () => service.bootstrapWorkspace({ actor, request: { business_name: 'Synthetic local business' } });
  it('does not resurrect revoked ownership on bootstrap replay', async () => {
    const first = await bootstrap();
    await pool.query('delete from tenant_memberships where tenant_id=$1 and auth_user_id=$2', [first.workspace.tenant_id, user]);
    assert.equal((await service.getWorkspace({ actor })).status, 'missing_workspace');
    await assert.rejects(bootstrap(), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' });
    assert.equal((await pool.query('select count(*)::int n from tenant_memberships')).rows[0].n, 0);
    const brain = await pool.query('select name from brand_brains where brand_id=$1', [first.workspace.brand_id]);
    assert.equal(brain.rows[0].name, 'Synthetic local business');
  });
  it('does not restore membership when revocation wins after discovery but before bootstrap transaction', async () => {
    const first = await bootstrap();
    const original = repository.listWorkspacesForAuthUserId.bind(repository);
    repository.listWorkspacesForAuthUserId = async () => {
      await pool.query('delete from tenant_memberships where tenant_id=$1', [first.workspace.tenant_id]);
      return [];
    };
    try { await assert.rejects(bootstrap(), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' }); }
    finally { repository.listWorkspacesForAuthUserId = original; }
    assert.equal((await pool.query('select count(*)::int n from tenant_memberships')).rows[0].n, 0);
  });
  it('serializes simultaneous first bootstraps and reuses the same owner workspace', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, bootstrap));
    assert.ok(results.every(r => r.workspace.membership_role === 'owner' && r.workspace.brand_id === results[0].workspace.brand_id));
    for (const table of ['tenants', 'tenant_memberships', 'projects', 'brand_brains']) {
      assert.equal((await pool.query(`select count(*)::int n from ${table}`)).rows[0].n, 1);
    }
  });
  it('does not promote an existing demoted member on direct bootstrap retries', async () => {
    const first = await bootstrap();
    await pool.query("update tenant_memberships set role='member' where tenant_id=$1", [first.workspace.tenant_id]);
    const result = await repository.bootstrapWorkspace({ auth_user_id: user, business_name: 'Cannot rename or promote' });
    assert.equal(result.membership_role, 'member');
    assert.equal(result.brand_name, first.workspace.brand_name);
  });
  it('reconciles a lost commit acknowledgement by replay without duplicating or renaming', async () => {
    let loseAck = true;
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, values) {
        const result = await client.query(sql, values);
        if (sql === 'COMMIT' && loseAck) { loseAck = false; throw new Error('synthetic lost COMMIT acknowledgement'); }
        return result;
      } };
    } };
    const lossy = new PostgresCustomerWorkspaceRepository({ pool: wrapped });
    await assert.rejects(lossy.bootstrapWorkspace({ auth_user_id: user, business_name: 'Committed name' }), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' });
    const result = await bootstrap();
    assert.equal(result.workspace.brand_name, 'Committed name');
    assert.equal((await pool.query('select count(*)::int n from brand_brains')).rows[0].n, 1);
  });
  it('does not recreate missing business identity for a demoted member', async () => {
    const first = await bootstrap();
    await pool.query("update tenant_memberships set role='member' where tenant_id=$1", [first.workspace.tenant_id]);
    await pool.query('delete from brand_brains');
    await assert.rejects(bootstrap(), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' });
    assert.equal((await pool.query('select count(*)::int n from brand_brains')).rows[0].n, 0);
  });
  it('rolls back a real PostgreSQL lock timeout without orphaned ownership', async () => {
    const blocker = await pool.connect();
    let observedCode;
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, values) {
        try {
          const result = await client.query(sql, values);
          if (sql === 'BEGIN') await client.query("set local lock_timeout='25ms'");
          return result;
        } catch (error) { observedCode = error.code; throw error; }
      } };
    } };
    try {
      await blocker.query('begin');
      await blocker.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`customer-workspace:${user}`]);
      const timed = new PostgresCustomerWorkspaceRepository({ pool: wrapped });
      await assert.rejects(timed.bootstrapWorkspace({ auth_user_id: user }), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' });
      assert.equal(observedCode, '55P03');
      assert.equal((await pool.query('select count(*)::int n from tenant_memberships')).rows[0].n, 0);
    } finally { await blocker.query('rollback'); blocker.release(); }
    assert.equal((await bootstrap()).workspace.membership_role, 'owner');
  });
  it('rolls back an interrupted transaction before commit and allows clean bootstrap retry', async () => {
    let interrupted = false;
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, values) {
        if (!interrupted && sql.includes('INSERT INTO public.projects')) { interrupted = true; throw new Error('synthetic connection interruption'); }
        return client.query(sql, values);
      } };
    } };
    const faulty = new PostgresCustomerWorkspaceRepository({ pool: wrapped });
    await assert.rejects(faulty.bootstrapWorkspace({ auth_user_id: user }), { code: 'WORKSPACE_PROVISIONING_UNAVAILABLE' });
    assert.equal((await pool.query('select count(*)::int n from tenants')).rows[0].n, 0);
    assert.equal((await bootstrap()).workspace.membership_role, 'owner');
  });
});
