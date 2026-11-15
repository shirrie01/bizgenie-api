// Synthetic Fonzo-style workflow. Real routers/repositories/PG; fake verified identities/Auth admin only.
// No bridge write gates, providers, Stripe, OAuth, network services or live business data are enabled.
const {describe,it,before,after}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createDrainedPool}=require('./helpers/drained-pg-pool');
const {createApp}=require('../index');
const {AuthenticationRequiredError,PostgresAuthorizationRepository,createCustomerActorFromVerifiedIdentity}=require('../src/authorization');
const {PostgresCustomerWorkspaceRepository}=require('../src/customer-workspace');
const {PostgresBrandBrainRepository}=require('../src/brand-brain');
const {PostgresWorkspaceOnboardingRepository}=require('../src/workspace-onboarding');
const {PostgresCampaignRepository,PostgresGoalRecommendationRegistry,InMemoryCampaignMeasurementRegistry}=require('../src/campaigns');
const user='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',now=()=>new Date('2026-11-15T12:00:00.000Z');
const url=process.env.TEST_DATABASE_URL;
(url?describe:describe.skip)('synthetic Fonzo-style golden journey in disposable PostgreSQL',{concurrency:1},()=>{
 let admin,pool,db,client,scope,foreignScope,campaignId,itemBody,version,variantId;
 const scopes={};
 function makeClient(){
  const verify=async token=>{const id=['fresh','session-one','session-two'].includes(token)?user:token==='foreign'?foreign:null;if(!id)throw new AuthenticationRequiredError();return createCustomerActorFromVerifiedIdentity({verifiedAuthUserId:id,...(token!=='fresh'&&scopes[id]?{verifiedScope:scopes[id]}:{})});};
  const app=createApp({authorizationRepository:new PostgresAuthorizationRepository({pool}),customerWorkspaceRepository:new PostgresCustomerWorkspaceRepository({pool}),brandBrainRepository:new PostgresBrandBrainRepository({pool}),workspaceOnboardingRepository:new PostgresWorkspaceOnboardingRepository({pool}),campaignRepository:new PostgresCampaignRepository({pool,now}),goalRecommendationRegistry:new PostgresGoalRecommendationRegistry({pool,now}),campaignMeasurementRegistry:new InMemoryCampaignMeasurementRegistry(),customerTokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},customerScopeProvisioner:{async provisionTrustedScope({auth_user_id,trusted_scope}){scopes[auth_user_id]=trusted_scope;return {requires_session_refresh:true};}},logger:{info(){},warn(){},error(){}},scriptGenerator:async()=>{throw Error('No provider call authorised in this journey');}});
  return request(app);
 }
 before(async()=>{
  admin=createDrainedPool({connectionString:url});const c=await admin.connect();try{await c.query('select pg_advisory_lock(734921)');await c.query("do $r$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $r$");}finally{await c.query('select pg_advisory_unlock(734921)');c.release();}
  db='golden_'+randomUUID().replaceAll('-','');await admin.query(`create database "${db}"`);const local=new URL(url);local.pathname='/'+db;pool=createDrainedPool({connectionString:local.toString()});
  await pool.query("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select null::uuid'");
  const dir=path.join(__dirname,'../supabase/migrations');for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await pool.query(fs.readFileSync(path.join(dir,file),'utf8'));
  await pool.query('insert into auth.users values($1),($2)',[user,foreign]);client=makeClient();
 });
 after(async()=>{await pool?.end();try{if(db)await admin.query(`drop database "${db}"`);}finally{await admin?.end();}});
 const auth=(r,token='session-one')=>r.set('authorization','Bearer '+token);
 const readScope=()=>({tenant_id:scope.tenant_id,project_id:scope.project_id});
 it('creates once; resumes onboarding in a fresh app/session; confirms Brain and objective; persists recommendation→campaign→content→calendar',async()=>{
  assert.equal((await client.get('/customer/workspace')).status,401);
  assert.equal((await auth(client.get('/customer/workspace'),'fresh')).body.status,'missing_workspace');
  const created=await auth(client.post('/customer/workspace/bootstrap'),'fresh').send({business_name:'Synthetic Fonzo-style Lab'});assert.equal(created.status,201,JSON.stringify(created.body));scope=Object.fromEntries(['tenant_id','project_id','brand_id'].map(k=>[k,created.body.workspace[k]]));
  const again=await auth(client.post('/customer/workspace/bootstrap'),'fresh').send({business_name:'Do not create another'});assert.equal(again.status,201);assert.equal(again.body.workspace.brand_id,scope.brand_id);
  const draft={idempotency_key:'golden.partial',expected_version:0,current_step:3,sector_key:'perfume',sector_source:'customer',channels:['email'],channels_source:'customer',draft:{business_name:'Synthetic Fonzo-style Lab',description:'Synthetic independent maker for local customers',goal:'Get more customers for my business'}};
  const saved=await auth(client.put('/customer/workspace/onboarding')).send(draft);assert.equal(saved.status,200);assert.equal(saved.body.onboarding.version,1);
  const incomplete=await auth(client.put('/customer/workspace/onboarding')).send({idempotency_key:'golden.incomplete',expected_version:1,complete:true});assert.equal(incomplete.status,422,'draft description must not silently become confirmed Brand Brain');
  client=makeClient();const resumed=await auth(client.get('/customer/workspace/onboarding'),'session-two');assert.equal(resumed.body.onboarding.draft.goal,draft.draft.goal);assert.equal(resumed.body.onboarding.current_step,3);assert.equal(resumed.body.onboarding.version,1);
  const replay=await auth(client.put('/customer/workspace/onboarding'),'session-two').send(draft);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
  const stale=await auth(client.put('/customer/workspace/onboarding')).send({...draft,idempotency_key:'golden.stale'});assert.equal(stale.status,409);
  const brain=await auth(client.put('/customer/workspace/brand-brain')).send({name:'Synthetic Fonzo-style Lab',identity:{description:draft.draft.description},audience:{summary:'Synthetic local customers'}});assert.equal(brain.status,200,JSON.stringify(brain.body));
  const complete=await auth(client.put('/customer/workspace/onboarding')).send({idempotency_key:'golden.confirm',expected_version:1,complete:true});assert.equal(complete.status,200,JSON.stringify(complete.body));assert.equal(complete.body.onboarding.status,'completed');
  const goal={...scope,goal:draft.draft.goal,display_timezone:'Europe/London',idempotency_key:'golden.recommendation'};
  const recommendation=await auth(client.post('/customer/campaign-recommendations')).send(goal);assert.equal(recommendation.status,201,JSON.stringify(recommendation.body));assert.equal(recommendation.body.recommendation.not_enough_data_yet,true,'no fabricated performance evidence');
  const recommendationAgain=await auth(client.post('/customer/campaign-recommendations')).send(goal);assert.deepEqual(recommendationAgain.body.recommendation,recommendation.body.recommendation);
  const create={...recommendation.body.recommendation.create_campaign_payload,idempotency_key:'golden.campaign'};
  const made=await auth(client.post('/customer/campaigns')).send(create);assert.equal(made.status,201,JSON.stringify(made.body));campaignId=made.body.campaign.campaign_id;version=made.body.result.campaign_version;
  assert.equal((await auth(client.post('/customer/campaigns')).send(create)).body.campaign.campaign_id,campaignId);
  const suggested=recommendation.body.recommendation.suggested_items.find(i=>i.format==='text');assert.ok(suggested);
  itemBody={...readScope(),idempotency_key:'golden.item',expected_campaign_version:version,name:suggested.name,format:suggested.format,platform:suggested.platform,placement:suggested.placement,destination_label:suggested.destination_label,initial_content:{title:null,body:'Synthetic customer-written first campaign draft',caption:null,alt_text:null,asset_refs:[]}};
  const item=await auth(client.post(`/customer/campaigns/${campaignId}/content-items`)).send(itemBody);assert.equal(item.status,201,JSON.stringify(item.body));variantId=item.body.result.created_ids.variant_ids[0];version=item.body.result.campaign_version;
  assert.equal((await auth(client.post(`/customer/campaigns/${campaignId}/content-items`)).send(itemBody)).body.result.created_ids.variant_ids[0],variantId);
  client=makeClient();const detail=await auth(client.get(`/customer/campaigns/${campaignId}`).query(readScope()),'session-two');assert.equal(detail.status,200);assert.equal(detail.body.campaign.items[0].variants[0].current_content.body,itemBody.initial_content.body);
  const calendar=await auth(client.get('/customer/calendar').query({...readScope(),from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z'}),'session-two');assert.equal(calendar.status,200,JSON.stringify(calendar.body));assert.ok(calendar.body.unscheduled.some(x=>x.variant_id===variantId&&x.campaign_id===campaignId));assert.equal(calendar.body.entries.length,0,'no schedule/publication created');
  assert.equal((await auth(client.get('/customer/workspace'),'session-two')).body.workspace.brand_id,scope.brand_id);
  assert.equal((await auth(client.get('/customer/workspace/brand-brain'),'session-two')).body.brand_brain.identity.description,draft.draft.description);
  assert.equal((await auth(client.get('/customer/workspace/onboarding'),'session-two')).body.onboarding.status,'completed');
  assert.equal((await pool.query('select count(*)::int n from campaign_goal_recommendations')).rows[0].n,1);assert.equal((await pool.query('select count(*)::int n from campaigns')).rows[0].n,1);
 });
 it('retains invalid/stale rejection and foreign calendar/campaign/Brain isolation',async()=>{
  assert.equal((await auth(client.put('/customer/workspace/onboarding')).send({expected_version:2,idempotency_key:'invalid',unexpected:true})).status,400);
  const staleItem=await auth(client.post(`/customer/campaigns/${campaignId}/content-items`)).send({...itemBody,idempotency_key:'golden.stale.item'});assert.equal(staleItem.status,409);
  const outsider=await auth(client.post('/customer/workspace/bootstrap'),'foreign').send({business_name:'Synthetic unrelated business'});assert.equal(outsider.status,201);foreignScope=scopes[foreign];
  for(const route of [`/customer/campaigns/${campaignId}`,'/customer/calendar']){const q=route.endsWith('calendar')?{...readScope(),from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z'}:readScope();assert.equal((await auth(client.get(route).query(q),'foreign')).status,404);}
  assert.notEqual((await auth(client.get('/customer/workspace/brand-brain'),'foreign')).body.brand_brain.brand_id,scope.brand_id);
  assert.equal((await auth(client.post('/customer/campaigns'),'foreign').send({...scope,name:'Foreign attempt',goal:'x',display_timezone:'UTC',idempotency_key:'foreign'})).status,404);
 });
 it('membership revocation denies reads/writes with stale sessions and cannot recreate ownership on replay',async()=>{
  await pool.query('delete from tenant_memberships where tenant_id=$1 and auth_user_id=$2',[scope.tenant_id,user]);
  assert.equal((await auth(client.get(`/customer/campaigns/${campaignId}`).query(readScope()))).status,404);
  assert.equal((await auth(client.put('/customer/workspace/brand-brain')).send({name:'Forbidden',identity:{description:'Forbidden'}})).status,403);
  assert.equal((await auth(client.put('/customer/workspace/onboarding')).send({expected_version:2,idempotency_key:'revoked',draft:{goal:'Forbidden'}})).status,403);
  assert.equal((await auth(client.post('/customer/workspace/bootstrap'),'fresh').send({business_name:'Resurrect'})).status,503);
  assert.equal((await pool.query('select count(*)::int n from tenant_memberships where tenant_id=$1 and auth_user_id=$2',[scope.tenant_id,user])).rows[0].n,0);
 });
});
