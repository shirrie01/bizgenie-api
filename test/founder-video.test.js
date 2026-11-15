const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target}=require('./helpers/founder-bridge');
const {binding,assertQuote,MODEL}=require('../src/provider-spend/founderVideo');
const b={auth_user_id:founder,tenant_id:'tenant',project_id:'project',brand_id:'brand',quote_id:'33333333-3333-4333-8333-333333333333'};
const path='/customer/generation-quotes/'+b.quote_id+'/confirm';
function kit(over={}){let upstream=0,iam=0;const verify=async t=>{if(!['founder','other','foreign','wrong-brand'].includes(t))throw Error();return{kind:'customer',auth_user_id:t==='other'?other:founder,trusted_scope:{tenant_id:t==='foreign'?'foreign':'tenant',project_id:'project',brand_id:t==='wrong-brand'?'foreign':'brand'}};};return{app:createStudioBridge({target:{...target,founderVideo:b,...over},tokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},iamTokenProvider:async()=>{iam++;return'iam';},fetchImpl:async()=>{upstream++;return Response.json({status:'queued'});}}),counts:()=>[iam,upstream]};}
const call=(k,p=path,token='founder')=>{let r=request(k.app).post(p);if(token)r=r.set('authorization','Bearer '+token);return r.send({confirmed:true,max_credits:5,idempotency_key:'stable'});};
test('founder video confirmation is default closed and exact identity/tenant/project/brand bound before IAM',async()=>{
 const k=kit();assert.equal((await call(k)).status,200);
 for(const t of ['other','foreign','wrong-brand'])assert.equal((await call(k,path,t)).status,403);
 for(const t of [null,'invalid'])assert.equal((await call(k,path,t)).status,401);
 assert.deepEqual(k.counts(),[1,1]);assert.equal((await call(kit({founderVideo:undefined}))).status,403);
});
test('founder-video permission cannot open unrelated quotes, methods, suffixes or paid routes',async()=>{
 const k=kit();for(const p of [path+'?a=1',path+'/',path.replace(b.quote_id,other),'/customer/generation-quotes','/billing/stripe/checkout','/customer/social/dispatches','/customer/campaigns'])assert.ok([403,404].includes((await call(k,p)).status),p);
 assert.equal((await request(k.app).put(path).set('authorization','Bearer founder').send({})).status,404);
 assert.deepEqual(k.counts(),[0,0]);
 for(const key of ['allowWrites','allowGenerationConfirmation','allowStripeCheckout','allowSocialWrites','allowWorkspaceBootstrap','allowDraftWorkflow'])assert.throws(()=>kit({[key]:true}));
 assert.throws(()=>kit({founderVideo:{...b,auth_user_id:other}}));
});
test('denied verified identities consume the existing rate allowance; preflight stays independent',async()=>{
 const k=kit({maxRequests:1});assert.equal((await call(k,path,'other')).status,403);assert.equal((await call(k,path,'other')).status,429);assert.equal((await call(k)).status,200);
 assert.equal((await request(k.app).options(path).set('origin',target.origin).set('access-control-request-method','POST')).status,204);
});
test('backend guard rejects stolen quote bindings, nonnormal classes, credit mismatch and changed job',()=>{
 const q={...b,credit_cost:5,profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{execution_class:'video.normal',execution_mode:'ai',supplied_assets:[]}};
 assert.doesNotThrow(()=>assertQuote(binding(b),{kind:'customer',auth_user_id:founder},q));
 for(const patch of [{tenant_id:'foreign'},{brand_id:'foreign'},{auth_user_id:other},{quote_id:other},{credit_cost:1},{job_id:'other'},{profile:{...q.profile,duration_seconds:8}},{request:{...q.request,execution_class:'video.premium'}},{request:{...q.request,execution_mode:'hybrid'}},{request:{...q.request,supplied_assets:[{}]}}])assert.throws(()=>assertQuote(b,{kind:'customer',auth_user_id:founder},{...q,...patch}),{code:'FOUNDER_VIDEO_FORBIDDEN'});
 assert.throws(()=>assertQuote(b,{kind:'customer',auth_user_id:other},q));
});

test('quote service enforces injected guard inside confirmation transaction and preserves same-key replay',async()=>{
 const {PostgresGenerationQuoteService}=require('../src/generation-quotes/service');
 const svc=new PostgresGenerationQuoteService({founderVideo:b});const queries=[];
 const q={...b,state:'confirmed',job_id:'quoted:'+b.quote_id,confirmation_key:'same-key',credit_cost:5,profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{execution_class:'video.normal',execution_mode:'ai',supplied_assets:[]}};
 svc.transaction=fn=>fn({query:async(sql)=>{queries.push(sql);return{rows:[{state:'queued'}]};}});svc.authorize=async()=>{};svc.lockedQuote=async()=>q;
 const actor={kind:'customer',auth_user_id:founder},body={confirmed:true,max_credits:5,idempotency_key:'same-key'};
 const outcomes=await Promise.all([svc.confirm(actor,b.quote_id,body),svc.confirm(actor,b.quote_id,body)]);
 assert.ok(outcomes.every(x=>x.replay&&x.job_id===q.job_id));assert.ok(queries.every(sql=>sql.startsWith('select')));
 await assert.rejects(svc.confirm(actor,b.quote_id,{...body,idempotency_key:'different'}),{code:'IDEMPOTENCY_KEY_CONFLICT'});
 q.tenant_id='foreign';await assert.rejects(svc.confirm(actor,b.quote_id,body),{code:'FOUNDER_VIDEO_FORBIDDEN'});
});
test('explicit staging composition shares one binding; production or mismatched worker composition fails closed',()=>{
 const {createFounderVideoAcceptance}=require('../src/provider-spend/founderVideoComposition');
 assert.throws(()=>createFounderVideoAcceptance({environment:'production',founder:b}));
 const c=createFounderVideoAcceptance({environment:'staging',founder:b});assert.equal(c.quoteOptions.founderVideo,c.bridgeOptions.founderVideo);
 assert.throws(()=>c.providerScopeFor({quotes:{founderVideo:{...b,tenant_id:'foreign'}}},async()=>({})));
});
