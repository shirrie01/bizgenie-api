const {test}=require('node:test');const assert=require('node:assert/strict');
const {FencedGenerationWorker}=require('../src/generation-quotes/worker');
test('worker passes exact fenced claim to server admission and never calls provider after denial',async()=>{
 let calls=0,recovery=0;const claim={job_id:'job',token:'claim',fence:2};
 const worker=new FencedGenerationWorker({quoteService:{billing:{}},provider:{submit(){calls++;}},providerScope:async(received)=>{assert.equal(received,claim);throw Error('default deny');}});
 worker.start=async()=>({request:{},profile:{}});worker.recovery=async()=>{recovery++;};
 await assert.rejects(worker.run(claim),{code:'EXECUTION_RECONCILIATION_REQUIRED'});assert.equal(calls,0);assert.equal(recovery,1);
});
