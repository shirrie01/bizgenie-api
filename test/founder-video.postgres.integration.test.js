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

 const {FounderVideoSpend,SUBMIT,RECONCILE,MODEL,MAX_STATUS_OBSERVATIONS}=require('../src/provider-spend/founderVideo');
 const founder={auth_user_id:'11111111-1111-4111-8111-111111111111',tenant_id:'tenant_a',project_id:'project',brand_id:'brand',campaign_id:'55555555-5555-4555-8555-555555555555',variant_id:'66666666-6666-4666-8666-666666666666'};
 const quoteId='33333333-3333-4333-8333-333333333333';
 const job={...founder,quote_id:quoteId,job_id:'quoted:'+quoteId,claim_token:'77777777-7777-4777-8777-777777777777',fence:1,observation_id:'2026-11-15T20:00:00.000Z',execution_class:'video.normal',profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{campaign_id:founder.campaign_id,variant_id:founder.variant_id,execution_mode:'ai',supplied_assets:[]}};
 const estimate=n=>({version:'estimate.v1',source_ref:'operator.approved.estimate',currency:'GBP',upper_bound_minor:n,authority:{native_currency:'USD',native_bound_minor:n,fees_gbp_minor:0,fx:{from:'USD',to:'GBP',numerator:1,denominator:1,version:'fx.v1',source_ref:'operator.fx',valid_until:new Date(Date.now()+86400000).toISOString()},pricing_source_ref:'operator.price',pricing_version:'price.v1',pricing_unit:'second',pricing_valid_until:new Date(Date.now()+86400000).toISOString()},valid_until:new Date(Date.now()+86400000).toISOString()});
 const setup=async(submit=350,poll=150)=>{const estimates={[SUBMIT]:estimate(submit),[RECONCILE]:estimate(poll),image:estimate(9600)};estimates[RECONCILE].authority.pricing_unit='request';await owner.query('update provider_spend_policy set estimates=$1',[estimates]);return new FounderVideoSpend({pool:runtime,enabled:true,founder});};
 const dispatchInput=(operation=SUBMIT,patch={})=>({id:'caller-retry',tenantId:'tenant_a',operation,estimateVersion:'estimate.v1',job,...patch});
 const observe=n=>dispatchInput(RECONCILE,{job:{...job,observation_id:new Date(Date.parse(job.observation_id)+n).toISOString()}});
 const exposure=async()=>Number((await owner.query('select coalesce(sum(bound_minor),0) n from provider_spend_reservations')).rows[0].n);
 it('independent instances and concurrent duplicate submit dispatch once despite random retry IDs',async()=>{
  const a=await setup(),b=new FounderVideoSpend({pool:runtime,enabled:true,founder});let calls=0;const call=async()=>{calls++;return Response.json({name:'one-operation'});};
  const r=await Promise.allSettled([a.executePaid(dispatchInput(),call),b.executePaid(dispatchInput(SUBMIT,{id:'new-random-id'}),call)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(await exposure(),350);
  await assert.rejects(b.executePaid(dispatchInput(),call));assert.equal(calls,1);
 });
 it('500p lifetime cap includes submit and every status, never refunded by settlement or month rollover',async()=>{
  const a=await setup(400,100);await a.executePaid(dispatchInput(),async()=>Response.json({name:'one'}));await a.executePaid(observe(0),async()=>Response.json({done:false}));assert.equal(await exposure(),500);
  const row=(await owner.query('select * from provider_spend_reservations where operation=$1',[SUBMIT])).rows[0];
  await a.settle({id:row.id,tenantId:row.tenant_id,token:row.dispatch_token,outcome:'settled',actualMinor:0,evidenceRef:'invoice.zero'});
  await owner.query("update provider_spend_reservations set month='2020-01-01'");
  await assert.rejects(a.executePaid(observe(1),async()=>Response.json({done:true})));assert.equal(await exposure(),500);
  await assert.rejects(s.reserve(input('other')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('bounded status series reaches completion and exhausts four observations without another submit',async()=>{
  const a=await setup(300,50);let submits=0,polls=0;
  await a.executePaid(dispatchInput(),async()=>{submits++;return Response.json({name:'stable'});});
  for(let i=0;i<MAX_STATUS_OBSERVATIONS;i++){
   const r=await a.executePaid(observe(i),async()=>Response.json({done:++polls===MAX_STATUS_OBSERVATIONS}));assert.equal((await r.json()).done,i===MAX_STATUS_OBSERVATIONS-1);
   await assert.rejects(a.executePaid(observe(i),async()=>{polls++;return Response.json({});}),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
  }
  await assert.rejects(a.executePaid(observe(4),async()=>Response.json({})),{code:'FOUNDER_VIDEO_POLL_LIMIT'});
  await assert.rejects(a.executePaid(dispatchInput(),async()=>{submits++;return Response.json({});}));
  assert.equal(submits,1);assert.equal(polls,4);assert.equal(await exposure(),500);
 });
 it('timeout/failed status retains exposure and prevents same or new observation after ambiguity',async()=>{
  const a=await setup(300,50);await a.executePaid(dispatchInput(),async()=>Response.json({name:'stable'}));let calls=0;
  await assert.rejects(a.executePaid(observe(0),async()=>{calls++;throw Error('timeout');}),/timeout/);
  assert.equal(await exposure(),350);assert.equal((await owner.query('select state from provider_spend_reservations where operation=$1',[RECONCILE])).rows[0].state,'uncertain');
  await assert.rejects(a.executePaid(observe(0),()=>calls++));await assert.rejects(a.executePaid(observe(1),()=>calls++),{code:'FOUNDER_VIDEO_OBSERVATION_HELD'});assert.equal(calls,1);
 });
 it('HTTP failure is not a successful observation and cannot unlock another poll',async()=>{
  const a=await setup(300,50);await a.executePaid(dispatchInput(),async()=>Response.json({name:'stable'}));let calls=0;
  const failed=await a.executePaid(observe(0),async()=>{calls++;return Response.json({error:'temporary'},{status:503});});assert.equal(failed.status,503);
  await assert.rejects(a.executePaid(observe(1),()=>calls++),{code:'FOUNDER_VIDEO_OBSERVATION_HELD'});assert.equal(calls,1);assert.equal(await exposure(),350);
 });
 it('submit timeout never frees budget or permits a status series or resubmission',async()=>{
  const a=await setup();let calls=0;await assert.rejects(a.executePaid(dispatchInput(),async()=>{calls++;throw Error('timeout');}));
  await assert.rejects(a.executePaid(observe(0),()=>calls++),{code:'FOUNDER_VIDEO_OBSERVATION_HELD'});await assert.rejects(a.executePaid(dispatchInput(),()=>calls++));assert.equal(calls,1);assert.equal(await exposure(),350);
 });
 it('wrong tenant/campaign/variant and a new quote/job cannot rebind or reset lifetime exposure',async()=>{
  const a=await setup();let calls=0;for(const patch of [{tenant_id:'tenant_b'},{auth_user_id:'other'},{brand_id:'other'},{job_id:'other'},{request:{...job.request,campaign_id:randomUUID()}},{request:{...job.request,variant_id:randomUUID()}},{profile:{...job.profile,duration_seconds:8}}])await assert.rejects(a.executePaid(dispatchInput(SUBMIT,{job:{...job,...patch}}),()=>calls++),{code:'FOUNDER_VIDEO_FORBIDDEN'});
  await a.executePaid(dispatchInput(),async()=>{calls++;return Response.json({name:'stable'});});
  const second=randomUUID();await assert.rejects(new FounderVideoSpend({pool:runtime,enabled:true,founder}).executePaid(dispatchInput(SUBMIT,{job:{...job,quote_id:second,job_id:'quoted:'+second}}),()=>calls++),{code:'FOUNDER_VIDEO_ALREADY_BOUND'});assert.equal(calls,1);
 });
 it('concurrent different quotes cannot split the allowance and concurrent status observations cannot double dispatch',async()=>{
  const a=await setup(300,50),second=randomUUID();let calls=0;
  const r=await Promise.allSettled([a.executePaid(dispatchInput(),async()=>{calls++;return Response.json({});}),a.executePaid(dispatchInput(SUBMIT,{job:{...job,quote_id:second,job_id:'quoted:'+second}}),async()=>{calls++;return Response.json({});})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);
  const winner=(await owner.query('select id from provider_spend_reservations')).rows[0].id.includes(quoteId)?job:{...job,quote_id:second,job_id:'quoted:'+second};
  const poll=dispatchInput(RECONCILE,{job:winner});const statuses=await Promise.allSettled([a.executePaid(poll,async()=>{calls++;return Response.json({done:false});}),new FounderVideoSpend({pool:runtime,enabled:true,founder}).executePaid(poll,async()=>{calls++;return Response.json({done:false});})]);assert.equal(statuses.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,2);assert.equal(await exposure(),350);
 });
 it('missing or stale pricing unit/FX blocks submit and later polls without recycling exposure',async()=>{
  const a=await setup();let calls=0;
  for(const kind of ['unit','pricing-expired','fx-missing','fx-expired']){const e=estimate(350);if(kind==='unit')delete e.authority.pricing_unit;if(kind==='pricing-expired')e.authority.pricing_valid_until='2000-01-01';if(kind==='fx-missing')e.authority.fx=null;if(kind==='fx-expired')e.authority.fx.valid_until='2000-01-01';await owner.query('update provider_spend_policy set estimates=$1',[{[SUBMIT]:e}]);await assert.rejects(a.executePaid(dispatchInput(),()=>calls++),{code:'FOUNDER_VIDEO_PRICE_UNVERIFIED'});}
  assert.equal(calls,0);assert.equal(await exposure(),0);
  await setup(300,50);await a.executePaid(dispatchInput(),async()=>Response.json({}));await owner.query("update provider_spend_policy set estimates=jsonb_set(estimates,$1,'null')",[[''+RECONCILE,'authority','fx']]);await assert.rejects(a.executePaid(observe(0),()=>calls++),{code:'FOUNDER_VIDEO_PRICE_UNVERIFIED'});assert.equal(await exposure(),300);
 });
 it('fenced composition carries stable observations and revokes stale observations before dispatch',async()=>{
  await setup(300,50);const {createFounderVideoAcceptance}=require('../src/provider-spend/founderVideoComposition');const {admitProviderDispatch}=require('../src/provider-spend/dispatch');
  const c=createFounderVideoAcceptance({environment:'staging',founder,pool:runtime,enabled:true});
  const row={...job,request:{...job.request,execution_class:'video.normal'},profile:{...job.profile,preview_profile:{id:'fixed'},brand_snapshot:{version:1}},updated_at:new Date(job.observation_id),state:'calling'};
  const worker={quotes:{...c.quoteOptions,authorize:async()=>{},rights:async()=>{},binding:async()=>({preview_profile:row.profile.preview_profile,brand_snapshot:row.profile.brand_snapshot})},billing:{withTransaction:fn=>fn({})},load:async()=>row,match:(r,claim)=>assert.equal(r.claim_token,claim.token)};
  const scope=c.providerScopeFor(worker,async()=>({[SUBMIT]:{estimateVersion:'estimate.v1'},[RECONCILE]:{estimateVersion:'estimate.v1'}}));let calls=0;const claim={job_id:job.job_id,token:job.claim_token,fence:1};
  await scope(claim,()=>admitProviderDispatch(SUBMIT,async()=>{calls++;return Response.json({});}));
  for(let i=0;i<2;i++){row.updated_at=new Date(Date.parse(job.observation_id)+i);await scope(claim,()=>admitProviderDispatch(RECONCILE,async()=>{calls++;return Response.json({done:i===1});}));}
  await assert.rejects(scope(claim,async()=>{row.updated_at=new Date(Date.parse(job.observation_id)+10);return admitProviderDispatch(RECONCILE,()=>calls++);}),{code:'PROVIDER_EXECUTION_AUTHORITY_STALE'});assert.equal(calls,3);
 });
});
