const assert=require('node:assert/strict');
const {describe,it,before,after,beforeEach}=require('node:test');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {createDrainedPool:Pool}=require('./helpers/drained-pg-pool');
const {MonthlyProviderSpend}=require('../src/provider-spend');
const adminUrl=process.env.TEST_DATABASE_URL;
const suite=adminUrl?describe:describe.skip;
suite('founder acceptance cap — real disposable PostgreSQL',()=>{
 let admin,owner,runtime,url,role,db,s;
 const input=(id,tenantId='tenant_a')=>({id,tenantId,operation:'image',estimateVersion:'estimate.v1'});
 before(async()=>{
  admin=new Pool({connectionString:adminUrl});db='spend_'+randomUUID().replaceAll('-','');role='spend_runtime_'+randomUUID().replaceAll('-','');
  await admin.query(`create role "${role}" nologin`);await admin.query(`create database "${db}"`);
  const u=new URL(adminUrl);u.pathname='/'+db;url=u.toString();owner=new Pool({connectionString:url});
  await owner.query(readFileSync(require.resolve('../docs/provider-spend/schema-proposal.sql'),'utf8').replaceAll('bizgenie_provider_spend_runtime',role));
  runtime=new Pool({connectionString:url,options:`-c role=${role}`});s=new MonthlyProviderSpend({pool:runtime,enabled:true});
 });
 after(async()=>{try{const closed=await Promise.allSettled([runtime?.end(),owner?.end()]);const errors=closed.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'PostgreSQL fixture drain failed');if(admin){await admin.query(`drop database if exists "${db}"`);await admin.query(`drop role if exists "${role}"`);}}finally{await admin?.end();}});
 beforeEach(async()=>{
  await owner.query('truncate provider_spend_reservations,provider_spend_customers,provider_spend_policy');
  await owner.query("insert into provider_spend_customers values('tenant_a',1,true),('tenant_b',2,true)");
  const estimates={image:{version:'estimate.v1',source_ref:'operator.approved.estimate',currency:'GBP',upper_bound_minor:6000,authority:{native_currency:'GBP',native_bound_minor:6000,fees_gbp_minor:0,fx:null},valid_until:new Date(Date.now()+86400000).toISOString()}};
  await owner.query("insert into provider_spend_policy values(true,'policy.v1','issue.234',true,'GBP',10000,10,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',$1)",[estimates]);
 });
 const {FounderVideoSpend,SUBMIT,RECONCILE,MODEL}=require('../src/provider-spend/founderVideo');
 const founder={auth_user_id:'11111111-1111-4111-8111-111111111111',tenant_id:'tenant_a',project_id:'project',brand_id:'brand',quote_id:'33333333-3333-4333-8333-333333333333'};
 const job={...founder,job_id:'quoted:'+founder.quote_id,execution_class:'video.normal',profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{execution_mode:'ai',supplied_assets:[]}};
 const estimate=n=>({version:'estimate.v1',source_ref:'operator.approved.estimate',currency:'GBP',upper_bound_minor:n,authority:{native_currency:'USD',native_bound_minor:n,fees_gbp_minor:0,fx:{from:'USD',to:'GBP',numerator:1,denominator:1,version:'fx.v1',source_ref:'operator.fx',valid_until:new Date(Date.now()+86400000).toISOString()},pricing_source_ref:'operator.price',pricing_version:'price.v1',pricing_unit:'second',pricing_valid_until:new Date(Date.now()+86400000).toISOString()},valid_until:new Date(Date.now()+86400000).toISOString()});
 const setup=async(submit=350,poll=150)=>{const estimates={[SUBMIT]:estimate(submit),[RECONCILE]:estimate(poll),image:estimate(9600)};estimates[RECONCILE].authority.pricing_unit='request';await owner.query('update provider_spend_policy set estimates=$1',[estimates]);return new FounderVideoSpend({pool:runtime,enabled:true,founder});};
 const dispatchInput=(operation=SUBMIT,patch={})=>({id:'caller-retry',tenantId:'tenant_a',operation,estimateVersion:'estimate.v1',job,...patch});
 it('independent instances and duplicate concurrent submit reserve and dispatch once',async()=>{
  const a=await setup(),b=new FounderVideoSpend({pool:runtime,enabled:true,founder});let calls=0;
  const results=await Promise.allSettled([a.executePaid(dispatchInput(),async()=>++calls),b.executePaid(dispatchInput(SUBMIT,{id:'new-random-id'}),async()=>++calls)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
  assert.equal((await owner.query('select sum(bound_minor)::int n from provider_spend_reservations')).rows[0].n,350);
  await assert.rejects(b.executePaid(dispatchInput(),()=>++calls));assert.equal(calls,1);
 });
 it('aggregate multi-operation exposure cannot exceed500p even after timeout or zero settlement',async()=>{
  const a=await setup(400,150);let calls=0;await assert.rejects(a.executePaid(dispatchInput(),async()=>{calls++;throw Error('timeout');}),/timeout/);
  await assert.rejects(a.executePaid(dispatchInput(RECONCILE),()=>calls++),{code:'FOUNDER_VIDEO_CAP_EXHAUSTED'});assert.equal(calls,1);
  const row=(await owner.query('select * from provider_spend_reservations')).rows[0];assert.equal(row.state,'uncertain');
  await a.settle({id:row.id,tenantId:row.tenant_id,token:row.dispatch_token,outcome:'settled',actualMinor:0,evidenceRef:'invoice.zero'});
  await assert.rejects(a.executePaid(dispatchInput(RECONCILE),()=>calls++),{code:'FOUNDER_VIDEO_CAP_EXHAUSTED'});
 });
 it('500p exact bound permits distinct submit/status once; monthly10000p guard still denies other excess',async()=>{
  const a=await setup();let calls=0;await a.executePaid(dispatchInput(),async()=>++calls);await a.executePaid(dispatchInput(RECONCILE),async()=>++calls);
  assert.equal(calls,2);assert.equal((await owner.query('select sum(bound_minor)::int n from provider_spend_reservations')).rows[0].n,500);
  await assert.rejects(s.reserve(input('other')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('changed tenant, user, quote, job or model cannot dispatch; durable allowance cannot rebind on restart',async()=>{
  const a=await setup();let calls=0;for(const patch of [{tenant_id:'tenant_b'},{auth_user_id:'other'},{brand_id:'other'},{quote_id:'other'},{job_id:'other'},{profile:{...job.profile,duration_seconds:8}}])await assert.rejects(a.executePaid(dispatchInput(SUBMIT,{job:{...job,...patch}}),()=>calls++),{code:'FOUNDER_VIDEO_FORBIDDEN'});
  await a.executePaid(dispatchInput(),async()=>++calls);
  const changed={...founder,quote_id:'44444444-4444-4444-8444-444444444444'};
  const b=new FounderVideoSpend({pool:runtime,enabled:true,founder:changed});
  await assert.rejects(b.executePaid(dispatchInput(SUBMIT,{job:{...job,...changed,job_id:'quoted:'+changed.quote_id}}),()=>calls++),{code:'FOUNDER_VIDEO_ALREADY_BOUND'});assert.equal(calls,1);
 });
 it('missing pricing unit, expired quote authority and missing/stale FX fail closed',async()=>{
  const a=await setup();let calls=0;
  for(const kind of ['unit','pricing-expired','fx-missing','fx-expired']){const e=estimate(350);if(kind==='unit')delete e.authority.pricing_unit;if(kind==='pricing-expired')e.authority.pricing_valid_until='2000-01-01';if(kind==='fx-missing')e.authority.fx=null;if(kind==='fx-expired')e.authority.fx.valid_until='2000-01-01';await owner.query('update provider_spend_policy set estimates=$1',[{[SUBMIT]:e}]);await assert.rejects(a.executePaid(dispatchInput(),()=>calls++),{code:'FOUNDER_VIDEO_PRICE_UNVERIFIED'});}
  assert.equal(calls,0);assert.equal((await owner.query('select count(*)::int n from provider_spend_reservations')).rows[0].n,0);
 });
 it('month rollover and concurrent submit/status preserve lifetime cap',async()=>{
  const a=await setup(300,250);const results=await Promise.allSettled([a.executePaid(dispatchInput(),async()=>1),a.executePaid(dispatchInput(RECONCILE),async()=>1)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await owner.query("update provider_spend_reservations set month='2020-01-01'");
  await assert.rejects(a.executePaid(dispatchInput(results[0].status==='fulfilled'?RECONCILE:SUBMIT),async()=>2),{code:'FOUNDER_VIDEO_CAP_EXHAUSTED'});
 });
 it('reviewed composition carries founder quote identity through fenced transport admission',async()=>{
  await setup();
  const {createFounderVideoAcceptance}=require('../src/provider-spend/founderVideoComposition');
  const {admitProviderDispatch}=require('../src/provider-spend/dispatch');
  const composition=createFounderVideoAcceptance({environment:'staging',founder,pool:runtime,enabled:true});
  const row={...job,request:{...job.request,execution_class:'video.normal'},claim_token:'claim',fence:1,state:'calling'};
  const worker={quotes:{...composition.quoteOptions,authorize:async()=>{},rights:async()=>{},binding:async()=>({preview_profile:row.profile.preview_profile,brand_snapshot:row.profile.brand_snapshot})},billing:{withTransaction:fn=>fn({})},load:async()=>row,match:(r,c)=>assert.equal(r.claim_token,c.token)};
  // Use concrete snapshots because the existing fenced scope denies absent snapshots.
  row.profile={...row.profile,preview_profile:{id:'fixed'},brand_snapshot:{version:1}};
  const scope=composition.providerScopeFor(worker,async()=>({[SUBMIT]:{estimateVersion:'estimate.v1'}}));let calls=0;
  await scope({job_id:job.job_id,token:'claim',fence:1},()=>admitProviderDispatch(SUBMIT,async()=>++calls));
  await assert.rejects(scope({job_id:job.job_id,token:'claim',fence:1},()=>admitProviderDispatch(SUBMIT,async()=>++calls)),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
  assert.equal(calls,1);
 });
});
