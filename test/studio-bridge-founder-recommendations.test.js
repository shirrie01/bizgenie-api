'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {createStudioBridge,founder,other,target,writes}=require('./helpers/founder-bridge');
const scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'};
const path='/customer/campaign-recommendations';
const payload=(over={})=>({...scope,goal:'Book more local consultations',display_timezone:'Europe/London',idempotency_key:'synthetic-recommendation',...over});
function kit(over={},actors={},upstream){
 const iam=[],calls=[],verified=[];
 const verify=async token=>{verified.push(token);if(!['founder','other'].includes(token))throw Error('invalid');return Object.hasOwn(actors,token)?actors[token]:{kind:'customer',auth_user_id:token==='founder'?founder:other,trusted_scope:scope};};
 const app=createStudioBridge({target:{...target,allowFounderRecommendations:true,...over},tokenVerifier:{verifyAccessToken:verify,verifyIdentityAccessToken:verify},iamTokenProvider:async()=>{iam.push(1);return 'synthetic_iam';},fetchImpl:async(url,init)=>{calls.push({url,init});return upstream?upstream(url,init):Response.json({recommendation:{recommendation_id:'synthetic'}},{status:201});}});
 return {app,iam,calls,verified};
}
const post=(k,body=payload(),token='founder',url=path)=>{let r=request(k.app).post(url);if(token)r=r.set('authorization','Bearer '+token);return r.send(body);};
test('exact founder recommendation is admitted after verified scoped identity, preserving customer and IAM separation',async()=>{
 const k=kit();const r=await post(k);assert.equal(r.status,201);assert.equal(k.iam.length,1);assert.equal(k.calls.length,1);assert.deepEqual(k.verified,['founder']);assert.deepEqual(JSON.parse(k.calls[0].init.body),payload());assert.equal(k.calls[0].init.headers.Authorization,'Bearer founder');assert.equal(k.calls[0].init.headers['X-Serverless-Authorization'],'Bearer synthetic_iam');
});
test('permission defaults OFF; configuration cannot enable it in production or alongside broad write gates',async()=>{
 for(const v of [undefined,false]){const k=kit({allowFounderRecommendations:v});assert.equal((await post(k)).status,403);assert.equal(k.verified.length,0);assert.equal(k.iam.length,0);}
 for(const over of [{allowFounderRecommendations:'true'},{allowFounderRecommendations:1},{founderAuthUserId:undefined},{founderAuthUserId:founder+' '},{environment:'production'},...['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'].map(k=>({[k]:true}))])assert.throws(()=>kit(over));
 const {fromEnv}=require('../scripts/staging/studio-bridge');for(const v of ['TRUE','1',' true','yes',''])assert.throws(()=>fromEnv({BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:v}));
});
test('non-founder, invalid token, forged user input and absent trusted scope never reach IAM',async()=>{
 const k=kit();assert.equal((await post(k,payload(),'other')).status,403);for(const t of [null,'expired'])assert.equal((await post(k,payload(),t)).status,401);
 const forged=await request(k.app).post(path).set('authorization','Bearer other').set('x-founder-id',founder).send(payload({auth_user_id:founder}));assert.equal(forged.status,403);assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);
 for(const trusted_scope of [undefined,{}, {...scope,brand_id:undefined},{...scope,tenant_id:''}]){const x=kit({}, {founder:{kind:'customer',auth_user_id:founder,trusted_scope}});assert.equal((await post(x)).status,404);assert.equal(x.iam.length,0);}
});
test('all tenant/project/brand values must be present and match trusted scope; no query or nested spoof bypass',async()=>{
 for(const key of Object.keys(scope))for(const value of [undefined,'foreign',null,[scope[key]]]){const k=kit(),b=payload({[key]:value});assert.equal((await post(k,b)).status,404,key);assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);}
 const k=kit();for(const suffix of ['?tenant_id=tenant_a','/','/extra','%2f','//'])assert.ok([403,404].includes((await post(k,payload(),'founder',path+suffix)).status));
 for(const method of ['put','patch','delete','get'])assert.equal((await request(k.app)[method](path).set('authorization','Bearer founder').send(payload())).status,404);
 assert.equal(k.iam.length,0);
});
test('all unrelated writes stay blocked; onboarding, reads and OPTIONS retain their existing behaviour',async()=>{
 const k=kit();const u='11111111-1111-4111-8111-111111111111';
 for(const p of ['/billing/stripe/checkout','/customer/social/dispatches','/customer/social/oauth-intents','/customer/generation-quotes','/customer/generation-quotes/'+u+'/confirm','/customer/campaigns','/customer/workspace/select','/customer/assets/uploads']){const r=await post(k,payload(),'founder',p);assert.equal(r.status,403,p);assert.equal(r.body.error.code,'STAGING_WRITES_DISABLED');}assert.equal(k.iam.length,0);
 for(const [method,p] of writes){assert.equal((await request(k.app)[method.toLowerCase()](p).set('authorization','Bearer founder').send({})).status,201);assert.equal((await request(k.app)[method.toLowerCase()](p).set('authorization','Bearer other').send({})).status,403);}
 assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer other')).status,201);
 assert.equal((await request(k.app).options(path).set('origin',target.origin).set('access-control-request-method','POST').set('access-control-request-headers','authorization,content-type')).status,204);
 assert.equal((await request(k.app).options(path).set('origin','https://foreign.test').set('access-control-request-method','POST')).status,403);
});
test('rate limiting, 16KiB body cap, invalid JSON and upstream denials remain fail closed',async()=>{
 const rate=kit({maxRequests:1});assert.equal((await post(rate,payload(),'other')).status,403);assert.equal((await post(rate,payload(),'other')).status,429);assert.equal(rate.iam.length,0);assert.equal((await post(rate)).status,201);
 const k=kit();assert.equal((await post(k,payload({goal:'x'.repeat(16384)}))).status,413);assert.equal((await request(k.app).post(path).set('authorization','Bearer founder').set('content-type','application/json').send('{broken')).status,400);assert.equal(k.iam.length,0);
 for(const status of [403,404,409,422,503]){const x=kit({}, {},()=>Response.json({error:{code:'UPSTREAM_DENIED'}},{status}));const r=await post(x);assert.equal(r.status,status);assert.equal(r.body.error.code,'UPSTREAM_DENIED');assert.equal(x.calls.length,1);}
});
test('forwarding retains actual upstream membership/brand authorization, idempotency and validation',async()=>{
 const {createApp}=require('../index');const {InMemoryAuthorizationRepository}=require('../src/authorization');const {InMemoryGoalRecommendationRegistry,InMemoryCampaignMeasurementRegistry}=require('../src/campaigns');
 const auth=new InMemoryAuthorizationRepository({customerProfiles:[{auth_user_id:founder}],tenants:[{tenant_id:scope.tenant_id,name:'Synthetic',created_by:founder}],memberships:[{tenant_id:scope.tenant_id,auth_user_id:founder,role:'owner'}],projects:[{tenant_id:scope.tenant_id,project_id:scope.project_id}],brands:[{project_id:scope.project_id,brand_id:scope.brand_id,status:'approved'}]});
 const api=createApp({authorizationRepository:auth,goalRecommendationRegistry:new InMemoryGoalRecommendationRegistry(),campaignMeasurementRegistry:new InMemoryCampaignMeasurementRegistry(),customerTokenVerifier:{verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:scope})},logger:{info(){},warn(){},error(){}}});
 const k=kit({}, {},async(url,init)=>{const r=await request(api).post(new URL(url).pathname).set('authorization',init.headers.Authorization).send(JSON.parse(init.body));return Response.json(r.body,{status:r.status});});
 const first=await post(k);assert.equal(first.status,201);assert.deepEqual((await post(k)).body,first.body);assert.equal((await post(k,payload({goal:'Changed intent'}))).status,409);assert.equal((await post(k,payload({extra:'reject'}))).status,400);
 // A previously scoped JWT does not bypass current upstream membership revocation.
 auth.getTenantMembership=async()=>null;const revoked=await post(k,payload({idempotency_key:'revoked'}));assert.equal(revoked.status,404);assert.equal(revoked.body.error.code,'RESOURCE_NOT_AVAILABLE');
});

test('server entrypoint wires the new default-OFF permission without enabling other writes',async()=>{
 const {fromEnv}=require('../scripts/staging/studio-bridge');
 const env={BIZGENIE_ENVIRONMENT:'staging',SUPABASE_URL:'https://zrczojyxebwjgpymbmgu.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:target.upstream,BG_BRIDGE_AUDIENCE:target.audience,BG_BRIDGE_REVISION:target.revision,BG_BRIDGE_SOURCE_SHA:target.sourceSha,BG_BRIDGE_REVIEW_REF:target.reviewRef,BG_BRIDGE_STUDIO_ORIGIN:target.origin};
 for(const flag of [undefined,'false','true']){const app=fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:flag,...(flag==='true'?{BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder}:{})});assert.equal((await request(app).post(path).send(payload())).status,flag==='true'?401:403);assert.equal((await request(app).post('/billing/stripe/checkout').send({})).status,403);}
});
