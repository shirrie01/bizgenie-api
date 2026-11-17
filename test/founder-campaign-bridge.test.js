'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target,writes}=require('./helpers/founder-bridge');
const {KEY,bodyHash}=require('../src/studio-bridge/founderCampaign');
const scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'};
const body={...scope,name:'Synthetic root',goal:'Get more local enquiries',display_timezone:'Europe/London',idempotency_key:KEY};
function kit(over={},actor,upstream){const calls=[],iam=[];const verify=async token=>{if(!['founder','other'].includes(token))throw Error();return actor||{kind:'customer',auth_user_id:token==='founder'?founder:other,trusted_scope:scope};};const app=createStudioBridge({target:{...target,allowFounderCampaignRoot:true,founderCampaign:{...scope,body_sha256:bodyHash(body)},...over},tokenVerifier:{verifyAccessToken:verify,verifyIdentityAccessToken:verify},iamTokenProvider:async()=>{iam.push(1);return 'synthetic_iam';},fetchImpl:async(u,i)=>{calls.push({u,i});return upstream?upstream(u,i):Response.json({campaign:{campaign_id:'synthetic'}},{status:201});}});return {app,calls,iam};}
const send=(k,b=body,t='founder',p='/customer/campaigns')=>{let r=request(k.app).post(p);if(t)r=r.set('authorization','Bearer '+t);return r.send(b);};
test('seven-field hash is order-stable, exact, and uses one recommendation-independent campaign key',()=>{
 assert.equal(KEY,'bg-r2-founder-campaign-v1');assert.equal(bodyHash(body),bodyHash(Object.fromEntries(Object.entries(body).reverse())));
 for(const k of ['name','goal','display_timezone','tenant_id','project_id','brand_id'])assert.notEqual(bodyHash({...body,[k]:k==='display_timezone'?'UTC':body[k]+'x'}),bodyHash(body));
 for(const b of [{...body,extra:1},{...body,tenant_id:' tenant_a'},{...body,idempotency_key:'rec:another:campaign'},{...body,name:''},{...body,goal:'x'.repeat(2001)}])assert.throws(()=>bodyHash(b));
});
test('exact founder body passes only after scope verification; other users and mismatches never reach IAM',async()=>{
 const k=kit();assert.equal((await send(k)).status,201);assert.equal(k.iam.length,1);assert.deepEqual(JSON.parse(k.calls[0].i.body),body);
 for(const t of ['other',null,'expired']){const x=kit();assert.equal((await send(x,body,t)).status,t==='other'?403:401);assert.equal(x.iam.length,0);}
 for(const key of Object.keys(scope)){for(const v of ['foreign',undefined]){const x=kit();assert.equal((await send(x,{...body,[key]:v})).status,404);assert.equal(x.iam.length,0);}const x=kit({}, {kind:'customer',auth_user_id:founder,trusted_scope:{...scope,[key]:'foreign'}});assert.equal((await send(x,{...body,[key]:'foreign'})).status,404);assert.equal(x.iam.length,0);}
 const x=kit({}, {kind:'customer',auth_user_id:founder});assert.equal((await send(x)).status,404);assert.equal(x.iam.length,0);
});
test('arbitrary intent/key, payload extras, query variants and unrelated routes stay denied',async()=>{
 const k=kit();for(const [b,status] of [[{...body,name:'Different campaign'},403],[{...body,idempotency_key:'different'},400],[{...body,recommendation_id:'untrusted'},400]])assert.equal((await send(k,b)).status,status);
 for(const p of ['/customer/campaigns?x=1','/customer/campaigns/','/customer/campaigns/discovery','/billing/stripe/checkout','/customer/generation-quotes','/customer/social/dispatches','/customer/assets/uploads'])assert.ok([403,404].includes((await send(k,body,'founder',p)).status));assert.equal(k.iam.length,0);
 const u='11111111-1111-4111-8111-111111111111';assert.equal((await send(k,body,'founder','/customer/campaigns/'+u+'/content-items')).status,403);
 for(const [m,p] of writes)assert.equal((await request(k.app)[m.toLowerCase()](p).set('authorization','Bearer founder').send({})).status,201);
});
test('default OFF, strict config, per-user rates and 16KiB cap retain all fail-closed gates',async()=>{
 for(const flag of [undefined,false]){const k=kit({allowFounderCampaignRoot:flag,founderCampaign:undefined});assert.equal((await send(k)).status,403);assert.equal(k.iam.length,0);}
 for(const patch of [{allowFounderCampaignRoot:'true'},{founderVideo:{}},{founderAuthUserId:undefined},{founderCampaign:undefined},{environment:'production'},...['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'].map(k=>({[k]:true}))])assert.throws(()=>kit(patch));
 const k=kit({maxRequests:1});assert.equal((await send(k,body,'other')).status,403);assert.equal((await send(k,body,'other')).status,429);assert.equal(k.iam.length,0);assert.equal((await send(k)).status,201);
 const x=kit();assert.equal((await send(x,{...body,goal:'x'.repeat(16384)})).status,413);assert.equal(x.iam.length,0);
});
test('actual API keeps current owner checks and durable-command-style replay semantics',async()=>{
 const {createApp}=require('../index');const {InMemoryAuthorizationRepository}=require('../src/authorization');const {InMemoryCampaignRepository}=require('../src/campaigns');
 let active=true;const auth=new InMemoryAuthorizationRepository({customerProfiles:[{auth_user_id:founder}],tenants:[{tenant_id:scope.tenant_id,created_by:founder}],memberships:[{tenant_id:scope.tenant_id,auth_user_id:founder,role:'owner'}],projects:[{project_id:scope.project_id,tenant_id:scope.tenant_id}],brands:[{brand_id:scope.brand_id,project_id:scope.project_id,status:'approved'}]});
 const repo=new InMemoryCampaignRepository({authorize:async()=>active,captureBrandSnapshot:async()=>({brand_snapshot_id:require('node:crypto').randomUUID(),...scope,snapshot:{name:'Synthetic'},snapshot_hash:'a'.repeat(64)})});
 const api=createApp({authorizationRepository:auth,campaignRepository:repo,customerTokenVerifier:{verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:scope})},logger:{info(){},warn(){},error(){}}});
 const k=kit({},undefined,async(u,i)=>{const r=await request(api).post('/customer/campaigns').set('authorization',i.headers.Authorization).send(JSON.parse(i.body));return Response.json(r.body,{status:r.status});});
 const responses=await Promise.all([send(k),send(k)]);assert.equal(responses[0].status,201);assert.equal(responses[1].status,201);assert.equal(responses[0].body.campaign.campaign_id,responses[1].body.campaign.campaign_id);assert.equal(repo.state.campaigns.size,1);
 active=false;auth.getTenantMembership=async()=>null;assert.equal((await send(k)).status,404);assert.equal(repo.state.campaigns.size,1);
});
