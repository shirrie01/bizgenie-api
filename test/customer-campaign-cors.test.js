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
it('supports the exact hosted staging Studio origin and browser bearer headers while keeping private Cloud Run credentials server-side',async()=>{
 const {loadCorsConfig}=require('../src/activation/cors');
 const config=loadCorsConfig({env:{BIZGENIE_ENVIRONMENT:'staging',CORS_ENABLED:'true',CORS_ALLOWED_ORIGINS:'https://staging-app.getbizgenie.com'}});
 const client=request(createApp({env:{},corsConfig:config,logger:{warn(){},error(){}}}));
 for(const method of ['GET','POST','PUT','PATCH']){
  const r=await client.options('/customer/workspace/brand-brain').set('origin','https://staging-app.getbizgenie.com').set('access-control-request-method',method).set('access-control-request-headers','authorization,content-type');
  assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],'https://staging-app.getbizgenie.com');assert.match(r.headers.vary,/Origin/);
 }
 const denied=await client.get('/customer/workspace').set('origin','https://staging-app.getbizgenie.com');assert.equal(denied.status,401);assert.equal(denied.body.error.code,'AUTHENTICATION_REQUIRED');assert.equal(denied.headers['access-control-allow-origin'],'https://staging-app.getbizgenie.com');assert.match(denied.headers['cache-control'],/no-store/);
 const id='11111111-1111-4111-8111-111111111111',media=`/customer/campaigns/${id}/variants/${id}/revisions/${id}/assets/${id}/preview`;
 const preflight=headers=>client.options(media).set('origin','https://staging-app.getbizgenie.com').set('access-control-request-method','GET').set('access-control-request-headers',headers);
 const range=await preflight('authorization,range');assert.equal(range.status,204);assert.match(range.headers['access-control-expose-headers'],/Content-Range/);
 assert.equal((await preflight('authorization,x-serverless-authorization')).status,403);
 assert.equal((await client.options(media).set('origin','https://attacker.example').set('access-control-request-method','GET')).status,403);
});
it('permits DELETE only on the existing upload removal route for configured staging, preserving production policy',async()=>{
 const {loadCorsConfig}=require('../src/activation/cors');
 const id='11111111-1111-4111-8111-111111111111',origin='https://staging-app.getbizgenie.com';
 for(const environment of ['staging','production']){
  const config=loadCorsConfig({env:{BIZGENIE_ENVIRONMENT:environment,PRODUCTION_ACTIVATION_ENABLED:'true',CORS_ENABLED:'true',CORS_ALLOWED_ORIGINS:origin}}),client=request(createApp({env:{},corsConfig:config}));
  const preflight=path=>client.options(path).set('origin',origin).set('access-control-request-method','DELETE').set('access-control-request-headers','authorization');
  assert.equal((await preflight('/customer/assets/'+id)).status,environment==='staging'?204:403);
  assert.equal((await preflight('/customer/campaigns/'+id)).status,403);
  assert.equal((await client.options('/customer/assets/'+id).set('origin','https://attacker.example').set('access-control-request-method','DELETE')).status,403);
 }
});

it('exact Pages origin configured for staging workspace discovery/bootstrap preserves unauthenticated denial',async()=>{
 const {loadCorsConfig}=require('../src/activation/cors');const origin='https://bizgenie-studio-staging.pages.dev';
 const config=loadCorsConfig({env:{BIZGENIE_ENVIRONMENT:'staging',CORS_ENABLED:'true',CORS_ALLOWED_ORIGINS:origin}});
 const client=request(createApp({env:{},corsConfig:config,logger:{warn(){},error(){}}}));
 for(const [path,method]of [['/customer/workspace','GET'],['/customer/workspace/bootstrap','POST']]){
  const r=await client.options(path).set('origin',origin).set('access-control-request-method',method).set('access-control-request-headers','authorization,content-type');
  assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],origin);
 }
 const r=await client.get('/customer/workspace').set('origin',origin);assert.equal(r.status,401);assert.equal(r.headers['access-control-allow-origin'],origin);
 assert.equal((await client.options('/customer/workspace').set('origin','https://attacker.pages.dev').set('access-control-request-method','GET')).status,403);
});
