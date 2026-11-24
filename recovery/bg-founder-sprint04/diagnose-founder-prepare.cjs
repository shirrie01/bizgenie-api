#!/usr/bin/env node
'use strict';
// READ-ONLY ONLY. Does not load/run the funding CLI or BillingService. No plan/result creation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const SOURCE='20951d143bcbcb140bb160f5b81f4e86f329345b',PIN='3567b59a3e5b563488bb07e2400f8d978e701ece4c882e32c01d3f1b57c1e570',PROJECT='zrczojyxebwjgpymbmgu',POLICY='staging.standard.v1',END='2026-11-30T23:59:00.000Z';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const INIT=new Map([
 ['b307759368d9e18935595e195adc12659af23fad866364698b690154b558c576','billing.relations'],
 ['712ba57e8efea8afa74bf4adb730d7ce8b929a763cbe1e24c79bc4767ffe4b13','billing.authority_constraints'],
 ['31817d2db5dcfa542a56e09e70b299d86cf9652586949462074abf40212a8d44','billing.ledger_infrastructure'],
 ['1db1ce7319ea6f319036763c31b7632a26de1cf5f19785d7b47922116801f65d','billing.customer_privileges'],
 ['39dbe63d92e87be63a61fb16f001cc40a26b5bde733bfb7c02aae5838a22af9f','billing.policy_prices']]);
const SQL=Object.freeze({
 role:'select current_user=$1 as approved, current_database()=$2 as db_ok',
 policy:"select *, current_timestamp as observed_at from public.commercial_policies where policy_id=$1 and status='active' and effective_from<=current_timestamp and (effective_to is null or current_timestamp<effective_to)",
 entitlement:"select * from public.tenant_entitlements where tenant_id=$1 and status in ('active','grace','cancel_pending')",
 account:'select account_id,status from public.credit_accounts where tenant_id=$1',
 balance:'select coalesce(sum(balance_delta),0) as ledger,coalesce(sum(reserved_delta),0) as reserved,count(*) as entries from public.credit_ledger where tenant_id=$1 and account_id=$2'
});
const CONTROL=Object.freeze(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',"SET LOCAL statement_timeout='4s'","SET LOCAL lock_timeout='2s'","SET LOCAL idle_in_transaction_session_timeout='10s'",'ROLLBACK']);
const NAMED=new Map(Object.entries(SQL).map(([name,text])=>[hash(text),'prepare.'+name]));
class Stop extends Error{constructor(category){super('Diagnostic stopped');this.category=category;}}
function need(value,category){if(!value)throw new Stop(category);}
function category(e){
 if(e instanceof Stop)return e.category;
 const codes={ENOTFOUND:'DNS_FAILURE',EAI_AGAIN:'DNS_FAILURE',ECONNREFUSED:'TCP_REFUSED',ETIMEDOUT:'NETWORK_TIMEOUT',ENETUNREACH:'NETWORK_UNREACHABLE',EHOSTUNREACH:'NETWORK_UNREACHABLE',ECONNRESET:'CONNECTION_RESET',SELF_SIGNED_CERT_IN_CHAIN:'TLS_UNTRUSTED_CHAIN',DEPTH_ZERO_SELF_SIGNED_CERT:'TLS_UNTRUSTED_CHAIN',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS_UNTRUSTED_CHAIN',UNABLE_TO_GET_ISSUER_CERT_LOCALLY:'TLS_UNTRUSTED_CHAIN',ERR_TLS_CERT_ALTNAME_INVALID:'TLS_HOSTNAME_MISMATCH',CERT_HAS_EXPIRED:'TLS_CERTIFICATE_EXPIRED',ENOENT:'LOCAL_FILE_MISSING',EACCES:'LOCAL_PERMISSION_DENIED',ENOSPC:'LOCAL_STORAGE_FULL','28P01':'DATABASE_AUTHENTICATION_FAILED','28000':'DATABASE_AUTHENTICATION_FAILED','42501':'DATABASE_PRIVILEGE_DENIED','42P01':'DATABASE_RELATION_MISSING','42703':'DATABASE_COLUMN_MISSING','42704':'DATABASE_OBJECT_MISSING','3F000':'DATABASE_SCHEMA_MISSING','57014':'DATABASE_STATEMENT_TIMEOUT','25006':'READ_ONLY_VIOLATION','53300':'DATABASE_CONNECTION_LIMIT','57P01':'DATABASE_UNAVAILABLE','08006':'DATABASE_CONNECTION_FAILURE','22P02':'DATABASE_INPUT_TYPE_MISMATCH',MODULE_NOT_FOUND:'LOCAL_DEPENDENCY_MISSING',BILLING_NOT_CONFIGURED:'BILLING_CONFIGURATION_REJECTED',BILLING_PERSISTENCE_UNAVAILABLE:'BILLING_QUERY_FAILED'};
 if(Object.hasOwn(codes,e?.code))return codes[e.code];
 const names={SyntaxError:'LOCAL_JSON_INVALID',TypeError:'LOCAL_TYPE_ERROR',RangeError:'LOCAL_RANGE_ERROR',URIError:'LOCAL_URL_ENCODING_INVALID'};return Object.hasOwn(names,e?.name)?names[e.name]:'UNCLASSIFIED_EXCEPTION';
}
function trace(){const events=[];let stage='start',failure=null;return{events,get stage(){return stage;},get failure(){return failure;},at(s){stage=s;},pass(){events.push({stage,status:'PASS'});},fail(e){if(!failure)failure={stage,category:category(e)};},report(){return {status:failure?'HOLD':'READ_ONLY_DIAGNOSTIC_PASS',failure,stages:events,originalPrepareRetried:false,planCreated:false,planFileCreation:'NOT_TESTED_READ_ONLY',fundingExecuted:false,operatorConnectionOnly:true};}};}
function bound(work,ms,onLate){let timer,expired=false;const p=Promise.resolve(work).then(v=>{if(expired)onLate?.(v);return v;});return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Stop('DIAGNOSTIC_TIMEOUT'));},ms);})]).finally(()=>clearTimeout(timer));}
function guard(client,t,alive){return async(text,values=[])=>{need(alive(),'DIAGNOSTIC_ABORTED');const h=hash(text),label=INIT.get(h)||NAMED.get(h)||(CONTROL.includes(text)?'transaction.'+(text==='ROLLBACK'?'rollback':text.startsWith('BEGIN')?'begin':'limits'):null);need(label,'SQL_NOT_ALLOWLISTED');t.at(label);try{const result=await bound(client.query({text,values,query_timeout:5000}),6000);need(alive(),'DIAGNOSTIC_ABORTED');t.pass();return result;}catch(e){t.fail(e);throw e;}};}
// Testable pure boundary. Production CLI constructs exactly one pool from the existing factory.
async function databaseEvidence({pool,Repository,cfg,scope,policyIds,classes,t=trace(),overallMs=45000}){
 let client,aborted=false,discard=false,primary;pool.on?.('error',e=>{t.at('connection.idle');t.fail(e);aborted=true;});
 const work=(async()=>{
  t.at('connection.acquire');client=await bound(pool.connect(),10000,c=>c.release(true));need(!aborted,'DIAGNOSTIC_ABORTED');t.pass();
  const q=guard(client,t,()=>!aborted);
  for(const statement of CONTROL.slice(0,4))await q(statement);
  const who=(await q(SQL.role,[cfg.approvedOperatorDbRole,'postgres'])).rows[0];need(who?.approved&&who.db_ok,'APPROVED_DATABASE_ROLE_OR_DATABASE_MISMATCH');
  const repo=new Repository({pool:{query:q,connect:()=>{throw new Stop('INDEPENDENT_CONNECTION_REFUSED');}}});
  await repo.initialize({approvedPolicyIds:policyIds,requiredExecutionClasses:classes});
  const policy=(await q(SQL.policy,[POLICY])).rows[0];need(policy,'ACTIVE_STAGING_POLICY_MISSING');
  need(Number(policy.included_monthly_credits)===100,'POLICY_ALLOWANCE_MISMATCH');
  const observed=new Date(policy.observed_at);need(Number.isFinite(observed.getTime()),'POLICY_TIMESTAMP_INVALID');need(observed.toISOString()<END,'FUNDING_WINDOW_EXPIRED');
  need((await q(SQL.entitlement,[scope.tenantId])).rowCount===0,'SERVING_ENTITLEMENT_ALREADY_EXISTS');
  const accounts=(await q(SQL.account,[scope.tenantId])).rows;need(accounts.length<=1,'ACCOUNT_AMBIGUOUS');let state={accountId:null,ledger:0,reserved:0,available:0,entries:0};
  if(accounts.length){need(accounts[0].status==='active','ACCOUNT_NOT_ACTIVE');const s=(await q(SQL.balance,[scope.tenantId,accounts[0].account_id])).rows[0];const n=v=>{const x=Number(v);need(Number.isSafeInteger(x),'FINANCIAL_NUMBER_INVALID');return x;};state={accountId:accounts[0].account_id,ledger:n(s.ledger),reserved:n(s.reserved),available:n(s.ledger)-n(s.reserved),entries:n(s.entries)};}
  need(state.reserved===0&&state.ledger>=0,'RESERVATIONS_OR_INVALID_BALANCE');
  t.at('plan.serialize_memory_only');const token=hash(scope.tenantId).slice(0,24);JSON.stringify({source:SOURCE,tenantId:scope.tenantId,entitlementId:'founder_20261130_'+token,accountId:state.accountId||'founder_account_'+token,planCode:policy.plan_code,baseline:state,amount:100,endsAt:END});t.pass();
 })();
 try{await bound(work,overallMs);}
 catch(e){primary=e;t.fail(e);if(e instanceof Stop&&e.category==='DIAGNOSTIC_TIMEOUT')discard=true;aborted=true;}
 finally{
  if(client){
   if(!discard){t.at('cleanup.rollback');try{await bound(client.query({text:'ROLLBACK',query_timeout:3000}),3500);t.pass();}catch(e){discard=true;t.fail(e);}}
   t.at('cleanup.release');try{client.release(discard);t.pass();}catch(e){t.fail(e);try{await bound(client.end(),3000);}catch{}}
  }
  t.at('cleanup.pool_end');try{await bound(pool.end(),4000);t.pass();}catch(e){t.fail(e);}
 }
 return t.report();
}
function privateJson(file){need(typeof file==='string'&&path.isAbsolute(file),'PRIVATE_CONFIG_PATH_INVALID');const s=fs.lstatSync(file);need(s.isFile()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'PRIVATE_FILE_PERMISSIONS');return JSON.parse(fs.readFileSync(file,'utf8'));}
function cloud(args){try{return execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:2*1024*1024});}catch{throw new Stop('EXISTING_GCLOUD_METADATA_ACCESS_FAILED');}}
function validateUrl(raw,env){
 need(!Object.keys(env).some(k=>k.startsWith('PG')),'AMBIGUOUS_PG_ENVIRONMENT');need(typeof raw==='string'&&raw,'EXISTING_PRIVATE_DATABASE_ENV_MISSING');const u=new URL(raw),user=decodeURIComponent(u.username);
 need(['postgres:','postgresql:'].includes(u.protocol)&&u.pathname==='/postgres'&&!raw.includes('uvgblmejpbswkvlqvqmz'),'STAGING_DATABASE_ONLY');need(u.password,'DATABASE_PASSWORD_MISSING');
 need((u.hostname===`db.${PROJECT}.supabase.co`&&user==='postgres')||(u.hostname.endsWith('.pooler.supabase.com')&&user===`postgres.${PROJECT}`),'STAGING_DATABASE_ONLY');
 for(const k of ['host','hostaddr','user','password','dbname','port','options','service','passfile'])need(!u.searchParams.has(k),'AMBIGUOUS_DATABASE_URL');
 if(u.searchParams.has('sslrootcert'))need(fs.existsSync(u.searchParams.get('sslrootcert')),'CONFIGURED_TLS_CA_FILE_MISSING');
 // Do not alter sslmode, certificate verification, NODE_EXTRA_CA_CERTS or connection credentials.
 if(env.NODE_EXTRA_CA_CERTS)need(fs.existsSync(env.NODE_EXTRA_CA_CERTS),'EXTRA_TLS_CA_FILE_MISSING');return u;
}
async function main(){
 const t=trace();let pool;
 try{
  t.at('local.arguments');need(process.versions.node.split('.')[0]==='22'&&process.argv.length===3,'NODE22_AND_PRIVATE_CONFIG_ONLY');t.pass();
  t.at('local.config');const file=path.resolve(process.argv[2]),cfg=privateJson(file);need(typeof cfg.repoPath==='string'&&path.isAbsolute(cfg.repoPath),'REPOSITORY_PATH_INVALID');t.pass();
  t.at('local.plan_path');for(const p of [cfg.planFile,cfg.resultFile])need(typeof p==='string'&&path.isAbsolute(p),'PRIVATE_PLAN_PATH_INVALID');need(!fs.existsSync(cfg.planFile)&&!fs.existsSync(cfg.resultFile),'EXISTING_PLAN_OR_RESULT_PRESERVED');need(fs.statSync(path.dirname(cfg.planFile)).isDirectory(),'PLAN_PARENT_NOT_DIRECTORY');fs.accessSync(path.dirname(cfg.planFile),fs.constants.W_OK|fs.constants.X_OK);t.pass();
  t.at('local.pinned_operator_asset');need(hash(fs.readFileSync(path.join(path.dirname(file),'founder-funding.cjs')))===PIN,'PINNED_FUNDING_ASSET_MISMATCH');t.pass();
  t.at('local.accepted_binding');const b=privateJson(cfg.bindingFile);need(hash(fs.readFileSync(cfg.bindingFile))===cfg.bindingSha256,'ACCEPTED_BINDING_HASH_MISMATCH');let scope;
  if(cfg.bindingFormat==='diagnostic')scope={tenantId:b.tenantId};else if(cfg.bindingFormat==='r2-release')scope={tenantId:b.environment?.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID};else throw new Stop('ACCEPTED_BINDING_FORMAT_INVALID');need(typeof scope.tenantId==='string'&&scope.tenantId,'ACCEPTED_TENANT_BINDING_MISSING');t.pass();
  t.at('local.approved_source');need(execFileSync('git',['rev-parse','HEAD'],{cwd:cfg.repoPath,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()===SOURCE,'APPROVED_SOURCE_MISMATCH');execFileSync('git',['diff','--exit-code',SOURCE,'--','src/billing','src/brand-brain/postgresRepository.js'],{cwd:cfg.repoPath,stdio:'ignore'});t.pass();
  t.at('metadata.operator');need(cloud(['auth','list','--filter=status:ACTIVE','--format=value(account)']).trim()===cfg.operatorGoogleAccount,'EXISTING_OPERATOR_ACCOUNT_MISMATCH');t.pass();
  t.at('metadata.runtime');const rt=cfg.runtime;need(rt&&typeof rt.revision==='string'&&/^bizgenie-api-staging-/.test(rt.revision),'RUNTIME_PIN_MISSING');const r=JSON.parse(cloud(['run','revisions','describe',rt.revision,'--project=bizgenie-backend','--region=europe-west1','--format=json']));
  need(r.metadata?.labels?.['serving.knative.dev/service']==='bizgenie-api-staging'&&r.spec?.serviceAccountName===rt.serviceAccount&&typeof rt.imageDigest==='string'&&r.status?.imageDigest?.endsWith(rt.imageDigest)&&r.status?.conditions?.some(c=>c.type==='Ready'&&String(c.status)==='True'),'RUNTIME_PIN_MISMATCH');
  const vars=r.spec?.containers?.[0]?.env;need(Array.isArray(vars),'RUNTIME_METADATA_SHAPE_INVALID');const value=k=>vars.find(v=>v.name===k)?.value;
  need(value('BILLING_DURABLE_ENABLED')==='true'&&value('SUPABASE_URL')===`https://${PROJECT}.supabase.co`,'RUNTIME_BILLING_OR_STAGING_MISMATCH');
  const ids=value('BILLING_APPROVED_POLICY_IDS'),kinds=value('BILLING_APPROVED_EXECUTION_CLASSES');need(typeof ids==='string'&&typeof kinds==='string','RUNTIME_LIST_VALUES_NOT_STRINGS');const policyIds=ids.split(',').map(s=>s.trim()),classes=kinds.split(',').map(s=>s.trim()).filter(Boolean);need(policyIds.includes(POLICY)&&classes.length,'RUNTIME_POLICY_OR_CLASSES_MISMATCH');
  const secret=vars.find(v=>v.name==='BRAND_BRAIN_DATABASE_URL')?.valueFrom?.secretKeyRef;need(secret?.name==='bizgenie-staging-database-url'&&String(secret.key)===rt.dbSecretVersion,'DATABASE_SECRET_REFERENCE_MISMATCH');t.pass();
  t.at('connection.private_configuration');validateUrl(process.env.BRAND_BRAIN_DATABASE_URL,process.env);need(typeof cfg.approvedOperatorDbRole==='string'&&cfg.approvedOperatorDbRole,'APPROVED_OPERATOR_ROLE_MISSING');t.pass();
  t.at('local.module_import');const req=createRequire(path.join(cfg.repoPath,'package.json'));const {createPostgresBrandBrainRepositoryFromEnv}=req('./src/brand-brain/postgresRepository'),{PostgresBillingRepository}=req('./src/billing/postgresRepository');t.pass();
  t.at('connection.pool_factory');pool=createPostgresBrandBrainRepositoryFromEnv({env:process.env}).pool;t.pass();
  return await databaseEvidence({pool,Repository:PostgresBillingRepository,cfg,scope,policyIds,classes,t});
 }catch(e){t.fail(e);if(pool){try{await bound(pool.end(),4000);}catch{}}return t.report();}
}
if(require.main===module)main().then(r=>{console.log(JSON.stringify(r));process.exitCode=r.status==='READ_ONLY_DIAGNOSTIC_PASS'?0:1;}).catch(()=>{console.log(JSON.stringify({status:'HOLD',failure:{stage:'diagnostic',category:'UNCLASSIFIED_EXCEPTION'},fundingExecuted:false}));process.exitCode=1;});
module.exports={category,trace,guard,databaseEvidence,validateUrl,SQL,CONTROL,INIT};
