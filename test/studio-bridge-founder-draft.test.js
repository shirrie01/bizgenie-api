'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target,writes}=require('./helpers/founder-bridge');
const campaign='33333333-3333-4333-8333-333333333333',variant='44444444-4444-4444-8444-444444444444',foreignCampaign='55555555-5555-4555-8555-555555555555';
const scope={tenant_id:'t',project_id:'p',brand_id:'b'},binding={...scope,campaign_id:campaign};
const routes=[`/customer/campaigns/${campaign}/content-items`,...['review','preview-renders','preview-acknowledgements','approval','schedule','reschedule','unschedule'].map(x=>`/customer/campaigns/${campaign}/variants/${variant}/${x}`)];
const body={tenant_id:'t',project_id:'p',idempotency_key:'synthetic',expected_campaign_version:1};
function kit(over={},actors={},response){
 const iam=[],calls=[],verified=[];
 const verify=async t=>{verified.push(t);if(!['founder','other'].includes(t))throw Error();return Object.hasOwn(actors,t)?actors[t]:{kind:'customer',auth_user_id:t==='founder'?founder:other,trusted_scope:scope};};
 const app=createStudioBridge({target:{...target,allowFounderDraftWorkflow:true,founderDraftScope:binding,...over},tokenVerifier:{verifyAccessToken:verify,verifyIdentityAccessToken:verify},iamTokenProvider:async()=>{iam.push(1);return 'synthetic_iam';},fetchImpl:async(u,i)=>{calls.push({u,i});return response?response(u,i):Response.json({status:'synthetic_ok'});}});
 return {app,iam,calls,verified};
}
const post=(k,p=routes[0],b=body,t='founder')=>{let r=request(k.app).post(p);if(t)r=r.set('authorization','Bearer '+t);return r.send(b);};
test('only eight exact founder campaign draft/review/calendar routes forward after verified scope',async()=>{
 const k=kit();assert.equal(routes.length,8);
 for(const p of routes)assert.equal((await post(k,p)).status,200,p);
 assert.equal(k.calls.length,8);assert.equal(k.iam.length,8);assert.equal(k.verified.length,8);
 for(const c of k.calls){assert.equal(c.i.headers.Authorization,'Bearer founder');assert.equal(c.i.headers['X-Serverless-Authorization'],'Bearer synthetic_iam');assert.deepEqual(JSON.parse(c.i.body),body);}
});
test('absent/OFF is denied; malformed/inconsistent config and paid/broad permission conflicts refuse startup',async()=>{
 for(const v of [undefined,false]){const k=kit({allowFounderDraftWorkflow:v,founderDraftScope:undefined});assert.equal((await post(k)).status,403);assert.equal(k.verified.length,0);assert.equal(k.iam.length,0);}
 for(const patch of [{allowFounderDraftWorkflow:'true'},{allowFounderDraftWorkflow:1},{founderAuthUserId:undefined},{founderDraftScope:undefined},{founderDraftScope:{...binding,campaign_id:'bad'}},{founderDraftScope:{...binding,brand_id:undefined}},{founderDraftScope:{...binding,tenant_id:' t'}},{founderDraftScope:{...binding,extra:true}},{environment:'production'},{founderVideo:{}},...['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'].map(k=>({[k]:true}))])assert.throws(()=>kit(patch));
 assert.throws(()=>kit({allowFounderCampaignRoot:true,founderCampaign:{tenant_id:'foreign',project_id:'p',brand_id:'b',body_sha256:'a'.repeat(64)}}));
 assert.throws(()=>kit({allowFounderDraftWorkflow:false}),'stale binding cannot silently enable anything');
});
test('verified non-founder, absent/expired auth and forged identity cannot reach IAM/upstream',async()=>{
 for(const p of routes){const k=kit();for(const t of ['other','expired',null])assert.equal((await post(k,p,{...body,auth_user_id:founder},t)).status,t==='other'?403:401);assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);}
 const k=kit();assert.equal((await request(k.app).post(routes[0]).set('authorization','Bearer other').set('x-founder-id',founder).send(body)).status,403);assert.equal(k.iam.length,0);
});
test('trusted tenant/project/brand, required body scope and approved campaign are independently pinned pre-IAM',async()=>{
 for(const key of Object.keys(scope)){const k=kit({}, {founder:{kind:'customer',auth_user_id:founder,trusted_scope:{...scope,[key]:'foreign'}}});const b={...body,...(key==='brand_id'?{}:{[key]:'foreign'})};assert.equal((await post(k,routes[0],b)).status,404);assert.equal(k.iam.length,0);}
 for(const b of [{...body,tenant_id:undefined},{...body,project_id:undefined},{...body,tenant_id:'foreign'},{...body,project_id:['p']},{...body,brand_id:'foreign'}]){const k=kit();assert.equal((await post(k,routes[0],b)).status,404);assert.equal(k.iam.length,0);}
 for(const trusted_scope of [undefined,{}, {tenant_id:'t',project_id:'p'}]){const k=kit({}, {founder:{kind:'customer',auth_user_id:founder,trusted_scope}});assert.equal((await post(k)).status,404);assert.equal(k.iam.length,0);}
 const k=kit();for(const p of routes)assert.equal((await post(k,p.replace(campaign,foreignCampaign))).status,404);assert.equal(k.iam.length,0);
});
test('query, encoding, suffix and alternate method variants cannot bypass exact route matching',async()=>{
 const k=kit();for(const p of routes){for(const suffix of ['?tenant_id=t','/','/extra','%2f','//']){const r=await post(k,p+suffix);assert.ok([403,404].includes(r.status),p+suffix);}
 for(const method of ['put','patch','delete','get'])assert.equal((await request(k.app)[method](p).set('authorization','Bearer founder').send(body)).status,404);}
 assert.equal(k.iam.length,0);
});
test('founder draft flag never opens root/recommendation/workspace/provider/social/Stripe/media/other mutations',async()=>{
 const k=kit({allowFounderOnboarding:false});
 const paths=['/customer/campaigns','/customer/campaign-recommendations','/customer/workspace/bootstrap','/customer/workspace/select','/customer/workspace/brands','/billing/stripe/checkout','/customer/generation-quotes',`/customer/generation-quotes/${variant}/confirm`,'/customer/social/dispatches','/customer/social/oauth-intents','/customer/assets/uploads',`/customer/campaigns/${campaign}/archive`,`/customer/campaigns/${campaign}/variants/${variant}/measurements`,`/customer/campaigns/${campaign}/variants/${variant}/manual-publication/confirm`,`/customer/campaigns/${campaign}/variants/${variant}/revisions`];
 for(const p of paths)assert.ok([403,404].includes((await post(k,p)).status),p);
 for(const p of ['/customer/workspace/onboarding','/customer/workspace/brand-brain'])assert.equal((await request(k.app).put(p).set('authorization','Bearer founder').send(body)).status,403);
 assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);
});
test('body cap/JSON/type, per-user rates, CORS and upstream rejection contracts remain intact',async()=>{
 const k=kit();assert.equal((await post(k,routes[0],{...body,copy:'x'.repeat(16384)})).status,413);assert.equal((await request(k.app).post(routes[0]).set('authorization','Bearer founder').set('content-type','application/json').send('{bad')).status,400);assert.equal((await request(k.app).post(routes[0]).set('authorization','Bearer founder').set('content-type','text/plain').send('bad')).status,415);assert.equal(k.iam.length,0);
 const rate=kit({maxRequests:1});assert.equal((await post(rate,routes[0],body,'other')).status,403);assert.equal((await post(rate,routes[0],body,'other')).status,429);assert.equal(rate.iam.length,0);assert.equal((await post(rate)).status,200);
 assert.equal((await request(k.app).options(routes[0]).set('origin',target.origin).set('access-control-request-method','POST').set('access-control-request-headers','authorization,content-type')).status,204);
 assert.equal((await request(k.app).options(routes[0]).set('origin','https://foreign.test').set('access-control-request-method','POST')).status,403);
 for(const status of [403,404,409,422,503]){const x=kit({}, {},()=>Response.json({error:{code:'EXISTING_API_DENIAL'}},{status}));const r=await post(x);assert.equal(r.status,status);assert.equal(r.body.error.code,'EXISTING_API_DENIAL');assert.equal(x.calls.length,1);}
});
test('existing onboarding/recommendation/root permissions remain independently compatible',async()=>{
 const {KEY,bodyHash}=require('../src/studio-bridge/founderCampaign');const root={...scope,name:'Synthetic root',goal:'Local enquiries',display_timezone:'UTC',idempotency_key:KEY};
 const k=kit({allowFounderCampaignRoot:true,allowFounderRecommendations:true,founderCampaign:{...scope,body_sha256:bodyHash(root)}});
 for(const [m,p]of writes)assert.equal((await request(k.app)[m.toLowerCase()](p).set('authorization','Bearer founder').send({})).status,200);
 assert.equal((await post(k,'/customer/campaign-recommendations',{...scope,goal:'Local enquiries',idempotency_key:'synthetic'})).status,200);
 assert.equal((await post(k,'/customer/campaigns',root)).status,200);
 assert.equal((await post(k)).status,200);
 assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer other')).status,200);
});
test('server entrypoint is default OFF and strictly requires full draft binding for explicit activation',async()=>{
 const {fromEnv}=require('../scripts/staging/studio-bridge');const env={BIZGENIE_ENVIRONMENT:'staging',SUPABASE_URL:'https://zrczojyxebwjgpymbmgu.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:target.upstream,BG_BRIDGE_AUDIENCE:target.audience,BG_BRIDGE_REVISION:target.revision,BG_BRIDGE_SOURCE_SHA:target.sourceSha,BG_BRIDGE_REVIEW_REF:target.reviewRef,BG_BRIDGE_STUDIO_ORIGIN:target.origin};
 const vars={BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder,...Object.fromEntries(Object.entries(binding).map(([k,v])=>['BG_BRIDGE_FOUNDER_DRAFT_'+k.toUpperCase(),v]))};
 for(const flag of [undefined,'false','true']){const app=fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:flag,...(flag==='true'?vars:{})});assert.equal((await request(app).post(routes[0]).send(body)).status,flag==='true'?401:403);}
 for(const flag of ['TRUE','1','',' true'])assert.throws(()=>fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:flag,...vars}));
 for(const key of Object.keys(vars)){const bad={...env,...vars,BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:'true'};delete bad[key];assert.throws(()=>fromEnv(bad));}
 assert.throws(()=>fromEnv({...env,...vars,BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:'false'}));
});

test('raw HTTP preserves an empty query marker and the founder draft gate rejects it',async()=>{
 const k=kit(),server=k.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const status=await new Promise((resolve,reject)=>{const req=require('node:http').request({hostname:'127.0.0.1',port:server.address().port,path:routes[0]+'?',method:'POST',headers:{authorization:'Bearer founder','content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify(body));});assert.equal(status,403);assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
async function apiFixture(){
 const {createApp}=require('../index');
 const {InMemoryCampaignRepository}=require('../src/campaigns');
 const {InMemoryAuthorizationRepository}=require('../src/authorization');
 const {scenario,previewReceipt,NOW}=require('./helpers/campaign-regressions');
 const {randomUUID}=require('node:crypto');
 const actualScope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'};
 let active=true;
 const repo=new InMemoryCampaignRepository({now:()=>new Date(NOW),authorize:async()=>active,validatePreview:async()=>true,resolvePreviewReceipt:previewReceipt,captureBrandSnapshot:async()=>({brand_snapshot_id:randomUUID(),...actualScope,snapshot:{name:'Synthetic'},snapshot_hash:'a'.repeat(64)})});
 const s=await scenario(repo),actor={kind:'customer',auth_user_id:founder,trusted_scope:actualScope};
 const auth=new InMemoryAuthorizationRepository({customerProfiles:[{auth_user_id:founder}],tenants:[{tenant_id:actualScope.tenant_id,created_by:founder}],memberships:[{tenant_id:actualScope.tenant_id,auth_user_id:founder,role:'owner'}],projects:[{tenant_id:actualScope.tenant_id,project_id:actualScope.project_id}],brands:[{project_id:actualScope.project_id,brand_id:actualScope.brand_id,status:'approved'}]});
 const verifier={verifyAccessToken:async t=>{if(t!=='founder')throw Error();return actor;}};
 const api=createApp({campaignRepository:repo,authorizationRepository:auth,customerTokenVerifier:verifier,logger:{info(){},warn(){},error(){}}});
 const k=kit({founderDraftScope:{...actualScope,campaign_id:s.id}},{founder:actor},async(u,i)=>{const r=await request(api).post(new URL(u).pathname).set('authorization',i.headers.Authorization).send(JSON.parse(i.body));return Response.json(r.body,{status:r.status});});
 return {k,s,repo,actualScope,revoke(){active=false;auth.getTenantMembership=async()=>null;}};
}
test('actual API persists synthetic content drafts once with retained revision/CAS and strict validation',async()=>{
 const f=await apiFixture(),before=await f.s.get();
 const b={tenant_id:f.actualScope.tenant_id,project_id:f.actualScope.project_id,idempotency_key:'synthetic-draft-once',expected_campaign_version:before.version,name:'Customer draft',format:'text',platform:'instagram',placement:'feed',destination_label:'Synthetic',initial_content:{title:null,body:'Customer-written draft CTA',caption:null,alt_text:null,asset_refs:[]}};
 const p=`/customer/campaigns/${f.s.id}/content-items`,saved=await post(f.k,p,b);assert.equal(saved.status,201,JSON.stringify(saved.body));assert.equal(saved.body.campaign.items[0].variants[0].workflow,'draft');assert.equal(saved.body.campaign.items[0].variants[0].current_content.body,b.initial_content.body);
 const replay=await post(f.k,p,b);assert.equal(replay.status,201);assert.equal(replay.body.campaign.version,saved.body.campaign.version);assert.equal(replay.body.campaign.items.length,1);
 const after=structuredClone(f.repo.state.campaigns.get(f.s.id));assert.equal((await post(f.k,p,{...b,idempotency_key:'stale-draft'})).status,409);assert.deepEqual(f.repo.state.campaigns.get(f.s.id),after);
 assert.equal((await post(f.k,p,{...b,idempotency_key:'extra',extra:true})).status,400);assert.deepEqual(f.repo.state.campaigns.get(f.s.id),after);
});
test('actual API schedules only an approved current revision; stale and revoked requests change nothing',async()=>{
 const f=await apiFixture(),t=await f.s.add(),a=await f.s.approve(t),before=await f.s.get();
 const p=`/customer/campaigns/${f.s.id}/variants/${t.variant_id}/schedule`;
 const b={tenant_id:f.actualScope.tenant_id,project_id:f.actualScope.project_id,idempotency_key:'synthetic-calendar',expected_campaign_version:before.version,revision_id:t.revision_id,scheduled_for:'2026-09-03T11:00:00.000Z',timezone:'UTC',local_datetime:'2026-09-03T11:00:00.000',utc_offset_minutes:0};
 const saved=await post(f.k,p,b);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.campaign.items[0].variants[0].workflow,'scheduled');
 const after=structuredClone(f.repo.state.campaigns.get(f.s.id));assert.equal(after.schedules.size,1);assert.equal(after.publications.size,0);assert.equal(after.platform_publications?.size||0,0);
 assert.equal((await post(f.k,p,{...b,idempotency_key:'stale-schedule'})).status,409);assert.deepEqual(f.repo.state.campaigns.get(f.s.id),after);
 f.revoke();assert.equal((await post(f.k,p,b)).status,404);assert.deepEqual(f.repo.state.campaigns.get(f.s.id),after);
});
