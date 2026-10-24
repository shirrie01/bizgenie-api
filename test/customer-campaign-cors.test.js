const assert = require('node:assert/strict');
const { it } = require('node:test');
const request = require('supertest');
const { createApp } = require('../index');
it('allows browser PATCH for the existing campaign update route without widening origins or headers', async () => {
  const client = request(createApp({ corsConfig: { enabled: true, allowedOrigins: ['https://studio.example.test'] } }));
  const route = '/customer/campaigns/11111111-1111-4111-8111-111111111111';
  const preflight = () => client.options(route).set('origin', 'https://studio.example.test').set('access-control-request-method', 'PATCH').set('access-control-request-headers', 'authorization,content-type');
  const allowed = await preflight();
  assert.equal(allowed.status, 204);
  assert.ok(allowed.headers['access-control-allow-methods'].split(',').includes('PATCH'));
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://studio.example.test');
  assert.equal((await preflight().set('origin', 'https://attacker.example.test')).status, 403);
  assert.equal((await preflight().set('access-control-request-headers', 'authorization,x-admin-key')).status, 403);
  const actual = await client.patch(route).set('origin', 'https://studio.example.test').send({});
  assert.equal(actual.status, 400); // Route validation still runs; preflight is not authorization.
  assert.equal(actual.body.error.code, 'VALIDATION_ERROR');
});
