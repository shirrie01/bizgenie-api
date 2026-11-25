const {test}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const express=require('express');
const {CreativeJobService}=require('../src/generation-quotes/jobs');
const {createCreativeJobsRouter}=require('../src/generation-quotes/jobsRouter');
const {MODEL}=require('../src/provider-spend/founderVideo');
const founder='11111111-1111-4111-8111-111111111111';
const campaign='55555555-5555-4555-8555-555555555555';
const variant='66666666-6666-4666-8666-666666666666';
const quote='33333333-3333-4333-8333-333333333333';
const other='77777777-7777-4777-8777-777777777777';
const scope={tenant_id:'tenant',project_id:'project',brand_id:'brand'};
const binding={...scope,auth_user_id:founder,campaign_id:campaign,variant_id:variant};
const actor={kind:'customer',auth_user_id:founder};
function row(){return {...binding,quote_id:quote,job_id:'quoted:'+quote,credit_cost:5,execution_state:'succeeded',
 profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16',brand_snapshot:{id:'snapshot'},
  creative_target:{revision_id:other,original_content:{title:'Approved content'}}},
 request:{...scope,campaign_id:campaign,variant_id:variant,execution_class:'video.normal',execution_mode:'ai',supplied_assets:[],expected_campaign_version:1},
 execution_result:{result:{asset_id:other}}};}
function kit({enabled=true,role='owner',value=row(),existing=true}={}){
 let writes=0,commands=0;const calls=[];
 const client={query:async(sql)=>{calls.push(sql);assert.ok(sql.startsWith('select '),'unexpected SQL mutation');return {rows:existing?[{exists:true}]:[],rowCount:existing?1:0};}};
 const quotes={founderVideo:enabled?binding:null,transaction:fn=>fn(client),now:()=>new Date('2026-11-24T00:00:00Z')};
 const campaigns={executeCommand:async()=>{commands++;writes++;throw Error('unexpected campaign mutation');}};
 const service=new CreativeJobService({quoteService:quotes,campaignRepository:campaigns});
 service.row=async()=>({q:value,authority:{role}});
 service.get=async()=>({contract_version:'creative-job.v1',association:{current:true}});
 return {service,quotes,campaigns,value,calls,counts:()=>({writes,commands})};
}
test('approved founder video attachment replay remains available with no duplicate campaign mutation',async()=>{
 const k=kit();assert.deepEqual(await k.service.attach(actor,k.value.job_id,scope),{contract_version:'creative-job.v1',association:{current:true}});
 assert.deepEqual(k.counts(),{writes:0,commands:0});
});
test('unconfigured profile preserves ordinary owner attachment for unrelated nonvideo jobs',async()=>{
 const value=row();value.request.execution_class='image.normal';value.profile={};value.credit_cost=2;
 const k=kit({enabled:false,value});await k.service.attach(actor,value.job_id,scope);
 assert.deepEqual(k.counts(),{writes:0,commands:0});
});
test('configured founder profile rejects foreign scope, campaign, variant, actor or unrelated execution before campaign mutation',async()=>{
 const patches=[{tenant_id:'foreign'},{project_id:'foreign'},{brand_id:'foreign'},{auth_user_id:other},
 {request:{...row().request,campaign_id:other}},{request:{...row().request,variant_id:other}},
 {request:{...row().request,execution_class:'image.normal'}},{request:{...row().request,execution_mode:'hybrid'}},
 {request:{...row().request,supplied_assets:[{asset_id:other}]}},{credit_cost:10},{job_id:'quoted:'+other},
 {profile:{...row().profile,duration_seconds:8}}];
 for(const patch of patches){const k=kit({value:{...row(),...patch},existing:false});
  await assert.rejects(k.service.attach(actor,k.value.job_id,scope),{code:'FOUNDER_VIDEO_FORBIDDEN',status:403});
  assert.deepEqual(k.counts(),{writes:0,commands:0});assert.equal(k.calls.length,0);}
 const k=kit();await assert.rejects(k.service.attach({kind:'customer',auth_user_id:other},k.value.job_id,scope),{code:'FOUNDER_VIDEO_FORBIDDEN'});
});
test('member denial retains existing 404 contract and does not invoke campaign writes',async()=>{
 const k=kit({role:'member'});await assert.rejects(k.service.attach(actor,k.value.job_id,scope),{code:'RESOURCE_NOT_AVAILABLE',status:404});
 assert.deepEqual(k.counts(),{writes:0,commands:0});
});
test('binding is checked again inside the campaign command transaction before link insertion',async()=>{
 const k=kit({existing:false});let callbackQueries=0,invoked=0;
 k.campaigns.executeCommand=async(context,command,unused,callback)=>{
  invoked++;assert.equal(command.command_type,'save_revision');
  k.value.request={...k.value.request,campaign_id:other};
  await callback({query:async()=>{callbackQueries++;throw Error('must not insert link');}},
                 {result:{created_ids:{revision_ids:[other]},campaign_version:2}});
 };
 await assert.rejects(k.service.attach(actor,k.value.job_id,scope),{code:'FOUNDER_VIDEO_FORBIDDEN',status:403});
 assert.equal(invoked,1);assert.equal(callbackQueries,0);
});
test('HTTP attachment returns the explicit founder denial without sensitive output',async()=>{
 const value=row();value.request={...value.request,variant_id:other};const k=kit({value});
 const app=express();app.use(express.json());app.use('/customer/creative-jobs',createCreativeJobsRouter({service:k.service,tokenVerifier:{verifyAccessToken:async()=>actor}}));
 const res=await request(app).post('/customer/creative-jobs/'+encodeURIComponent(value.job_id)+'/attach').set('Authorization','Bearer synthetic').send(scope);
 assert.equal(res.status,403);assert.equal(res.body.error.code,'FOUNDER_VIDEO_FORBIDDEN');
 for(const privateValue of [founder,other,campaign,variant])assert.ok(!res.text.includes(privateValue));
 assert.deepEqual(k.counts(),{writes:0,commands:0});
});
test('HTTP approved existing attachment replay keeps its response contract',async()=>{
 const k=kit();const app=express();app.use(express.json());app.use('/customer/creative-jobs',createCreativeJobsRouter({service:k.service,tokenVerifier:{verifyAccessToken:async()=>actor}}));
 const res=await request(app).post('/customer/creative-jobs/'+encodeURIComponent(k.value.job_id)+'/attach').set('Authorization','Bearer synthetic').send(scope);
 assert.equal(res.status,200);assert.equal(res.body.contract_version,'creative-job.v1');assert.deepEqual(k.counts(),{writes:0,commands:0});
});
