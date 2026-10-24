const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { before, beforeEach, after, describe, it } = require('node:test');
const { Pool } = require('pg');
const { PostgresBrandBrainRepository } = require('../src/brand-brain');
const url = process.env.TEST_DATABASE_URL;
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const foreign = '33333333-3333-4333-8333-333333333333';
const scope = { tenant_id: 't', project_id: 'p', brand_id: 'b' };
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
(url ? describe : describe.skip)('Brand Brain identity policy on disposable PostgreSQL', { concurrency: 1 }, () => {
  let admin, pool, database, repo;
  before(async () => {
    admin = new Pool({ connectionString: url });
    // Roles are cluster-wide; serialize with the other disposable PostgreSQL suites.
    const roleClient = await admin.connect();
    try {
      await roleClient.query('select pg_advisory_lock(734921)');
      await roleClient.query("do $roles$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $roles$");
    } finally {
      try { await roleClient.query('select pg_advisory_unlock(734921)'); } finally { roleClient.release(); }
    }
    database = `brain_policy_${process.pid}_${Date.now()}`;
    await admin.query(`create database ${database}`);
    const target = new URL(url); target.pathname = `/${database}`;
    pool = new Pool({ connectionString: target.toString(), max: 8 });
    // Existing DDL is exercised only in this newly-created disposable test database.
    await pool.query('create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as \'select null::uuid\'');
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await pool.query('insert into auth.users values($1),($2),($3)', [owner, member, foreign]);
    await pool.query('insert into customer_profiles(auth_user_id) values($1),($2),($3)', [owner, member, foreign]);
    await pool.query("insert into tenants(tenant_id,name,created_by) values('t','Test',$1)", [owner]);
    await pool.query("insert into projects(project_id,tenant_id,name) values('p','t','Test')");
    repo = new PostgresBrandBrainRepository({ pool });
  });
  beforeEach(async () => {
    await pool.query("delete from tenant_memberships");
    await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('t',$1,'owner'),('t',$2,'member')", [owner, member]);
    await pool.query('delete from brand_brains');
    await repo.upsert({ brand_id: 'b', project_id: 'p', name: 'Original', identity: { description: 'Original description', mission: 'Mission' }, metadata: { version: 1, status: 'approved', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' } });
  });
  after(async () => { await pool?.end(); if (database) await admin.query(`drop database ${database}`); await admin?.end(); });
  async function args(id = owner, changes = {}) {
    const expected = await repo.getByBrandId('b');
    return { auth_user_id: id, scope, expected, record: { ...structuredClone(expected), ...changes, metadata: { ...expected.metadata, version: expected.metadata.version + 1 } } };
  }
  it('allows owner identity writes; member unrelated fields but not name/description/removal', async () => {
    await repo.guardedUpsert(await args(owner, { name: 'Owner name', identity: { description: 'Owner description' } }));
    const allowed = await repo.guardedUpsert(await args(member, { voice: { tone: 'Friendly' } }));
    assert.equal(allowed.name, 'Owner name');
    for (const change of [{ name: 'Member name' }, { identity: {} }, { identity: { description: 'Other' } }, { identity: undefined }]) {
      await assert.rejects(repo.guardedUpsert(await args(member, change)), { status: 403 });
    }
    assert.equal((await repo.getByBrandId('b')).metadata.version, 3);
  });
  it('denies nonmember/foreign scope and admin creates or identity mutations; permits admin unrelated edits', async () => {
    await assert.rejects(repo.guardedUpsert(await args(foreign)), { status: 403 });
    const bad = await args(); bad.scope = { ...scope, tenant_id: 'foreign' };
    await assert.rejects(repo.guardedUpsert(bad), { status: 403 });
    const edit = await args(owner, { voice: { tone: 'Admin tone' } }); edit.admin = true;
    await repo.guardedUpsert(edit);
    const identity = await args(owner, { name: 'Admin name' }); identity.admin = true;
    await assert.rejects(repo.guardedUpsert(identity), { status: 403 });
    const create = await args(); create.admin = true; create.record.brand_id = 'new'; create.expected = null;
    await assert.rejects(repo.guardedUpsert(create), { status: 403 });
  });
  it('rejects stale full-payload identity rollback and serializes concurrent writes', async () => {
    const stale = await args(member);
    await repo.guardedUpsert(await args(owner, { name: 'Owner correction' }));
    await assert.rejects(repo.guardedUpsert(stale), { status: 409 });
    const one = await args(owner, { voice: { tone: 'One' } });
    const two = await args(owner, { voice: { tone: 'Two' } });
    const results = await Promise.allSettled([repo.guardedUpsert(one), repo.guardedUpsert(two)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
    assert.equal((await repo.getByBrandId('b')).metadata.version, 3);
  });
  async function race(afterLock, demote = false) {
    const entered = gate(), resume = gate();
    const wrappedPool = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, values) {
        if (sql.includes('select tm.role')) {
          if (!afterLock) { entered.resolve(); await resume.promise; }
          const result = await client.query(sql, values);
          if (afterLock) { entered.resolve(); await resume.promise; }
          return result;
        }
        return client.query(sql, values);
      } };
    } };
    const guarded = new PostgresBrandBrainRepository({ pool: wrappedPool });
    const mutation = await args(owner, { name: 'New name' });
    // Observe rejection immediately so an intentional denial cannot become an unhandled rejection.
    const writing = guarded.guardedUpsert(mutation).then(value => ({ value }), error => ({ error }));
    await entered.promise;
    const revoker = await pool.connect();
    try {
      const pid = (await revoker.query('select pg_backend_pid() pid')).rows[0].pid;
      const revoking = revoker.query(demote ? "update tenant_memberships set role='member' where auth_user_id=$1" : 'delete from tenant_memberships where auth_user_id=$1', [owner]);
      if (afterLock) {
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          blocked = (await pool.query('select cardinality(pg_blocking_pids($1)) > 0 blocked', [pid])).rows[0].blocked;
          if (blocked) break;
          await new Promise(r => setTimeout(r, 5));
        }
        assert.equal(blocked, true, 'revocation waits for held authorization lock');
      } else await revoking;
      resume.resolve();
      const result = await writing;
      await revoking;
      if (afterLock) assert.equal(result.value.name, 'New name');
      else assert.equal(result.error.status, 403);
      await assert.rejects(repo.guardedUpsert(await args(owner, { name: 'Later' })), { status: 403 });
    } finally { resume.resolve(); revoker.release(); }
  }
  it('does not create an additional workspace after owner revocation before its authority lock', async () => {
    const { PostgresCustomerWorkspaceRepository } = require('../src/customer-workspace');
    const entered = gate(), resume = gate();
    const wrapped = { query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, values) {
        if (sql.includes('SELECT role FROM public.tenant_memberships')) { entered.resolve(); await resume.promise; }
        return client.query(sql, values);
      } };
    } };
    const workspaceRepo = new PostgresCustomerWorkspaceRepository({ pool: wrapped });
    const creating = workspaceRepo.createAdditionalWorkspace({ auth_user_id: owner, tenant_id: 't', business_name: 'Denied new business' });
    await entered.promise;
    try { await pool.query('delete from tenant_memberships where auth_user_id=$1', [owner]); }
    finally { resume.resolve(); }
    assert.equal(await creating, null);
    assert.equal((await pool.query('select count(*)::int n from brand_brains')).rows[0].n, 1);
  });
  it('denies revocation committed before authority lock' , () => race(false));
  it('denies owner demotion committed before authority lock', () => race(false, true));
  it('holds authorization through commit when revocation arrives after lock', () => race(true));
});
