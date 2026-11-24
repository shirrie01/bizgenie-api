const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target}=require('./helpers/founder-bridge');
const {binding:videoBinding,MODEL}=require('../src/provider-spend/founderVideo');
const campaign='55555555-5555-4555-8555-555555555555',variant='66666666-6666-4666-8666-666666666666';
const quote='33333333-3333-4333-8333-333333333333',scope={tenant_id:'tenant',project_id:'project',brand_id:'brand'};
const draft={...scope,campaign_id:campaign},video={...draft,variant_id:variant,auth_user_id:founder};
const copy=`/customer/campaigns/${campaign}/variants/${variant}/revisions`;
const attach=`/customer/creative-jobs/quoted%3A${quote}/attach`;
const social=['/customer/social/oauth-intents','/customer/social/oauth-complete',`/customer/social/connections/${variant}/refresh`,`/customer/social/connections/${variant}/disconnect`];
const copyBody={tenant_id:scope.tenant_id,project_id:scope.project_id,idempotency_key:'copy.once',expected_campaign_version:1,revision_id:quote,content:{title:'Approved',body:'Factual text',caption:null,alt_text:null}};
function kit({mode='copy',targetPatch={},fetchImpl=null,actors={}}={}){
 let iam=0,upstream=0;const seen=[];
 const trusted={kind:'customer',auth_user_id:founder,trusted_scope:scope};
 const verify=async token=>{if(actors[token])return actors[token];if(token==='founder')return trusted;if(token==='other')return {...trusted,auth_user_id:other};throw Error('synthetic invalid auth');};
 const options=mode==='video'?{founderVideo:video,allowFounderVideoAttachment:true}:{allowFounderDraftWorkflow:true,founderDraftScope:draft,...(mode==='social'?{allowFounderSocialConnections:true}:{allowFounderCopyEditing:true})};
 const app=createStudioBridge({target:{...target,...options,...targetPatch},tokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},iamTokenProvider:async()=>{iam++;return'synthetic.iam';},fetchImpl:async(...args)=>{upstream++;seen.push(args);return fetchImpl?fetchImpl(...args):Response.json({status:'synthetic.only'});}});
 return {app,seen,counts:()=>[iam,upstream]};
}
const post=(k,url,body=scope,token='founder')=>{let r=request(k.app).post(url);if(token)r=r.set('authorization','Bearer '+token);return r.send(body);};
test('new copy permission carries exact existing revision route and preserves original draft permission',async()=>{
 const k=kit();assert.equal((await post(k,copy,copyBody)).status,200);
 assert.equal((await post(k,`/customer/campaigns/${campaign}/content-items`,copyBody)).status,200);
 assert.deepEqual(k.counts(),[2,2]);
});
test('new permissions absent/OFF never expand accepted founder profiles',async()=>{
 for(const flag of ['allowFounderCopyEditing','allowFounderSocialConnections']){
  const k=kit({mode:flag.includes('Social')?'social':'copy',targetPatch:{[flag]:false}});
  for(const url of flag.includes('Social')?social:[copy])assert.equal((await post(k,url,flag.includes('Social')?scope:copyBody)).status,403);
  assert.deepEqual(k.counts(),[0,0]);
 }
 const k=kit({mode:'video',targetPatch:{allowFounderVideoAttachment:false}});assert.equal((await post(k,attach)).status,403);assert.deepEqual(k.counts(),[0,0]);
});
test('new flags reject malformed values and missing foundational binding',()=>{
 for(const flag of ['allowFounderCopyEditing','allowFounderSocialConnections','allowFounderVideoAttachment'])
  for(const value of ['true',1,null])assert.throws(()=>kit({targetPatch:{[flag]:value}}));
 assert.throws(()=>kit({targetPatch:{allowFounderDraftWorkflow:false,founderDraftScope:undefined}}));
 assert.throws(()=>kit({mode:'social',targetPatch:{allowFounderDraftWorkflow:false,founderDraftScope:undefined}}));
 assert.throws(()=>kit({mode:'video',targetPatch:{founderVideo:undefined}}));
 for(const flag of ['allowWrites','allowDraftWorkflow','allowSocialWrites','allowStripeCheckout','allowGenerationConfirmation'])assert.throws(()=>kit({targetPatch:{[flag]:true}}));
});
test('copy and social nonfounders consume rates but cannot reach IAM/upstream',async()=>{
 for(const mode of ['copy','social']){
  const k=kit({mode,targetPatch:{maxRequests:1}}),url=mode==='copy'?copy:social[0],body=mode==='copy'?copyBody:scope;
  assert.equal((await post(k,url,body,'other')).status,403);assert.equal((await post(k,url,body,'other')).status,429);
  assert.deepEqual(k.counts(),[0,0]);
 }
});
test('copy and social verify trusted scope and required request scope pre-IAM',async()=>{
 for(const mode of ['copy','social'])for(const key of Object.keys(scope)){
  const k=kit({mode,actors:{foreign:{kind:'customer',auth_user_id:founder,trusted_scope:{...scope,[key]:'foreign'}}}});
  const body=mode==='copy'?{...copyBody,[key]:'foreign'}:{...scope,[key]:'foreign'};
  assert.equal((await post(k,mode==='copy'?copy:social[0],body,'foreign')).status,404);assert.deepEqual(k.counts(),[0,0]);
 }
 const k=kit();assert.equal((await post(k,copy.replace(campaign,other),copyBody)).status,404);assert.deepEqual(k.counts(),[0,0]);
});
test('social lifecycle includes owner connect/complete/renew/disconnect only, with no anonymous callback proxy',async()=>{
 const k=kit({mode:'social'});for(const url of social)assert.equal((await post(k,url,{...scope,...(url.includes('oauth')?{platform:'linkedin',state:'synthetic'}:{})})).status,200);
 for(const url of ['/customer/social/dispatches',`/customer/social/dispatches/${variant}/cancel`])assert.equal((await post(k,url)).status,403);
 assert.equal((await request(k.app).get('/customer/social/oauth/callback/linkedin?code=synthetic')).status,404);
 assert.deepEqual(k.counts(),[4,4]);
});
test('video attachment permits exact quoted job scope and preserves quote confirmation',async()=>{
 const k=kit({mode:'video'});assert.equal((await post(k,attach)).status,200);
 assert.equal((await post(k,attach.replace('%3A',':'))).status,200);
 assert.equal((await post(k,`/customer/generation-quotes/${quote}/confirm`,{confirmed:true,max_credits:5,idempotency_key:'once'})).status,200);
 assert.deepEqual(k.counts(),[3,3]);
});
test('video attachment requires founder identity and exact strict body/trusted pins before IAM',async()=>{
 for(const body of [{...scope,tenant_id:'foreign'},{...scope,brand_id:undefined},{...scope,extra:true},{}]){
  const k=kit({mode:'video'});assert.equal((await post(k,attach,body)).status,404);assert.deepEqual(k.counts(),[0,0]);
 }
 const k=kit({mode:'video'});assert.equal((await post(k,attach,scope,'other')).status,403);assert.deepEqual(k.counts(),[0,0]);
});
test('unapproved write paths, methods, encoding, suffixes and queries remain denied',async()=>{
 for(const mode of ['copy','social','video']){
  const k=kit({mode});const url=mode==='copy'?copy:mode==='social'?social[0]:attach;
  for(const suffix of ['?x=1','/','/extra','%2f'])assert.ok([403,404].includes((await post(k,url+suffix,mode==='copy'?copyBody:scope)).status));
  for(const method of ['put','patch','delete'])assert.equal((await request(k.app)[method](url).set('authorization','Bearer founder').send(scope)).status,404);
  for(const denied of ['/billing/stripe/checkout','/customer/social/dispatches',`/customer/social/dispatches/${variant}/cancel`,'/customer/assets/uploads',`/customer/campaigns/${campaign}/archive`])assert.ok([403,404].includes((await post(k,denied)).status));
  if(mode!=='video')assert.equal((await post(k,`/customer/generation-quotes/${quote}/confirm`)).status,403);
  assert.deepEqual(k.counts(),[0,0]);
 }
});
test('new permissions retain the 16KiB cap, private headers, CORS and upstream error contract',async()=>{
 for(const mode of ['copy','social','video']){
  const k=kit({mode});const url=mode==='copy'?copy:mode==='social'?social[0]:attach;
  assert.equal((await post(k,url,{...scope,large:'x'.repeat(17000)})).status,413);
  assert.equal((await request(k.app).options(url).set('origin',target.origin).set('access-control-request-method','POST').set('access-control-request-headers','authorization,content-type')).status,204);
  assert.equal((await request(k.app).post(url).set('authorization','Bearer founder').set('x-serverless-authorization','forged').send(scope)).status,400);
  assert.deepEqual(k.counts(),[0,0]);
 }
 for(const status of [403,409,422,503]){
  const k=kit({fetchImpl:()=>Response.json({error:{code:'EXISTING_UPSTREAM_DENIAL'}},{status})});
  const res=await post(k,copy,copyBody);assert.equal(res.status,status);assert.equal(res.body.error.code,'EXISTING_UPSTREAM_DENIAL');assert.match(res.headers['cache-control'],/no-store/);
 }
});
test('unauthenticated new admissions never call IAM/upstream',async()=>{
 for(const mode of ['copy','social','video']){
  const k=kit({mode}),url=mode==='copy'?copy:mode==='social'?social[0]:attach;
  assert.equal((await post(k,url,mode==='copy'?copyBody:scope,null)).status,401);
  assert.deepEqual(k.counts(),[0,0]);
 }
});
test('real backend founder binding rejects a stolen or unrelated job even after scoped bridge admission',async()=>{
 const express=require('express');const {CreativeJobService}=require('../src/generation-quotes/jobs');const {createCreativeJobsRouter}=require('../src/generation-quotes/jobsRouter');
 const actor={kind:'customer',auth_user_id:founder,trusted_scope:scope};let mutated=0;
 const q={...video,quote_id:quote,job_id:'quoted:'+quote,credit_cost:5,execution_state:'succeeded',request:{...scope,campaign_id:other,variant_id:variant,execution_class:'video.normal',execution_mode:'ai',supplied_assets:[]},profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'}};
 const svc=new CreativeJobService({quoteService:{founderVideo:videoBinding(video),transaction:fn=>fn({query:async()=>{throw Error('must not write');}})},campaignRepository:{executeCommand:async()=>{mutated++;}}});
 svc.row=async()=>({q,authority:{role:'owner'}});
 const api=express();api.use(express.json());api.use('/customer/creative-jobs',createCreativeJobsRouter({service:svc,tokenVerifier:{verifyAccessToken:async()=>actor}}));
 const k=kit({mode:'video',fetchImpl:async(url,options)=>{
  const response=await request(api).post(new URL(url).pathname).set('authorization',options.headers.Authorization).send(JSON.parse(options.body.toString()));
  return Response.json(response.body,{status:response.status});
 }});
 const response=await post(k,attach);assert.equal(response.status,403);assert.equal(response.body.error.code,'FOUNDER_VIDEO_FORBIDDEN');assert.equal(mutated,0);assert.deepEqual(k.counts(),[1,1]);
});
