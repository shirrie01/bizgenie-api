const {test}=require('node:test');
const assert=require('node:assert/strict');
const {admitProviderDispatch,withProviderJob}=require('../src/provider-spend/dispatch');
const {OpenAIImageProvider}=require('../src/image-generation/openaiProvider');
const {GoogleVertexRestTransport}=require('../src/video-generation/googleVeoProvider');
const {generateScriptWithVertex}=require('../src/generation');
const job={job_id:'immutable-job',tenant_id:'tenant',project_id:'project',brand_id:'brand',claim_token:'claim',fence:1,state:'calling'};
const operations={'test.operation':{id:'immutable-job.test',estimateVersion:'estimate.v1'}};
test('missing scope blocks even injected image fetch, direct request and direct attempt before network',async()=>{
 let calls=0;const p=new OpenAIImageProvider({apiKey:'fixture',assetStore:{save:async()=>{}},referenceAssetLoader:{load:async()=>{}},fetchImpl:async()=>{calls++;throw Error('must not run');},maxAttempts:3});
 for(const run of [()=>p.generate({prompt:'fixture',aspect_ratio:'1:1'}),()=>p.request('https://api.openai.com/v1/images/generations',()=>({})),()=>p.fetchAttempt('https://api.openai.com/v1/images/edits',()=>({}))])await assert.rejects(run(),{code:'PROVIDER_ADMISSION_UNAVAILABLE'});
 assert.equal(calls,0);
});
test('Veo direct submit/reconcile REST and SDK text cannot bypass admission with fake transports',async()=>{
 let calls=0;const transport=new GoogleVertexRestTransport({accessTokenProvider:async()=> 'synthetic',fetchImpl:async()=>{calls++;}});
 for(const action of ['predictLongRunning','fetchPredictOperation'])await assert.rejects(transport.post('https://vertex.example/models/model:'+action,{}));
 class FakeVertexAI{getGenerativeModel(){return {generateContent(){calls++;}};}}
 await assert.rejects(generateScriptWithVertex('fixture',{branding:{appName:'Fixture'},projectId:'fixture',VertexAIClient:FakeVertexAI}),{code:'PROVIDER_ADMISSION_UNAVAILABLE'});
 assert.equal(calls,0);
});
test('one authority covers stages; unknown cost, stale job, changed fence and revocation deny',async()=>{
 let calls=0,checks=0;const spend={executePaid:async(input,dispatch)=>{assert.equal(input.tenantId,'tenant');return dispatch();}};
 await withProviderJob({spend,job,operations,resolveJob:async()=>job},async()=>{
  await assert.rejects(admitProviderDispatch('unknown',()=>calls++),{code:'PROVIDER_COST_ESTIMATE_UNAPPROVED'});
  await admitProviderDispatch('test.operation',()=>calls++);
 });
 await withProviderJob({spend,job,operations,resolveJob:async()=>({...job,fence:2})},async()=>assert.rejects(admitProviderDispatch('test.operation',()=>calls++),{code:'PROVIDER_EXECUTION_AUTHORITY_STALE'}));
 await withProviderJob({spend,job,operations,resolveJob:async()=>++checks===1?job:{...job,revoked:true}},async()=>assert.rejects(admitProviderDispatch('test.operation',()=>calls++),{code:'PROVIDER_EXECUTION_AUTHORITY_STALE'}));
 assert.equal(calls,1);
});
test('async scopes do not leak tenant authority between parallel jobs or after completion',async()=>{
 const tenants=[];const spend={executePaid:async(i,dispatch)=>{tenants.push(i.tenantId);return dispatch();}};
 await Promise.all(['tenant','foreign'].map(tenant_id=>{const identity={...job,tenant_id};return withProviderJob({spend,job:identity,operations,resolveJob:async()=>identity},()=>admitProviderDispatch('test.operation',async()=>{await new Promise(setImmediate);}));}));
 assert.deepEqual(tenants.sort(),['foreign','tenant']);await assert.rejects(admitProviderDispatch('test.operation',()=>{}),{code:'PROVIDER_ADMISSION_UNAVAILABLE'});
});

test('completed worker claims and resolver diagnostics fail closed without network or leakage',async()=>{
 let calls=0;const spend={executePaid:async(_i,fn)=>fn()};
 for(const resolver of [async()=>({...job,state:'succeeded'}),async()=>{throw Error('private database URL');}]){
  await withProviderJob({spend,job,operations,resolveJob:resolver},async()=>assert.rejects(admitProviderDispatch('test.operation',()=>calls++),e=>e.code.startsWith('PROVIDER_EXECUTION_AUTHORITY_')&&!e.message.includes('private')));
 }assert.equal(calls,0);
});

test('recovery state permits only explicitly priced video status observation, never resubmission',async()=>{
 let calls=0;const identity={...job,state:'recovery_required'};const spend={executePaid:async(_i,fn)=>fn()};
 const ops={'vertex.video.model.reconcile.status.status.false':{estimateVersion:'v1'},'vertex.video.model.submit.4.720p.false':{estimateVersion:'v1'}};
 await withProviderJob({spend,job:identity,operations:ops,resolveJob:async()=>identity},async()=>{
  await assert.rejects(admitProviderDispatch('vertex.video.model.submit.4.720p.false',()=>calls++),{code:'PROVIDER_EXECUTION_AUTHORITY_STALE'});
  await admitProviderDispatch('vertex.video.model.reconcile.status.status.false',()=>calls++);
 });assert.equal(calls,1);
});
test('worker adapter carries exact claim and rechecks live authority instead of trusting returned start row',async()=>{
 const {createFencedWorkerScope}=require('../src/provider-spend/fencedWorkerScope');
 let calls=0,denied=false,checks=0;
 const row={...job,auth_user_id:'owner',request:{},profile:{preview_profile:{id:'locked'},brand_snapshot:{id:'frozen'}}};
 const worker={billing:{withTransaction:fn=>fn({})},load:async()=>({...row}),match(r,c){assert.equal(c.token,r.claim_token);assert.equal(c.fence,r.fence);},quotes:{authorize:async()=>{checks++;if(denied)throw Error('revoked');},rights:async()=>{},binding:async()=>row.profile}};
 const spend={executePaid:async(_i,fn)=>fn()};
 const run=createFencedWorkerScope({worker,spend,operationsForRow:async()=>operations});
 await run({job_id:job.job_id,token:job.claim_token,fence:1},()=>admitProviderDispatch('test.operation',()=>calls++));
 assert.equal(checks,3);assert.equal(calls,1);
 denied=true;await assert.rejects(run({job_id:job.job_id,token:job.claim_token,fence:1},()=>calls++));assert.equal(calls,1);
});
