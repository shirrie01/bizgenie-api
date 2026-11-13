const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const request = require('supertest');
const { createApp } = require('../index');
const { InMemoryCustomerWorkspaceRepository } = require('../src/customer-workspace');
const { InMemoryBrandBrainRepository } = require('../src/brand-brain');
const { AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require('../src/authorization');
const user = '11111111-1111-4111-8111-111111111111';
const scope = { tenant_id: 't', project_id: 'p', brand_id: 'b' };
function fixture({ unavailable = false } = {}) {
  const workspaceRepository = new InMemoryCustomerWorkspaceRepository({ workspaces: [{ auth_user_id: user, workspace: { ...scope, tenant_name: 'Private tenant', project_name: 'Private project', brand_name: 'Private name', brand_status: 'approved', membership_role: 'member' } }] });
  if (unavailable) workspaceRepository.listWorkspacesForAuthUserId = async () => { throw new Error('synthetic failure'); };
  const brandRepository = new InMemoryBrandBrainRepository();
  brandRepository.upsert({ brand_id: 'b', project_id: 'p', name: 'Private name', identity: { description: 'Private description' }, metadata: { version: 1, status: 'approved', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' } });
  const verify = async token => { if (token !== 'valid') throw new AuthenticationRequiredError(); return createCustomerActorFromVerifiedIdentity({ verifiedAuthUserId: user, verifiedScope: scope }); };
  return request(createApp({ customerWorkspaceRepository: workspaceRepository, brandBrainRepository: brandRepository, customerTokenVerifier: { verifyAccessToken: verify, verifyIdentityAccessToken: verify }, billingRepository: {}, corsConfig: { enabled: true, allowedOrigins: ['https://studio.example.test'] }, logger: { warn() {}, error() {} } }));
}
function privateResponse(response) {
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.ok((response.headers.vary || '').toLowerCase().split(/,\s*/).includes('authorization'));
}
describe('Customer response cache privacy', () => {
  it('protects successful workspace and Brain reads while preserving CORS Vary', async () => {
    const client = fixture();
    for (const url of ['/customer/workspace', '/customer/workspace/brand-brain']) {
      const response = await client.get(url).set('authorization', 'Bearer valid').set('origin', 'https://studio.example.test');
      assert.equal(response.status, 200);
      privateResponse(response);
      assert.ok(response.headers.vary.toLowerCase().includes('origin'));
      assert.equal(response.headers['access-control-allow-origin'], 'https://studio.example.test');
    }
  });
  it('protects authentication, policy, malformed-body and infrastructure errors', async () => {
    const client = fixture();
    const denied = await client.put('/customer/workspace/brand-brain').set('authorization', 'Bearer valid').send({ name: 'Unauthorized replacement' });
    assert.equal(denied.status, 403); privateResponse(denied);
    const malformed = await client.put('/customer/workspace/brand-brain').set('content-type', 'application/json').send('{');
    assert.equal(malformed.status, 400); privateResponse(malformed);
    const failure = await fixture({ unavailable: true }).get('/customer/workspace').set('authorization', 'Bearer valid');
    assert.equal(failure.status, 503); privateResponse(failure);
    for (const url of ['/customer/workspace', '/customer/campaigns?tenant_id=t&project_id=p', '/customer/billing/subscription']) {
      const response = await client.get(url);
      assert.equal(response.status, 401, url); privateResponse(response);
    }
  });
  it('protects CORS rejection and checkout errors without changing public health caching', async () => {
    const client = fixture();
    const denied = await client.get('/customer/workspace').set('origin', 'https://untrusted.example.test');
    assert.equal(denied.status, 403); privateResponse(denied);
    const checkout = await client.post('/billing/stripe/checkout').send({});
    // Even absent/unconfigured protected endpoints must not become cacheable.
    assert.equal(checkout.status, 404); privateResponse(checkout);
    const health = await client.get('/');
    assert.equal(health.status, 200);
    assert.equal(health.headers['cache-control'], undefined);
  });
});
