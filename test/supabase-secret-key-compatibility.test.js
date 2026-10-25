const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createClient } = require('@supabase/supabase-js');
const {
  createCustomerScopeProvisionerFromEnv,
  createSupabaseCustomerTokenVerifierFromEnv,
  CustomerScopeProvisioningError,
} = require('../src/authentication');
const { AuthenticationRequiredError } = require('../src/authorization');
const URL = 'https://supabase.fixture.invalid';
const USER = '11111111-1111-4111-8111-111111111111';
const SCOPE = { tenant_id: 'fixture_tenant', project_id: 'fixture_project', brand_id: 'fixture_brand' };
// Deliberately fake fixtures: never real project credentials or signed JWTs.
const SECRET = 'sb_secret_local_synthetic_not_a_real_credential';
const LEGACY = 'synthetic.legacy.not_signed';
function fixture(key, { denyGet = false, denyPut = false } = {}) {
  const calls = [];
  let settings;
  const provisioner = createCustomerScopeProvisionerFromEnv({
    env: { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: key },
    createClientImpl(url, suppliedKey, options) {
      assert.equal(url, URL); assert.equal(suppliedKey, key);
      settings = options;
      return createClient(url, suppliedKey, {
        ...options,
        global: { async fetch(url, init) {
          assert.equal(String(url), `${URL}/auth/v1/admin/users/${USER}`);
          const method = init.method;
          const headers = new Headers(init.headers);
          const body = init.body ? JSON.parse(init.body) : null;
          calls.push({ method, headers, body });
          const denied = method === 'GET' ? denyGet : denyPut;
          return new Response(JSON.stringify(denied
            ? { msg: `synthetic upstream diagnostic ${key}`, code: 'not_admin' }
            : { id: USER, app_metadata: body?.app_metadata || { provider: 'email', retained: true } }), {
            status: denied ? 403 : 200, headers: { 'content-type': 'application/json' },
          });
        } },
      });
    },
  });
  return { provisioner, calls, settings };
}
async function provision(value) {
  return value.provisioner.provisionTrustedScope({ auth_user_id: USER, trusted_scope: SCOPE });
}
describe('Pinned Supabase SDK server-key compatibility (no network)', () => {
  it('accepts an opaque modern secret through the real SDK and performs Auth admin GET/PUT', async () => {
    const f = fixture(SECRET);
    const result = await provision(f);
    assert.deepEqual(f.settings.auth, { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false });
    assert.deepEqual(f.calls.map(c => c.method), ['GET', 'PUT']);
    for (const c of f.calls) {
      assert.equal(c.headers.get('apikey'), SECRET);
      // Auth admin in pinned SDK2.112.3 sends BOTH headers; do not infer Edge Functions behavior.
      assert.equal(c.headers.get('authorization'), `Bearer ${SECRET}`);
    }
    assert.deepEqual(f.calls[1].body, { app_metadata: { provider: 'email', retained: true, ...SCOPE } });
    assert.deepEqual(result, { auth_user_id: USER, trusted_scope: SCOPE, requires_session_refresh: true });
    assert.ok(!JSON.stringify(result).includes(SECRET));
  });
  it('retains legacy-key transport without decoding the server key as a JWT', async () => {
    const f = fixture(LEGACY);
    await provision(f);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].headers.get('apikey'), LEGACY);
    assert.equal(f.calls[0].headers.get('authorization'), `Bearer ${LEGACY}`);
  });
  it('fails closed on a simulated gateway denial before any admin update', async () => {
    const f = fixture(SECRET, { denyGet: true });
    await assert.rejects(provision(f), error => error instanceof CustomerScopeProvisioningError && !error.message.includes(SECRET));
    assert.deepEqual(f.calls.map(c => c.method), ['GET']);
  });
  it('sanitizes simulated admin-update denial and never reports refresh success', async () => {
    const f = fixture(SECRET, { denyPut: true });
    await assert.rejects(provision(f), error => error instanceof CustomerScopeProvisioningError && error.code === 'CUSTOMER_SCOPE_PROVISIONING_FAILED' && !error.message.includes(SECRET));
    assert.deepEqual(f.calls.map(c => c.method), ['GET', 'PUT']);
  });
  it('does not equate client initialization with service-role authority for a publishable key', async () => {
    const f = fixture('sb_publishable_local_synthetic_not_a_real_credential', { denyGet: true });
    await assert.rejects(provision(f), CustomerScopeProvisioningError);
    assert.equal(f.calls.length, 1); // Initialization is permissive; server authority is decisive.
  });
  it('keeps the customer verifier on its separate publishable client and rejects opaque keys as customer JWTs', async () => {
    let keyUsed, requests = 0;
    const verifier = createSupabaseCustomerTokenVerifierFromEnv({
      env: { SUPABASE_URL: URL, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_synthetic', SUPABASE_SERVICE_ROLE_KEY: SECRET },
      createClientImpl(url, key, options) {
        keyUsed = key;
        return createClient(url, key, { ...options, global: { async fetch() { requests++; throw new Error('unexpected network transport'); } } });
      },
    });
    assert.equal(keyUsed, 'sb_publishable_local_synthetic');
    await assert.rejects(verifier.verifyAccessToken(SECRET), AuthenticationRequiredError);
    assert.equal(requests, 0);
  });
});
