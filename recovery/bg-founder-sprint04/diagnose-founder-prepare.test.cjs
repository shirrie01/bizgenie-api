'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {category,trace,guard,databaseEvidence,validateUrl,SQL,CONTROL,INIT}=require('./diagnose-founder-prepare.cjs');
const {PostgresBillingRepository}=require('../../src/billing/postgresRepository');
const canary='PRIVATE_SENTINEL_DO_NOT_PRINT';
function fault(code){return Object.assign(Error(canary),{code,detail:canary,stack:canary});}
function fixture(options={}){
 const calls=[],released=[];let connects=0,ends=0,rejectPending;
 const client={async query(q){calls.push(q);const label=INIT.get(require('node:crypto').createHash('sha256').update(q.text).digest('hex'));
  if(options.never===q.text)return new Promise((_,reject)=>rejectPending=reject);
  if(options.fail!==undefined&&(options.fail===q.text||options.fail===label))throw fault(options.code||'42P01');
  if(CONTROL.includes(q.text))return{rows:[],rowCount:0};
  if(q.text===SQL.role)return{rows:[{approved:options.role!==false,db_ok:true}]};
  if(label==='billing.relations')return {rows:q.values[0].map((name,i)=>({name,relation:options.bad===label&&i===0?null:name}))};
  if(label==='billing.authority_constraints')return {rows:(options.bad===label?[]:['generation_jobs_job_tenant_project_unique','credit_ledger_generation_job_fkey','credit_ledger_generation_authority_shape']).map(conname=>({conname}))};
  if(label==='billing.ledger_infrastructure')return {rows:[{idempotency_index:options.bad===label?null:'synthetic',authority_trigger:true}]};
  if(label==='billing.customer_privileges')return {rows:[],rowCount:options.bad===label?1:0};
  if(label==='billing.policy_prices')return {rows:options.bad===label?[]:[{policy_id:'staging.standard.v1',execution_class:'text.standard',credit_cost:1}]};
  if(q.text===SQL.policy)return {rows:options.policyMissing?[]:[{plan_code:'synthetic',included_monthly_credits:options.amount||100,observed_at:options.date||'2026-11-24T12:00:00Z'}]};
  if(q.text===SQL.entitlement)return {rows:[],rowCount:options.entitlement?1:0};
  if(q.text===SQL.account)return {rows:options.account?[{account_id:canary,status:options.account}]:[]};
  if(q.text===SQL.balance)return {rows:[{ledger:options.ledger??0,reserved:options.reserved??0,entries:0}]};
  throw Error('Unexpected native query');
 },release(destroy){released.push(destroy);rejectPending?.(fault('ECONNRESET'));if(options.releaseFailure)throw fault('ECONNRESET');},async end(){}};
 const pool={on(){},async query(){throw Error('Outside-transaction query forbidden');},async connect(){connects++;if(options.connectFailure)throw fault(options.connectFailure);return client;},async end(){ends++;if(options.endFailure)throw fault('ECONNRESET');}};
 return {pool,client,calls,released,get connects(){return connects;},get ends(){return ends;},run:over=>databaseEvidence({pool,Repository:PostgresBillingRepository,cfg:{approvedOperatorDbRole:canary},scope:{tenantId:canary},policyIds:['staging.standard.v1'],classes:['text.standard'],...over})};
}
test('error categories are allowlisted and never serialize raw code/message/details/stack',()=>{
 for(const [code,want] of [['ENOTFOUND','DNS_FAILURE'],['ECONNREFUSED','TCP_REFUSED'],['SELF_SIGNED_CERT_IN_CHAIN','TLS_UNTRUSTED_CHAIN'],['28P01','DATABASE_AUTHENTICATION_FAILED'],['42501','DATABASE_PRIVILEGE_DENIED'],['42P01','DATABASE_RELATION_MISSING'],['57014','DATABASE_STATEMENT_TIMEOUT'],['ENOENT','LOCAL_FILE_MISSING'],['ENOSPC','LOCAL_STORAGE_FULL'],['BILLING_NOT_CONFIGURED','BILLING_CONFIGURATION_REJECTED'],[canary,'UNCLASSIFIED_EXCEPTION'],['constructor','UNCLASSIFIED_EXCEPTION'],['__proto__','UNCLASSIFIED_EXCEPTION']])assert.equal(category(fault(code)),want);
 assert.equal(category({name:'SyntaxError',message:canary}),'LOCAL_JSON_INVALID');assert.equal(category({name:'constructor',message:canary}),'UNCLASSIFIED_EXCEPTION');
});
test('query guard refuses all unknown SQL, including writes and writable CTEs, before the native client',async()=>{
 const f=fixture(),q=guard(f.client,trace(),()=>true);
 for(const sql of ['INSERT INTO anything VALUES(1)','UPDATE anything SET x=1','DELETE FROM anything','CREATE TABLE anything(x int)','BEGIN','COMMIT','SET ROLE postgres','WITH gone AS (DELETE FROM anything RETURNING *) SELECT * FROM gone','SELECT 1'])await assert.rejects(q(sql));
 assert.equal(f.calls.length,0);
});
test('actual billing initializer runs only the five pinned catalog queries after READ ONLY begins; one client only',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'READ_ONLY_DIAGNOSTIC_PASS');assert.equal(r.fundingExecuted,false);assert.equal(r.planCreated,false);assert.equal(r.planFileCreation,'NOT_TESTED_READ_ONLY');assert.equal(f.connects,1);assert.equal(f.ends,1);assert.deepEqual(f.released,[false]);assert.equal(f.calls[0].text,CONTROL[0]);assert.equal(f.calls.at(-1).text,'ROLLBACK');
 const hashes=f.calls.map(q=>require('node:crypto').createHash('sha256').update(q.text).digest('hex'));for(const key of INIT.keys())assert.ok(hashes.includes(key));assert.ok(!JSON.stringify(r).includes(canary));
});
for(const label of ['billing.relations','billing.authority_constraints','billing.ledger_infrastructure','billing.customer_privileges','billing.policy_prices'])test('initializer rejects '+label+' at the exact safe stage',async()=>{
 const f=fixture({bad:label}),r=await f.run();assert.equal(r.status,'HOLD');assert.deepEqual(r.failure,{stage:label,category:'BILLING_CONFIGURATION_REJECTED'});assert.equal(f.calls.at(-1).text,'ROLLBACK');assert.deepEqual(f.released,[false]);
});
test('driver SQLSTATE survives original repository error wrapping and later cleanup failures',async()=>{
 const f=fixture({fail:'billing.customer_privileges',code:'42501',endFailure:true}),r=await f.run();assert.deepEqual(r.failure,{stage:'billing.customer_privileges',category:'DATABASE_PRIVILEGE_DENIED'});assert.ok(!JSON.stringify(r).includes(canary));assert.equal(f.ends,1);
});
test('connection DNS/auth/TLS failures are separated without issuing SQL or leaking credentials',async()=>{
 for(const code of ['ENOTFOUND','28P01','SELF_SIGNED_CERT_IN_CHAIN']){const f=fixture({connectFailure:code}),r=await f.run();assert.equal(r.failure.stage,'connection.acquire');assert.equal(r.failure.category,category(fault(code)));assert.equal(f.calls.length,0);assert.equal(f.ends,1);assert.ok(!JSON.stringify(r).includes(canary));}
});
test('role, policy, entitlement and balance conditions yield honest HOLD categories',async()=>{
 for(const [options,stage,code] of [[{role:false},'prepare.role','APPROVED_DATABASE_ROLE_OR_DATABASE_MISMATCH'],[{policyMissing:true},'prepare.policy','ACTIVE_STAGING_POLICY_MISSING'],[{amount:99},'prepare.policy','POLICY_ALLOWANCE_MISMATCH'],[{date:'not-a-date'},'prepare.policy','POLICY_TIMESTAMP_INVALID'],[{entitlement:true},'prepare.entitlement','SERVING_ENTITLEMENT_ALREADY_EXISTS'],[{account:'frozen'},'prepare.account','ACCOUNT_NOT_ACTIVE'],[{account:'active',reserved:1},'prepare.balance','RESERVATIONS_OR_INVALID_BALANCE']]){const f=fixture(options),r=await f.run();assert.deepEqual(r.failure,{stage,category:code});assert.equal(f.calls.at(-1).text,'ROLLBACK');assert.equal(f.released.length,1);}
});
test('statement timeout rolls back; failed rollback discards the client; pool end cannot turn failure into pass',async()=>{
 const f=fixture({fail:SQL.policy,code:'57014'}),r=await f.run();assert.equal(r.failure.category,'DATABASE_STATEMENT_TIMEOUT');assert.equal(f.calls.at(-1).text,'ROLLBACK');assert.deepEqual(f.released,[false]);
 const g=fixture({fail:'ROLLBACK',code:'ECONNRESET'}),s=await g.run();assert.deepEqual(s.failure,{stage:'cleanup.rollback',category:'CONNECTION_RESET'});assert.deepEqual(g.released,[true]);
 const h=fixture({endFailure:true}),u=await h.run();assert.equal(u.status,'HOLD');assert.equal(u.failure.stage,'cleanup.pool_end');
});
test('overall deadline discards in-flight connection and never issues subsequent SQL',async()=>{
 const f=fixture({never:SQL.policy}),r=await f.run({overallMs:15});assert.equal(r.status,'HOLD');assert.equal(r.failure.category,'DIAGNOSTIC_TIMEOUT');assert.deepEqual(f.released,[true]);assert.equal(f.calls.at(-1).text,SQL.policy);assert.equal(f.ends,1);
});
test('URL checks detect missing password/CA files without database access or TLS downgrade',()=>{
 const url='postgresql:'+'//postgres.'+'zrczojyxebwjgpymbmgu'+':synthetic@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
 assert.equal(validateUrl(url,{}).pathname,'/postgres');
 assert.throws(()=>validateUrl(url.replace(':synthetic',''),{}));
 assert.throws(()=>validateUrl(url+'?sslrootcert=/definitely-not-an-existing-public-ca.pem',{}),e=>category(e)==='CONFIGURED_TLS_CA_FILE_MISSING');
 assert.throws(()=>validateUrl(url,{NODE_EXTRA_CA_CERTS:'/definitely-not-an-existing-public-ca.pem'}),e=>category(e)==='EXTRA_TLS_CA_FILE_MISSING');
 assert.throws(()=>validateUrl(url,{PGHOST:'synthetic'}));
});
test('CLI refuses modes and permissive config before any cloud or database operation',()=>{
 const script=path.join(__dirname,'diagnose-founder-prepare.cjs');let r=spawnSync(process.execPath,[script,'execute','/synthetic/private.json'],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).failure.stage,'local.arguments');assert.equal(r.stderr,'');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prepare-diagnostic-test-'));try{const config=path.join(dir,'config.json');fs.writeFileSync(config,'{}',{mode:0o644});fs.chmodSync(config,0o644);r=spawnSync(process.execPath,[script,config],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).failure.category,'PRIVATE_FILE_PERMISSIONS');assert.equal(r.stderr,'');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('pool/repository constructors issue no SQL before the transaction; initializer has no write route',()=>{
 const {createPostgresBrandBrainRepositoryFromEnv}=require('../../src/brand-brain/postgresRepository');let calls=0;
 class FakePool{query(){calls++;throw Error('No query permitted');}connect(){throw Error('No connect permitted');}}
 const env={BRAND_BRAIN_DATABASE_URL:'postgresql:'+'//synthetic:synthetic@127.0.0.1/synthetic'};
 const b=createPostgresBrandBrainRepositoryFromEnv({env,PoolClass:FakePool});new PostgresBillingRepository({pool:b.pool});assert.equal(calls,0);
 const code=fs.readFileSync(path.join(__dirname,'diagnose-founder-prepare.cjs'),'utf8');assert.doesNotMatch(code,/grantMonthlyCredits\s*\(|adjustCredits\s*\(|\.writeFile|\.openSync|versions','access/);
});

test('pinned original prepare reproduces generic masking of DNS, schema and plan-save errors, and cleanup can replace the primary failure',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto');
 const source=fs.readFileSync(path.join(__dirname,'../bg-founder-sprint02/founder-funding.cjs'),'utf8');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'3567b59a3e5b563488bb07e2400f8d978e701ece4c882e32c01d3f1b57c1e570');
 for(const scenario of ['dns','schema','save','cleanup']){
  const f=fixture(scenario==='dns'?{connectFailure:'ENOTFOUND'}:scenario==='schema'?{bad:'billing.relations'}:scenario==='cleanup'?{connectFailure:'ENOTFOUND',endFailure:true}:{});
  const native=f.pool.connect.bind(f.pool);f.pool.connect=async()=>{const c=await native();return {...c,query:(text,values)=>c.query(typeof text==='string'?{text,values}:text)};};
  const binding={founderId:'11111111-1111-4111-8111-111111111111',tenantId:'synthetic_tenant',projectId:'synthetic_project',brandId:'synthetic_brand',campaignId:'33333333-3333-4333-8333-333333333333'};
  const bindingBytes=Buffer.from(JSON.stringify(binding));const cfg={repoPath:'/synthetic/repo',bindingFile:'/private/binding.json',planFile:'/private/plan.json',resultFile:'/private/result.json',operatorName:'synthetic',operatorGoogleAccount:'synthetic@example.test',bindingEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-123',runtimeEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-124',bindingFormat:'diagnostic',bindingSha256:crypto.createHash('sha256').update(bindingBytes).digest('hex'),approvedOperatorDbRole:'synthetic',runtime:{revision:'bizgenie-api-staging-synthetic',imageDigest:'sha256:'+'a'.repeat(64),serviceAccount:'synthetic',dbSecretVersion:'latest'}};
  const runtime={metadata:{labels:{'serving.knative.dev/service':'bizgenie-api-staging'}},status:{imageDigest:cfg.runtime.imageDigest,conditions:[{type:'Ready',status:'True'}]},spec:{serviceAccountName:'synthetic',containers:[{env:[{name:'BILLING_DURABLE_ENABLED',value:'true'},{name:'SUPABASE_URL',value:'https://zrczojyxebwjgpymbmgu.supabase.co'},{name:'BILLING_APPROVED_POLICY_IDS',value:'staging.standard.v1'},{name:'BILLING_APPROVED_EXECUTION_CLASSES',value:'text.standard'},{name:'BRAND_BRAIN_DATABASE_URL',valueFrom:{secretKeyRef:{name:'bizgenie-staging-database-url',key:'latest'}}}]}]}};
  const fakeFs={lstatSync:()=>({isFile:()=>true,mode:0o600,uid:1000}),readFileSync:(name,encoding)=>{const b=name==='/private/binding.json'?bindingBytes:Buffer.from(JSON.stringify(cfg));return encoding?b.toString():b;},existsSync:()=>false,openSync:()=>{throw fault('ENOSPC');}};
  const moduleLoader=name=>{if(name==='./src/brand-brain/postgresRepository')return{createPostgresBrandBrainRepositoryFromEnv:()=>({pool:f.pool})};if(name==='./src/billing/postgresRepository')return{PostgresBillingRepository};if(name==='./src/billing/service')return require('../../src/billing/service');if(name==='./src/billing/paidBetaProvisioning')return require('../../src/billing/paidBetaProvisioning');throw Error('Unexpected module');};
  const fakeRequire=name=>{if(name==='node:fs')return fakeFs;if(name==='node:module')return{createRequire:()=>moduleLoader};if(name==='node:child_process')return{execFileSync:(command,args)=>command==='git'?(args[0]==='rev-parse'?'20951d143bcbcb140bb160f5b81f4e86f329345b':''):(args[0]==='auth'?'synthetic@example.test':JSON.stringify(runtime))};return require(name);};
  const run=vm.runInNewContext(source+'\nmain;',{require:fakeRequire,module:{},process:{versions:{node:'22.23.5'},argv:['node','funding','prepare','/private/config.json'],getuid:()=>1000,env:{BRAND_BRAIN_DATABASE_URL:'postgresql:'+'//postgres.zrczojyxebwjgpymbmgu:synthetic@aws-1-eu-west-1.pooler.supabase.com/postgres'}},URL,Buffer,console:{log(){},error(){}},setTimeout,clearTimeout});
  let thrown;try{await run();}catch(e){thrown=e;}assert.ok(thrown,scenario);assert.equal(thrown.safeCode||'OPERATOR_OPERATION_FAILED_OUTCOME_REQUIRES_READBACK','OPERATOR_OPERATION_FAILED_OUTCOME_REQUIRES_READBACK');
  if(scenario==='dns')assert.equal(thrown.code,'ENOTFOUND');if(scenario==='schema')assert.equal(thrown.code,'BILLING_NOT_CONFIGURED');if(scenario==='save')assert.equal(thrown.code,'ENOSPC');if(scenario==='cleanup')assert.equal(thrown.code,'ECONNRESET');
  assert.ok(f.calls.every(q=>CONTROL.includes(q.text)||Object.values(SQL).includes(q.text)||INIT.has(crypto.createHash('sha256').update(q.text).digest('hex'))));
 }
});
