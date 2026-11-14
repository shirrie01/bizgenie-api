const {describe,it,before,after}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createDrainedPool}=require('./helpers/drained-pg-pool');
const {createStudioBridge,founder,other,target}=require('./helpers/founder-bridge');
const {createApp}=require('../index');
const {PostgresAuthorizationRepository,createCustomerActorFromVerifiedIdentity}=require('../src/authorization');
const {PostgresCustomerWorkspaceRepository}=require('../src/customer-workspace');
const {PostgresBrandBrainRepository}=require('../src/brand-brain');
const {PostgresWorkspaceOnboardingRepository}=require('../src/workspace-onboarding');
const url=process.env.TEST_DATABASE_URL;
(url?describe:describe.skip)('founder bridge → real API handlers → disposable PostgreSQL',{concurrency:1},()=>{
 let admin,pool,db,client,scope,foreignScope,forwarded=0;
 before(async()=>{
  admin=createDrainedPool({connectionString:url});
  const lock=await admin.connect();try{await lock.query('select pg_advisory_lock(734921)');await lock.query("do $r$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $r$");}finally{await lock.query('select pg_advisory_unlock(734921)');lock.release();}
  db='founder_'+randomUUID().replaceAll('-','');await admin.query(`create database "${db}"`);const u=new URL(url);u.pathname='/'+db;pool=createDrainedPool({connectionString:u.toString()});
  await pool.query("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select null::uuid'");
  const dir=path.join(__dirname,'../supabase/migrations');for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await pool.query(fs.readFileSync(path.join(dir,file),'utf8'));
  await pool.query('insert into auth.users values($1),($2)',[founder,other]);
  const identity=async token=>{if(!['fresh','scoped','foreign-scope','other'].includes(token))throw Error('invalid');return createCustomerActorFromVerifiedIdentity({verifiedAuthUserId:token==='other'?other:founder,verifiedScope:token==='scoped'?scope:token==='foreign-scope'?foreignScope:undefined});};
  const verifier={verifyIdentityAccessToken:identity,verifyAccessToken:identity};
  const api=createApp({authorizationRepository:new PostgresAuthorizationRepository({pool}),customerWorkspaceRepository:new PostgresCustomerWorkspaceRepository({pool}),brandBrainRepository:new PostgresBrandBrainRepository({pool}),workspaceOnboardingRepository:new PostgresWorkspaceOnboardingRepository({pool}),customerTokenVerifier:verifier,customerScopeProvisioner:{async provisionTrustedScope(){return {requires_session_refresh:true};}},logger:{info(){},warn(){},error(){}}});
  // Dispatch through actual HTTP routers without live network, IAM or Supabase calls.
  const bridge=createStudioBridge({target,tokenVerifier:verifier,iamTokenProvider:async()=> 'synthetic_iam',fetchImpl:async(address,init)=>{forwarded++;const u=new URL(address);let r=request(api)[init.method.toLowerCase()](u.pathname+u.search).set('authorization',init.headers.Authorization);if(init.body)r=r.set('content-type','application/json').send(JSON.parse(init.body.toString()));const response=await r;return Response.json(response.body,{status:response.status});}});
  client=request(bridge);
 });
 after(async()=>{await pool?.end();try{if(db)await admin.query(`drop database "${db}"`);}finally{await admin?.end();}});
 const auth=r=>r.set('authorization','Bearer scoped');
 it('creates once, saves onboarding and Brain, reads both back, preserves retries/CAS/owner/revocation',async()=>{
  const first=await client.post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({business_name:'Synthetic Founder Business'});assert.equal(first.status,201,JSON.stringify(first.body));scope=Object.fromEntries(['tenant_id','project_id','brand_id'].map(k=>[k,first.body.workspace[k]]));
  const replay=await client.post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({business_name:'Duplicate attempt'});assert.equal(replay.status,201);assert.equal(replay.body.workspace.brand_id,scope.brand_id);
  const save={expected_version:0,idempotency_key:'synthetic-save',sector_key:'perfume',sector_source:'customer',draft:{description:'Synthetic customer-written business description'},channels:['website'],channels_source:'customer'};
  const saved=await auth(client.put('/customer/workspace/onboarding')).send(save);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.onboarding.version,1);
  const retried=await auth(client.put('/customer/workspace/onboarding')).send(save);assert.equal(retried.status,200);assert.equal(retried.body.replayed,true);
  const stale=await auth(client.put('/customer/workspace/onboarding')).send({...save,idempotency_key:'stale-save'});assert.equal(stale.status,409);
  const correction={name:'Synthetic Founder Business',identity:{description:'Verified synthetic Brain description'}};
  const brain=await auth(client.put('/customer/workspace/brand-brain')).send(correction);assert.equal(brain.status,200,JSON.stringify(brain.body));
  assert.equal((await auth(client.get('/customer/workspace/brand-brain'))).body.brand_brain.identity.description,correction.identity.description);
  assert.equal((await auth(client.get('/customer/workspace/onboarding'))).body.onboarding.draft.description,save.draft.description);
  assert.equal((await client.get('/customer/workspace').set('authorization','Bearer fresh')).body.workspace.brand_id,scope.brand_id);
  assert.equal((await auth(client.put('/customer/workspace/onboarding')).send({...save,idempotency_key:'invalid',expected_version:1,unrecognised:true})).status,400);
  assert.equal((await client.post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({business_name:'x',auth_user_id:other})).status,400);
  const fscope=await new PostgresCustomerWorkspaceRepository({pool}).bootstrapWorkspace({auth_user_id:other,business_name:'Foreign synthetic business'});foreignScope=Object.fromEntries(['tenant_id','project_id','brand_id'].map(k=>[k,fscope[k]]));
  for(const endpoint of ['onboarding','brand-brain']){const r=await client.put('/customer/workspace/'+endpoint).set('authorization','Bearer foreign-scope').send(endpoint==='onboarding'?{...save,idempotency_key:'foreign'}:correction);assert.equal(r.status,403,JSON.stringify(r.body));}
  const before=forwarded;assert.equal((await client.put('/customer/workspace/brand-brain').set('authorization','Bearer other').send(correction)).status,403);assert.equal(forwarded,before);
  await pool.query("update tenant_memberships set role='member' where tenant_id=$1 and auth_user_id=$2",[scope.tenant_id,founder]);
  assert.equal((await auth(client.put('/customer/workspace/onboarding')).send({...save,expected_version:1,idempotency_key:'member'})).status,403);
  assert.equal((await auth(client.put('/customer/workspace/brand-brain')).send({...correction,name:'Forbidden identity change'})).status,403);
  await pool.query('delete from tenant_memberships where tenant_id=$1 and auth_user_id=$2',[scope.tenant_id,founder]);
  for(const endpoint of ['onboarding','brand-brain'])assert.equal((await auth(client.put('/customer/workspace/'+endpoint)).send(endpoint==='onboarding'?{...save,expected_version:1,idempotency_key:'revoked'}:correction)).status,403);
  assert.equal((await client.post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({business_name:'Revoked replay'})).status,503);
  assert.equal((await pool.query('select count(*)::int as n from tenant_memberships where auth_user_id=$1',[founder])).rows[0].n,0);
 });
});
