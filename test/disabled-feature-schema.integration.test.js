const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const request = require('supertest');
const { AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require('../src/authorization');
const { createProductionApp } = require('../index');
const { PostgresWorkspaceOnboardingRepository } = require('../src/workspace-onboarding');

const connection = process.env.TEST_DATABASE_URL;
if (connection) {
  let local = false;
  try { local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(connection).hostname); } catch {}
  if (!local) throw new Error('Disposable schema tests require an explicit loopback PostgreSQL instance');
}
const cutoff = '20260924110000'; // Existing twenty-migration main schema, before onboarding/premium additions.
const additions = ['workspace_onboarding_profiles', 'generation_execution_claims', 'social_connections'];
const flags = ['BILLING_DURABLE_ENABLED', 'STRIPE_BILLING_ENABLED', 'PAID_BETA_CAPTURE_ENABLED',
  'MEDIA_STORAGE_ENABLED', 'IMAGE_GENERATION_ENABLED', 'VIDEO_GENERATION_ENABLED',
  'QUOTED_GENERATION_ENABLED', 'MEDIA_INTAKE_ENABLED', 'SOCIAL_PUBLISHING_ENABLED',
  'LEARNING_ENABLED', 'STRATEGY_WORKFLOWS_ENABLED'];
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const publicTables = async pool => (await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;

describe('disabled features on legacy and advanced disposable schemas', { skip: !connection }, () => {
  for (const advanced of [false, true]) {
    it(`${advanced ? 'advanced' : 'legacy'} schema starts core without activating premium dependencies or altering schema`, async () => {
      // UUID database is owned by this test. Never use the configured database as the fixture itself.
      const database = 'feature_off_' + randomUUID().replaceAll('-', '');
      const admin = new Pool({ connectionString: connection, max: 1 });
      let pool, production, created = false;
      try {
        const client = await admin.connect();
        try {
          await client.query('select pg_advisory_lock(734921)');
          await client.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;end $$");
        } finally {
          try { await client.query('select pg_advisory_unlock(734921)'); } finally { client.release(); }
        }
        await admin.query(`create database ${database}`); created = true;
        const url = new URL(connection); url.pathname = '/' + database;
        pool = new Pool({ connectionString: url.toString(), max: 2 });
        await pool.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
        const directory = path.join(__dirname, '../supabase/migrations');
        const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql') && (advanced || file.slice(0, 14) <= cutoff)).sort();
        if (!advanced) assert.equal(files.length, 20);
        for (const file of files) await pool.query(fs.readFileSync(path.join(directory, file), 'utf8'));
        const before = await publicTables(pool);
        if (!advanced) {
          // Activation cannot bypass absent authority migrations or reach cloud credentials/storage.
          let externalCalls = 0;
          await assert.rejects(require('../src/activation').createMediaProductionComposition({
            pool, env: { BIZGENIE_ENVIRONMENT: 'staging', MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_BUCKET: 'synthetic-private-fixture' },
            accessTokenProvider: async () => { externalCalls++; throw new Error('Unexpected credential access'); },
            fetchImpl: async () => { externalCalls++; throw new Error('Unexpected storage request'); },
          }), require('../src/media/errors').MediaPersistenceError);
          assert.equal(externalCalls, 0, 'missing authority schema must fail before cloud credential/storage access');
        }

        for (const name of additions) {
          const relation = (await pool.query('select to_regclass($1) relation', ['public.' + name])).rows[0].relation;
          assert.equal(Boolean(relation), advanced, name);
        }
        // Explicit isolated env: no process credentials, provider keys or deployment configuration inherited.
        const env = { BRAND_BRAIN_DATABASE_URL: url.toString(), ...Object.fromEntries(flags.map(flag => [flag, 'false'])) };
        production = await createProductionApp({ env, logger: quiet });
        assert.equal(production.billingRepository, null);
        assert.equal(production.media.mediaEnabled, false);
        assert.equal(production.stripe.enabled, false);
        assert.equal(production.paidBeta.enabled, false);
        if (production.premium) assert.equal(production.premium.enabled, false);
        assert.deepEqual(await publicTables(pool), before, 'startup must not provision missing feature tables');
        // Identity verification is a labelled local stub; real composition/router/pool remain in use.
        production.customerTokenVerifier.verifyAccessToken = async token => {
          if (token !== 'synthetic') throw new AuthenticationRequiredError();
          return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: '11111111-1111-4111-8111-111111111111',
            verifiedScope: { tenant_id: 'synthetic_tenant', project_id: 'synthetic_project', brand_id: 'synthetic_brand' } });
        };
        const applicationPool = production.brandBrainRepository.pool;
        let reads = 0;
        const query = applicationPool.query.bind(applicationPool), connect = applicationPool.connect.bind(applicationPool);
        applicationPool.query = (...args) => { reads++; return query(...args); };
        applicationPool.connect = (...args) => { reads++; return connect(...args); };
        try {
          for (const [route, code] of [
            ['/customer/generation-quotes/11111111-1111-4111-8111-111111111111', 'GENERATION_BILLING_UNAVAILABLE'],
            ['/customer/social/connections', 'SOCIAL_NOT_CONFIGURED'],
          ]) {
            const denied = await request(production.app).get(route);
            assert.equal(denied.status, 401);
            const disabled = await request(production.app).get(route).set('Authorization', 'Bearer synthetic');
            assert.equal(disabled.status, 503); assert.equal(disabled.body.error.code, code);
          }
          assert.equal(reads, 0, 'disabled handlers must not touch absent feature tables');
        } finally { applicationPool.query = query; applicationPool.connect = connect; }
        if (advanced) {
          assert.deepEqual(await require('../src/workspace-onboarding/preflight').preflight(pool), { professional: true });
        } else {
          await assert.rejects(new PostgresWorkspaceOnboardingRepository({ pool }).preflight(), { code: 'ONBOARDING_UNAVAILABLE' });
          assert.equal((await pool.query("select to_regclass('public.workspace_onboarding_profiles') relation")).rows[0].relation, null);
        }
      } finally {
        await production?.brandBrainRepository.close();
        await pool?.end();
        try { if (created) await admin.query(`drop database ${database}`); } finally { await admin.end(); }
      }
    });
  }
});
