const assert=require('node:assert/strict');
const {describe,it,before,after,beforeEach}=require('node:test');
const {readFileSync}=require('node:fs');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const {Pool}=require('pg');
const {MonthlyProviderSpend}=require('../src/provider-spend');
const adminUrl=process.env.TEST_DATABASE_URL;
const suite=adminUrl?describe:describe.skip;
suite('aggregate monthly provider ledger — real disposable PostgreSQL',()=>{
 let admin,owner,runtime,url,role,db,s;
 const input=(id,tenantId='tenant_a')=>({id,tenantId,operation:'image',estimateVersion:'estimate.v1'});
 before(async()=>{
  admin=new Pool({connectionString:adminUrl});db='spend_'+randomUUID().replaceAll('-','');role='spend_runtime_'+randomUUID().replaceAll('-','');
  await admin.query(`create role "${role}" nologin`);await admin.query(`create database "${db}"`);
  const u=new URL(adminUrl);u.pathname='/'+db;url=u.toString();owner=new Pool({connectionString:url});
  await owner.query(readFileSync(require.resolve('../docs/provider-spend/schema-proposal.sql'),'utf8').replaceAll('bizgenie_provider_spend_runtime',role));
  runtime=new Pool({connectionString:url,options:`-c role=${role}`});s=new MonthlyProviderSpend({pool:runtime,enabled:true});
 });
 after(async()=>{await runtime?.end();await owner?.end();if(admin){await admin.query(`drop database if exists "${db}" with(force)`);await admin.query(`drop role if exists "${role}"`);await admin.end();}});
 beforeEach(async()=>{
  await owner.query('truncate provider_spend_reservations,provider_spend_customers,provider_spend_policy');
  await owner.query("insert into provider_spend_customers values('tenant_a',1,true),('tenant_b',2,true)");
  const estimates={image:{version:'estimate.v1',source_ref:'operator.approved.estimate',currency:'GBP',upper_bound_minor:6000,valid_until:new Date(Date.now()+86400000).toISOString()}};
  await owner.query("insert into provider_spend_policy values(true,'policy.v1','issue.234',true,'GBP',10000,10,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',$1)",[estimates]);
 });
 it('two tenants/independent pools cannot reserve beyond one aggregate10000p cap',async()=>{
  const other=new Pool({connectionString:url,options:`-c role=${role}`});
  try{const r=await Promise.allSettled([s.reserve(input('one')),new MonthlyProviderSpend({pool:other,enabled:true}).reserve(input('two','tenant_b'))]);
   assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.code,'PROVIDER_SPEND_CAP_EXHAUSTED');
   assert.equal((await owner.query('select sum(bound_minor)::int total from provider_spend_reservations')).rows[0].total,6000);
  }finally{await other.end();}
 });
 it('independent Node processes race on the same durable id without double reservation',async()=>{
  const run=()=>new Promise((resolve,reject)=>{
   const code=`const{Pool}=require('pg');const{MonthlyProviderSpend}=require('./src/provider-spend');const p=new Pool({connectionString:process.env.SPEND_TEST_URL,options:process.env.SPEND_TEST_ROLE});new MonthlyProviderSpend({pool:p,enabled:true}).reserve(${JSON.stringify(input('shared'))}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.code);process.exitCode=1}).finally(()=>p.end());`;
   const child=spawn(process.execPath,['-e',code],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,SPEND_TEST_URL:url,SPEND_TEST_ROLE:`-c role=${role}`},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',c=>c?reject(Error(err)):resolve(JSON.parse(out)));
  });
  const r=await Promise.all([run(),run()]);assert.equal(r.filter(x=>x.replay).length,1);assert.equal((await owner.query('select count(*)::int n from provider_spend_reservations')).rows[0].n,1);
 });
 it('restart/replay and cross-tenant idempotency never create a second exposure',async()=>{
  await s.reserve(input('job'));const restarted=new MonthlyProviderSpend({pool:runtime,enabled:true});assert.equal((await restarted.reserve(input('job'))).replay,true);
  await assert.rejects(restarted.reserve(input('job','tenant_b')),{code:'PROVIDER_SPEND_IDEMPOTENCY_CONFLICT'});
 });
 it('dispatch permit is one-shot across workers; failure/timeout holds the full bound',async()=>{
  await s.reserve(input('job'));const r=await Promise.allSettled([s.start(input('job')),s.start(input('job'))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  const permit=r.find(x=>x.status==='fulfilled').value;
  await s.settle({...permit,tenantId:'tenant_a'});
  await assert.rejects(s.cancel(input('job')),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
  await assert.rejects(s.reserve(input('next','tenant_b')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('ambiguous provider failure cannot automatically retry or refund',async()=>{
  let calls=0;const dispatch=()=>{calls++;throw Error('timeout');};await assert.rejects(s.executePaid(input('job'),dispatch),/timeout/);
  await assert.rejects(s.executePaid(input('job'),dispatch),{code:'PROVIDER_SPEND_DISPATCH_HELD'});assert.equal(calls,1);
 });
 it('partial/zero final bills retain the whole bound; settlement is idempotent and token-bound',async()=>{
  await s.reserve(input('job'));const permit=await s.start(input('job'));
  await assert.rejects(s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:100,evidenceRef:'final.invoice',currency:'USD'}),{code:'PROVIDER_SPEND_INVALID_REQUEST'});
  await s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:100,evidenceRef:'final.invoice'});
  assert.equal((await s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:100,evidenceRef:'final.invoice'})).replay,true);
  await assert.rejects(s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:0,evidenceRef:'different'}),{code:'PROVIDER_SPEND_IDEMPOTENCY_CONFLICT'});
  await assert.rejects(s.reserve(input('next')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('only proven pre-dispatch cancellation releases exposure; cancelled id cannot resurrect',async()=>{
  await s.reserve(input('job'));await s.cancel(input('job'));await s.cancel(input('job'));await s.reserve(input('next'));
  await assert.rejects(s.start(input('job')),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
 });
 it('expired/disabled/missing/zero policy and unknown estimate fail closed',async()=>{
  await owner.query("update provider_spend_policy set valid_until=clock_timestamp()-interval '1 second'");await assert.rejects(s.reserve(input('old')),{code:'PROVIDER_SPEND_POLICY_UNAVAILABLE'});
  await owner.query("update provider_spend_policy set valid_until=clock_timestamp()+interval '1 day',enabled=false");await assert.rejects(s.reserve(input('off')),{code:'PROVIDER_SPEND_POLICY_UNAVAILABLE'});
  await owner.query("update provider_spend_policy set enabled=true,estimates='{}'");await assert.rejects(s.reserve(input('unknown')),{code:'PROVIDER_SPEND_ESTIMATE_UNAVAILABLE'});
  await assert.rejects(owner.query('update provider_spend_policy set cap_minor=0'),{code:'23514'});
  await owner.query('delete from provider_spend_policy');await assert.rejects(s.reserve(input('missing')),{code:'PROVIDER_SPEND_POLICY_UNAVAILABLE'});
 });
 it('customer11, inactive customer and unknown/non-GBP costs never reach dispatch',async()=>{
  await assert.rejects(s.reserve(input('eleven','tenant_11')),{code:'PROVIDER_SPEND_CUSTOMER_HOLD'});
  await assert.rejects(owner.query("insert into provider_spend_customers values('tenant_11',11,true)"),{code:'23514'});
  await owner.query("update provider_spend_customers set active=false where tenant_id='tenant_a'");await assert.rejects(s.reserve(input('inactive')),{code:'PROVIDER_SPEND_CUSTOMER_HOLD'});
  await owner.query("update provider_spend_customers set active=true");await owner.query("update provider_spend_policy set estimates=jsonb_set(estimates,'{image,currency}','\"USD\"')");await assert.rejects(s.reserve(input('usd')),{code:'PROVIDER_SPEND_ESTIMATE_UNAVAILABLE'});
 });
 it('DB UTC month wins over host clock; old unfinished exposure carries and late settlement stays bounded',async()=>{
  const now=Date.now;Date.now=()=>0;try{await s.reserve(input('job'));}finally{Date.now=now;}
  const permit=await s.start(input('job'));
  await owner.query("update provider_spend_reservations set month=to_char((clock_timestamp() at time zone 'UTC')-interval '1 month','YYYY-MM-01') where id='job'");
  await assert.rejects(s.reserve(input('new')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
  await s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:50,evidenceRef:'late.final.invoice'});
  await assert.rejects(s.reserve(input('new')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('reserved old-month work cannot dispatch, while known prior-month final exposure permits rollover',async()=>{
  await s.reserve(input('old'));await owner.query("update provider_spend_reservations set month='2020-01-01'");await assert.rejects(s.start(input('old')),{code:'PROVIDER_SPEND_DISPATCH_HELD'});await s.cancel(input('old'));await s.reserve(input('new'));
 });
 it('actual bill above trusted upper bound trips durable global hold, never frees exposure',async()=>{
  await s.reserve(input('job'));const permit=await s.start(input('job'));await assert.rejects(s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:7000,evidenceRef:'bad.bound'}),{code:'PROVIDER_SPEND_BREACH'});
  await assert.rejects(s.reserve(input('next')),{code:'PROVIDER_SPEND_BREACH'});
 });
 it('committed but lost reservation/dispatch acknowledgements cannot duplicate execution',async()=>{
  let armed=true;
  const lostAckPool={async connect(){const c=await runtime.connect();return {release:()=>c.release(),async query(q,args){const r=await c.query(q,args);if(armed&&q==='commit'){armed=false;throw Error('lost ack');}return r;}};}};
  const restarted=new MonthlyProviderSpend({pool:lostAckPool,enabled:true});
  await assert.rejects(restarted.reserve(input('lost')),{code:'PROVIDER_SPEND_UNAVAILABLE'});
  assert.equal((await s.reserve(input('lost'))).replay,true);
  armed=true;await assert.rejects(restarted.start(input('lost')),{code:'PROVIDER_SPEND_UNAVAILABLE'});
  await assert.rejects(s.start(input('lost')),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
  assert.equal((await owner.query("select state from provider_spend_reservations where id='lost'")).rows[0].state,'dispatching');
 });
 it('exact aggregate ceiling is permitted and exhausted requests cannot create another reservation',async()=>{
  await owner.query("update provider_spend_policy set estimates=jsonb_set(estimates,'{image,upper_bound_minor}','5000')");
  await Promise.all([s.reserve(input('one')),s.reserve(input('two','tenant_b'))]);
  await assert.rejects(s.reserve(input('three')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
  assert.equal((await owner.query('select sum(bound_minor)::int n from provider_spend_reservations')).rows[0].n,10000);
 });
 it('cancellation racing dispatch either prevents the call or retains its reservation',async()=>{
  await s.reserve(input('race'));const r=await Promise.allSettled([s.start(input('race')),s.cancel(input('race'))]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  const row=(await owner.query("select * from provider_spend_reservations where id='race'")).rows[0];
  if(row.state==='cancelled')await s.reserve(input('replacement'));else await assert.rejects(s.reserve(input('replacement')),{code:'PROVIDER_SPEND_CAP_EXHAUSTED'});
 });
 it('missing current policy cannot erase historical settlement or refund ambiguous jobs',async()=>{
  await s.reserve(input('job'));const permit=await s.start(input('job'));await owner.query('delete from provider_spend_policy');
  await s.settle({...permit,tenantId:'tenant_a'});assert.equal((await owner.query('select bound_minor from provider_spend_reservations')).rows[0].bound_minor,6000);
 });
 it('backward database month evidence fails closed rather than reopening an older budget',async()=>{
  await s.reserve(input('job'));await owner.query("update provider_spend_reservations set month='9999-01-01'");
  await assert.rejects(s.reserve(input('new')),{code:'PROVIDER_SPEND_CLOCK_UNSAFE'});
 });
 it('prior-month finalized exposure ages out only after its settlement month',async()=>{
  await s.reserve(input('old'));const permit=await s.start(input('old'));
  await s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:0,evidenceRef:'final.zero.invoice'});
  await owner.query("update provider_spend_reservations set month='2020-01-01',settled_month='2020-01-01'");
  await s.reserve(input('current'));
 });
 it('changed estimate authority under a reused policy version cannot dispatch an old reservation',async()=>{
  await s.reserve(input('job'));
  await owner.query("update provider_spend_policy set source_ref='different.authority'");
  await assert.rejects(s.start(input('job')),{code:'PROVIDER_SPEND_DISPATCH_HELD'});
 });
 it('a late corrected final bill above the bound trips hold even after prior settlement',async()=>{
  await s.reserve(input('job'));const permit=await s.start(input('job'));
  await s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:100,evidenceRef:'first.invoice'});
  await assert.rejects(s.settle({...permit,tenantId:'tenant_a',outcome:'settled',actualMinor:7000,evidenceRef:'corrected.invoice'}),{code:'PROVIDER_SPEND_BREACH'});
  await assert.rejects(s.settle({...permit,tenantId:'tenant_a'}),{code:'PROVIDER_SPEND_BREACH'});
  const row=(await owner.query('select actual_minor,evidence_ref from provider_spend_reservations')).rows[0];assert.equal(Number(row.actual_minor),7000);assert.equal(row.evidence_ref,'corrected.invoice');
  await assert.rejects(s.reserve(input('next')),{code:'PROVIDER_SPEND_BREACH'});
 });
 it('runtime cannot edit policy/cohort/delete ledger, unsafe superuser pool denied',async()=>{
  await assert.rejects(runtime.query('update provider_spend_policy set enabled=true'),{code:'42501'});await assert.rejects(runtime.query('delete from provider_spend_reservations'),{code:'42501'});
  await assert.rejects(new MonthlyProviderSpend({pool:owner,enabled:true}).reserve(input('unsafe')),{code:'PROVIDER_SPEND_SCHEMA_UNSAFE'});
 });
});
