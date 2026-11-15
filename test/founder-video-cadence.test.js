const {test}=require('node:test'),assert=require('node:assert/strict');
const {FounderVideoSpend,SUBMIT,RECONCILE,MODEL,MAX_STATUS_OBSERVATIONS}=require('../src/provider-spend/founderVideo');
const {MonthlyProviderSpend}=require('../src/provider-spend');
const {binding,apiEnv}=require('./helpers/founder-video-runtime');
const {GenerationLoop}=require('../src/worker/loops');
// Database protocol stand-in: deterministic DB clock and shared transaction advisory-lock mutex.
// Runs the real reserve/start/settle methods; no PostgreSQL connection or SQL execution.
function ledger(){
 let clock=Date.parse('2026-11-15T20:00:00Z'),tail=Promise.resolve();const rows=new Map(),sql=[];
 const estimate=(n,unit)=>({version:'v1',source_ref:'synthetic.price',currency:'GBP',upper_bound_minor:n,valid_until:'2026-11-16T20:00:00Z',authority:{native_currency:'GBP',native_bound_minor:n,fees_gbp_minor:0,fx:null,pricing_unit:unit,pricing_source_ref:'synthetic.price',pricing_version:'v1',pricing_valid_until:'2026-11-16T20:00:00Z'}});
 const policy={enabled:true,currency:'GBP',cap_minor:10000,customer_limit:10,version:'v1',source_ref:'synthetic.policy',valid_from:new Date(clock-1000),valid_until:new Date(clock+86400000),estimates:{[SUBMIT]:estimate(300,'second'),[RECONCILE]:estimate(20,'request'),image:estimate(9600,'request')}};
 const pool={connect:async()=>{
  let unlock,snapshot;return{release(){},query:async(q,a=[])=>{
   sql.push(q);const out=v=>({rows:v,rowCount:v.length}),row=()=>rows.get(a[0]);
   if(q==='begin'||q.startsWith('set local'))return out([]);
   if(q.includes('pg_advisory_xact_lock')){const old=tail;tail=new Promise(r=>unlock=r);await old;snapshot=structuredClone([...rows]);return out([]);}
   if(q==='commit'||q==='rollback'){if(q==='rollback'&&snapshot){rows.clear();for(const [k,v]of snapshot)rows.set(k,v);}unlock?.();unlock=null;return out([]);}
   if(q.includes('from pg_class'))return out(['provider_spend_policy','provider_spend_customers','provider_spend_reservations'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,can_read:true,can_delete:false,can_write:relname==='provider_spend_reservations'})));
   if(q.includes('from public.provider_spend_policy'))return out([{...policy,db_now:new Date(clock),month:'2026-11-01'}]);
   if(q.includes("where state='breach'"))return out([...rows.values()].filter(r=>r.state==='breach'));
   if(q.includes('where month>'))return out([]);
   if(q.includes('from public.provider_spend_customers'))return out([{tenant_id:binding.tenant_id}]);
   if(q.includes('coalesce(sum(bound_minor)'))return out([{exposure:String([...rows.values()].filter(r=>r.state!=='cancelled').reduce((s,r)=>s+r.bound_minor,0))}]);
   if(q.includes('where left(id,'))return out([...rows.values()].filter(r=>r.id.startsWith(a[1])).map(r=>structuredClone(r)));
   if(q.startsWith('select ')&&q.includes('from public.provider_spend_reservations where id='))return out(row()&&(!q.includes('tenant_id=$2')||row().tenant_id===a[1])?[structuredClone(row())]:[]);
   if(q.startsWith('insert into public.provider_spend_reservations')){assert.ok(!rows.has(a[0]));rows.set(a[0],{id:a[0],tenant_id:a[1],operation:a[2],estimate_version:a[3],policy_version:a[4],currency:'GBP',month:a[5],bound_minor:a[6],policy_hash:a[7],state:'reserved',updated_at:new Date(clock)});return out([]);}
   if(q.startsWith('update public.provider_spend_reservations')){
    const r=row();assert.ok(r);
    if(q.includes("state='dispatching'")){r.state='dispatching';r.dispatch_token=a[1];r.updated_at=new Date(clock);}
    else if(q.includes("evidence_ref='founder.video.http_response'"))r.evidence_ref='founder.video.http_response';
    else if(q.includes('state=$2')){r.state=a[1];r.actual_minor=a[2];r.evidence_ref=a[3];r.updated_at=new Date(clock);}
    else throw Error('Unexpected update in test protocol');return out([]);
   }
   throw Error('Unexpected query in test protocol: '+q);
  }};
 }};
 const quote='55555555-5555-4555-8555-555555555555';
 const job={...binding,quote_id:quote,job_id:'quoted:'+quote,claim_token:'66666666-6666-4666-8666-666666666666',fence:1,execution_class:'video.normal',profile:{provider_model:MODEL,duration_seconds:4,aspect_ratio:'9:16'},request:{campaign_id:binding.campaign_id,variant_id:binding.variant_id,execution_mode:'ai',supplied_assets:[]}};
 return{pool,rows,sql,policy,clock:()=>clock,advance:n=>clock+=n,exposure:()=>[...rows.values()].reduce((s,r)=>s+r.bound_minor,0),spend:over=>new FounderVideoSpend({pool,enabled:true,founder:binding,...over}),input:(op=SUBMIT,n=0)=>({id:'untrusted-retry',tenantId:binding.tenant_id,operation:op,estimateVersion:'v1',job:{...job,observation_id:new Date(Date.parse('2026-11-15T20:00:00Z')+n).toISOString()}})};
}
test('DB time rejects first and subsequent early observations without inserts, permits, exposure or provider calls',async()=>{
 const l=ledger(),s=l.spend();let calls=0;await s.executePaid(l.input(),async()=>Response.json({name:'one'}));
 const inserts=()=>l.sql.filter(q=>q.startsWith('insert into')).length;const before=inserts();
 const hostNow=Date.now;Date.now=()=>l.clock()+86400000;try{
  await assert.rejects(s.executePaid(l.input(RECONCILE),()=>calls++),e=>e.code==='FOUNDER_VIDEO_POLL_NOT_DUE'&&e.retryAfterMs===25000);
 }finally{Date.now=hostNow;}
 l.advance(24999);await assert.rejects(s.executePaid(l.input(RECONCILE),()=>calls++),e=>e.code==='FOUNDER_VIDEO_POLL_NOT_DUE'&&e.retryAfterMs===1);
 assert.equal(calls,0);assert.equal(inserts(),before);assert.equal(l.rows.size,1);assert.equal(l.exposure(),300);
 l.advance(1);await s.executePaid(l.input(RECONCILE),async()=>{calls++;return Response.json({done:false});});
 await assert.rejects(s.executePaid(l.input(RECONCILE,1),()=>calls++),{code:'FOUNDER_VIDEO_POLL_NOT_DUE'});assert.equal(calls,1);assert.equal(l.exposure(),320);
});
test('configured interval cannot be below25s; longer interval uses DB clock and survives a new spend instance',async()=>{
 const l=ledger();for(const v of [0,24999,'25000',NaN,300001])assert.throws(()=>l.spend({minStatusIntervalMs:v}),{code:'FOUNDER_VIDEO_POLL_INTERVAL_INVALID'});
 const a=l.spend({minStatusIntervalMs:30000});await a.executePaid(l.input(),async()=>Response.json({}));l.advance(25000);
 await assert.rejects(l.spend({minStatusIntervalMs:30000}).executePaid(l.input(RECONCILE),async()=>Response.json({})),{code:'FOUNDER_VIDEO_POLL_NOT_DUE'});
 l.advance(5000);await l.spend({minStatusIntervalMs:30000}).executePaid(l.input(RECONCILE),async()=>Response.json({}));assert.equal(l.exposure(),320);
 const {apiVideoConfig}=require('../src/provider-spend/founderVideoConfig');assert.equal(apiVideoConfig(apiEnv()).minStatusIntervalMs,25000);assert.equal(apiVideoConfig({...apiEnv(),FOUNDER_VIDEO_STATUS_POLL_INTERVAL_SECONDS:'45'}).minStatusIntervalMs,45000);assert.throws(()=>apiVideoConfig({...apiEnv(),FOUNDER_VIDEO_STATUS_POLL_INTERVAL_SECONDS:'24'}));
});
test('ten paced idempotent observations can complete within500p; concurrency cannot consume duplicate permits',async()=>{
 const l=ledger(),s=l.spend();let submits=0,polls=0;await s.executePaid(l.input(),async()=>{submits++;return Response.json({});});
 for(let i=0;i<MAX_STATUS_OBSERVATIONS;i++){
  l.advance(25000);const attempt=async()=>{polls++;return Response.json({done:polls===MAX_STATUS_OBSERVATIONS});};
  const results=await Promise.allSettled([s.executePaid(l.input(RECONCILE,i),attempt),l.spend().executePaid(l.input(RECONCILE,i),attempt)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const response=results.find(r=>r.status==='fulfilled').value;assert.equal((await response.json()).done,i===MAX_STATUS_OBSERVATIONS-1);
 }
 l.advance(25000);await assert.rejects(s.executePaid(l.input(RECONCILE,10),()=>polls++),{code:'FOUNDER_VIDEO_POLL_LIMIT'});
 await assert.rejects(s.executePaid(l.input(),()=>submits++));assert.equal(polls,10);assert.equal(submits,1);assert.equal(l.exposure(),500);
 await assert.rejects(new MonthlyProviderSpend({pool:l.pool,enabled:true}).reserve({id:'other',tenantId:binding.tenant_id,operation:'image',estimateVersion:'v1'}),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
});
test('unfunded ten-poll plan and invalid pricing/FX fail closed before submit or after a paced observation',async()=>{
 const l=ledger();l.policy.estimates[RECONCILE].upper_bound_minor=21;await assert.rejects(l.spend().executePaid(l.input(),async()=>Response.json({})),{code:'FOUNDER_VIDEO_CAP_EXHAUSTED'});assert.equal(l.rows.size,0);
 l.policy.estimates[RECONCILE].upper_bound_minor=20;await l.spend().executePaid(l.input(),async()=>Response.json({}));l.advance(25000);
 l.policy.estimates[RECONCILE].authority.native_currency='USD';l.policy.estimates[RECONCILE].authority.fx=null;await assert.rejects(l.spend().executePaid(l.input(RECONCILE),async()=>Response.json({})),{code:'FOUNDER_VIDEO_PRICE_UNVERIFIED'});assert.equal(l.exposure(),300);
});
test('timeout and uncertain exposure remain held despite elapsed cadence; no resubmission',async()=>{
 const l=ledger(),s=l.spend();await s.executePaid(l.input(),async()=>Response.json({}));l.advance(25000);let calls=0;
 await assert.rejects(s.executePaid(l.input(RECONCILE),async()=>{calls++;throw Error('timeout');}),/timeout/);assert.equal(l.exposure(),320);
 l.advance(250000);await assert.rejects(l.spend().executePaid(l.input(RECONCILE,1),()=>calls++),{code:'FOUNDER_VIDEO_OBSERVATION_HELD'});await assert.rejects(s.executePaid(l.input(),()=>calls++));assert.equal(calls,1);assert.equal(l.exposure(),320);
});
test('founder worker scheduling filters not-due jobs by DB time and backs off25s on pending results',async()=>{
 let databaseNow=0,queries=[],calls=0;const row={job_id:'one',updated_at:new Date(0)};
 const quoteService={billing:{pool:{query:async(sql,params)=>{queries.push({sql,params});if(!sql.includes("state in ('calling'"))return{rows:[]};assert.match(sql,/clock_timestamp\(\).*\$2/);return{rows:databaseNow>=params[1]?[row]:[]};}}}};
 const worker={statusPollMinIntervalMs:25000,reconciliationClaim:async()=>({job_id:'one'}),reconcile:async()=>{calls++;const e=Error('pending');e.code='EXECUTION_RECONCILIATION_REQUIRED';throw e;}};
 const loop=new GenerationLoop({quoteService,worker,now:()=>new Date(databaseNow),logger:{warn(){}}});
 await loop.tick();assert.equal(calls,0);databaseNow=24999;await loop.tick();assert.equal(calls,0);
 databaseNow=25000;await loop.tick();assert.equal(calls,1);databaseNow=25001;await loop.tick();assert.equal(calls,1);assert.equal(loop.minBackoffMs,25000);
 const restarted=new GenerationLoop({quoteService,worker,now:()=>new Date(databaseNow),logger:{warn(){}}});row.updated_at=new Date(databaseNow);databaseNow=26000;quoteService.billing.pool.query=async(sql,p)=>({rows:sql.includes("state in ('calling'")&&databaseNow-new Date(row.updated_at).getTime()>=p[1]?[row]:[]});await restarted.tick();assert.equal(calls,1);
});
