const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target}=require('./helpers/founder-bridge');
const {binding,assertQuote,MODEL}=require('../src/provider-spend/founderVideo');
const b={auth_user_id:founder,tenant_id:'tenant',project_id:'project',brand_id:'brand',campaign_id:'55555555-5555-4555-8555-555555555555',variant_id:'66666666-6666-4666-8666-666666666666'};
const quoteId='33333333-3333-4333-8333-333333333333',path='/customer/generation-quotes/'+quoteId+'/confirm';
function kit(over={}){let upstream=0,iam=0;const verify=async t=>{if(!['founder','other','foreign','wrong-brand'].includes(t))throw Error();return{kind:'customer',auth_user_id:t==='other'?other:founder,trusted_scope:{tenant_id:t==='foreign'?'foreign':'tenant',project_id:'project',brand_id:t==='wrong-brand'?'foreign':'brand'}};};return{app:createStudioBridge({target:{...target,founderVideo:b,...over},tokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},iamTokenProvider:async()=>{iam++;return'iam';},fetchImpl:async()=>{upstream++;return Response.json({status:'queued'});}}),counts:()=>[iam,upstream]};}
const call=(k,p=path,token='founder')=>{let r=request(k.app).post(p);if(token)r=r.set('authorization','Bearer '+token);return r.send({confirmed:true,max_credits:5,idempotency_key:'stable'});};
test('founder video confirmation is default closed and exact identity/tenant/project/brand bound before IAM',async()=>{
 const k=kit();assert.equal((await call(k)).status,200);
 for(const t of ['other','foreign','wrong-brand'])assert.equal((await call(k,path,t)).status,403);
 for(const t of [null,'invalid'])assert.equal((await call(k,path,t)).status,401);
 assert.deepEqual(k.counts(),[1,1]);assert.equal((await call(kit({founderVideo:undefined}))).status,403);
});
test('founder-video permission cannot open unrelated quotes, methods, suffixes or paid routes',async()=>{
 const k=kit();for(const p of [path+'?a=1',path+'/','/billing/stripe/checkout','/customer/social/dispatches','/customer/campaigns'])assert.ok([403,404].includes((await call(k,p)).status),p);
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
 const q={...b,quote_id:quoteId,credit_cost:5,profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{campaign_id:b.campaign_id,variant_id:b.variant_id,execution_class:'video.normal',execution_mode:'ai',supplied_assets:[]}};
 assert.doesNotThrow(()=>assertQuote(binding(b),{kind:'customer',auth_user_id:founder},q));
 for(const patch of [{tenant_id:'foreign'},{brand_id:'foreign'},{auth_user_id:other},{request:{...q.request,campaign_id:other}},{credit_cost:1},{job_id:'other'},{profile:{...q.profile,duration_seconds:8}},{request:{...q.request,execution_class:'video.premium'}},{request:{...q.request,execution_mode:'hybrid'}},{request:{...q.request,supplied_assets:[{}]}}])assert.throws(()=>assertQuote(b,{kind:'customer',auth_user_id:founder},{...q,...patch}),{code:'FOUNDER_VIDEO_FORBIDDEN'});
 assert.throws(()=>assertQuote(b,{kind:'customer',auth_user_id:other},q));
});

test('quote service enforces injected guard inside confirmation transaction and preserves same-key replay',async()=>{
 const {PostgresGenerationQuoteService}=require('../src/generation-quotes/service');
 const svc=new PostgresGenerationQuoteService({founderVideo:b});const queries=[];
 const q={...b,quote_id:quoteId,state:'confirmed',job_id:'quoted:'+quoteId,confirmation_key:'same-key',credit_cost:5,profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{campaign_id:b.campaign_id,variant_id:b.variant_id,execution_class:'video.normal',execution_mode:'ai',supplied_assets:[]}};
 svc.transaction=fn=>fn({query:async(sql)=>{queries.push(sql);return{rowCount:0,rows:[{state:'queued'}]};}});svc.authorize=async()=>{};svc.lockedQuote=async()=>q;
 const actor={kind:'customer',auth_user_id:founder},body={confirmed:true,max_credits:5,idempotency_key:'same-key'};
 const outcomes=await Promise.all([svc.confirm(actor,quoteId,body),svc.confirm(actor,quoteId,body)]);
 assert.ok(outcomes.every(x=>x.replay&&x.job_id===q.job_id));assert.ok(queries.every(sql=>sql.startsWith('select')));
 await assert.rejects(svc.confirm(actor,quoteId,{...body,idempotency_key:'different'}),{code:'IDEMPOTENCY_KEY_CONFLICT'});
 q.tenant_id='foreign';await assert.rejects(svc.confirm(actor,quoteId,body),{code:'FOUNDER_VIDEO_FORBIDDEN'});
});
test('explicit staging composition shares one binding; production or mismatched worker composition fails closed',()=>{
 const {createFounderVideoAcceptance}=require('../src/provider-spend/founderVideoComposition');
 assert.throws(()=>createFounderVideoAcceptance({environment:'production',founder:b}));
 const c=createFounderVideoAcceptance({environment:'staging',founder:b});assert.equal(c.quoteOptions.founderVideo,c.bridgeOptions.founderVideo);
 assert.throws(()=>c.providerScopeFor({quotes:{founderVideo:{...b,tenant_id:'foreign'}}},async()=>({})));
});

test('founder can create only normal video quotes for approved campaign and variant before IAM',async()=>{
 const k=kit(),url='/customer/generation-quotes';
 const body={tenant_id:b.tenant_id,project_id:b.project_id,campaign_id:b.campaign_id,variant_id:b.variant_id,execution_class:'video.normal',execution_mode:'ai',supplied_assets:[],idempotency_key:'create'};
 const send=(v,t='founder')=>request(k.app).post(url).set('authorization','Bearer '+t).send(v);
 assert.equal((await send(body)).status,200);
 for(const patch of [{campaign_id:other},{variant_id:other},{execution_class:'image.normal'},{execution_mode:'hybrid'},{supplied_assets:[{asset_id:other}]},{tenant_id:'foreign'},{project_id:'foreign'}])assert.ok([403,404].includes((await send({...body,...patch})).status));
 for(const t of ['other','foreign','wrong-brand'])assert.equal((await send(body,t)).status,403);
 assert.deepEqual(k.counts(),[1,1]);
 for(const value of ['true',1,null])for(const key of ['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'])assert.throws(()=>kit({[key]:value}));
 assert.throws(()=>binding({...b,quote_id:quoteId}),'obsolete random quote binding is rejected, not silently ignored');
});
