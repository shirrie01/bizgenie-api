#!/usr/bin/env node
'use strict';
// Operator handoff only. No action unless explicitly invoked. No HTTP/provider/Stripe calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const SOURCE='20951d143bcbcb140bb160f5b81f4e86f329345b',POLICY='staging.standard.v1',END='2026-11-30T23:59:00.000Z',PROJECT='zrczojyxebwjgpymbmgu';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function need(v,code){if(!v)throw Object.assign(Error(code),{safeCode:code});}
const ref=x=>typeof x==='string'&&/^https:\/\/github\.com\/shirrie01\/bizgenie-api\/(issues|pull)\/\d+#issuecomment-\d+$/.test(x);
function privateJson(file){need(path.isAbsolute(file),'PRIVATE_PATH_REQUIRED');const st=fs.lstatSync(file);need(st.isFile()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'PRIVATE_FILE_PERMISSIONS');return JSON.parse(fs.readFileSync(file,'utf8'));}
function save(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');}finally{fs.closeSync(fd);}}
function cloud(args){try{return execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000,maxBuffer:2*1024*1024});}catch{throw Object.assign(Error(),{safeCode:'EXISTING_GCLOUD_ACCESS_REQUIRED'});}}
const n=x=>{const v=Number(x);need(Number.isSafeInteger(v),'UNSAFE_FINANCIAL_NUMBER');return v;};
const iso=x=>new Date(x).toISOString();
async function main(){
 need(process.versions.node.split('.')[0]==='22','EXISTING_NODE22_REQUIRED');
 const [mode,configPath]=process.argv.slice(2);need(['prepare','execute','verify','compensate'].includes(mode)&&process.argv.length===4,'USAGE_MODE_AND_PRIVATE_CONFIG');
 const cfg=privateJson(path.resolve(configPath));
 need(path.isAbsolute(cfg.repoPath)&&path.isAbsolute(cfg.bindingFile)&&path.isAbsolute(cfg.planFile)&&path.isAbsolute(cfg.resultFile),'PRIVATE_PATH_REQUIRED');
 need(cfg.planFile!==cfg.resultFile&&cfg.planFile!==cfg.bindingFile&&cfg.resultFile!==cfg.bindingFile,'PRIVATE_PATH_CONFLICT');
 need(typeof cfg.operatorName==='string'&&cfg.operatorName.trim()&&typeof cfg.operatorGoogleAccount==='string'&&cfg.operatorGoogleAccount.includes('@'),'NAMED_OPERATOR_REQUIRED');
 need(cloud(['auth','list','--filter=status:ACTIVE','--format=value(account)']).trim()===cfg.operatorGoogleAccount,'OPERATOR_ACCOUNT_MISMATCH');
 need(ref(cfg.bindingEvidenceRef)&&ref(cfg.runtimeEvidenceRef),'GENUINE_EXISTING_EVIDENCE_REFERENCES_REQUIRED');
 const binding=privateJson(cfg.bindingFile);need(sha(fs.readFileSync(cfg.bindingFile))===cfg.bindingSha256,'PRIVATE_BINDING_HASH_MISMATCH');
 let scope;
 if(cfg.bindingFormat==='diagnostic')scope={founderId:binding.founderId,tenantId:binding.tenantId,projectId:binding.projectId,brandId:binding.brandId,campaignId:binding.campaignId};
 else if(cfg.bindingFormat==='r2-release'){const e=binding.environment||{};scope={founderId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,tenantId:e.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,projectId:e.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brandId:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID,campaignId:cfg.acceptedCampaignId};}
 else need(false,'EXISTING_BINDING_FORMAT_REQUIRED');
 for(const v of Object.values(scope))need(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v)&&!/UNRESOLVED|UNKNOWN|PENDING/.test(v),'COMPLETE_VERIFIED_PRIVATE_SCOPE_REQUIRED');
 need(/^[a-f0-9-]{36}$/i.test(scope.founderId)&&/^[a-f0-9-]{36}$/i.test(scope.campaignId),'VERIFIED_IDENTITY_AND_CAMPAIGN_REQUIRED');
 // Do not rediscover workspace/owner/campaign: the pinned manifest/evidence is already accepted.
 need(execFileSync('git',['rev-parse','HEAD'],{cwd:cfg.repoPath,encoding:'utf8'}).trim()===SOURCE,'APPROVED_SOURCE_REQUIRED');
 execFileSync('git',['diff','--exit-code',SOURCE,'--','src/billing','src/brand-brain/postgresRepository.js'],{cwd:cfg.repoPath,stdio:'ignore'});
 const runtime=cfg.runtime;need(runtime&&/^bizgenie-api-staging-/.test(runtime.revision)&&/^sha256:[a-f0-9]{64}$/.test(runtime.imageDigest)&&runtime.serviceAccount&&runtime.dbSecretVersion,'PINNED_RUNTIME_METADATA_REQUIRED');
 const r=JSON.parse(cloud(['run','revisions','describe',runtime.revision,'--project=bizgenie-backend','--region=europe-west1','--format=json']));
 need(r.metadata?.labels?.['serving.knative.dev/service']==='bizgenie-api-staging','STAGING_SERVICE_MISMATCH');
 need(r.status?.conditions?.some(c=>c.type==='Ready'&&String(c.status)==='True')&&r.status?.imageDigest?.endsWith(runtime.imageDigest),'RUNTIME_REVISION_OR_IMAGE_MISMATCH');
 need(r.spec?.serviceAccountName===runtime.serviceAccount,'RUNTIME_IDENTITY_MISMATCH');
 const vars=r.spec?.containers?.[0]?.env||[],value=k=>vars.find(v=>v.name===k)?.value;
 need(value('BILLING_DURABLE_ENABLED')==='true'&&value('SUPABASE_URL')===`https://${PROJECT}.supabase.co`,'RUNTIME_BILLING_CONFIGURATION_NOT_VERIFIED');
 const policyIds=(value('BILLING_APPROVED_POLICY_IDS')||'').split(',').map(s=>s.trim()),classes=(value('BILLING_APPROVED_EXECUTION_CLASSES')||'').split(',').map(s=>s.trim()).filter(Boolean);
 need(policyIds.includes(POLICY)&&classes.length>0,'STAGING_POLICY_NOT_APPROVED_BY_RUNTIME');
 const secret=vars.find(v=>v.name==='BRAND_BRAIN_DATABASE_URL')?.valueFrom?.secretKeyRef;
 need(secret?.name==='bizgenie-staging-database-url'&&String(secret.key)===runtime.dbSecretVersion,'STAGING_DATABASE_REFERENCE_MISMATCH');
 need(typeof cfg.approvedOperatorDbRole==='string'&&cfg.approvedOperatorDbRole,'OPERATOR_DATABASE_ROLE_REQUIRED');
 need(!Object.keys(process.env).some(k=>k.startsWith('PG')),'AMBIGUOUS_PG_ENVIRONMENT');
 const raw=process.env.BRAND_BRAIN_DATABASE_URL;need(raw,'EXISTING_PRIVATE_DATABASE_CONFIGURATION_REQUIRED');const u=new URL(raw);
 need(['postgres:','postgresql:'].includes(u.protocol)&&u.pathname==='/postgres'&&!raw.includes('uvgblmejpbswkvlqvqmz'),'STAGING_DATABASE_ONLY');
 const username=decodeURIComponent(u.username);need((u.hostname===`db.${PROJECT}.supabase.co`&&username==='postgres')||(u.hostname.endsWith('.pooler.supabase.com')&&username===`postgres.${PROJECT}`),'STAGING_DATABASE_ONLY');
 for(const k of ['host','hostaddr','user','password','dbname','port','options','service','passfile'])need(!u.searchParams.has(k),'AMBIGUOUS_DATABASE_URL');
 const req=createRequire(path.join(cfg.repoPath,'package.json'));
 const {createPostgresBrandBrainRepositoryFromEnv}=req('./src/brand-brain/postgresRepository');
 const {PostgresBillingRepository}=req('./src/billing/postgresRepository'),{BillingService}=req('./src/billing/service'),{monthlyGrantIdempotencyKey}=req('./src/billing/paidBetaProvisioning');
 const pool=createPostgresBrandBrainRepositoryFromEnv({env:process.env}).pool;
 let poolFailed=false;pool.on('error',()=>{poolFailed=true;});
 const repo=new PostgresBillingRepository({pool}),service=new BillingService({repository:repo});
 const runtimeStamp={revision:runtime.revision,imageDigest:runtime.imageDigest,dbSecretVersion:runtime.dbSecretVersion,compatibility:'METADATA_AND_OPERATOR_CONNECTION_NOT_SERVING_POOL_PROOF'};
 const evidenceStamp=sha(JSON.stringify({bindingSha256:cfg.bindingSha256,operatorName:cfg.operatorName,operatorGoogleAccount:cfg.operatorGoogleAccount,bindingEvidenceRef:cfg.bindingEvidenceRef,runtimeEvidenceRef:cfg.runtimeEvidenceRef,runtimeStamp}));
 const q=(c,text,values=[])=>c.query({text,values,query_timeout:5000});
 async function tx(readOnly,work){need(!poolFailed,'OPERATOR_POOL_FAILED');const c=await pool.connect();let broken=false;try{await q(c,readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await q(c,"SET LOCAL statement_timeout='4s'");await q(c,"SET LOCAL lock_timeout='2s'");const result=await work(c);await q(c,readOnly?'ROLLBACK':'COMMIT');return result;}catch(e){try{await q(c,'ROLLBACK');}catch{broken=true;}throw e;}finally{c.release(broken);}}
 async function checks(c,lock=false){
  const who=(await q(c,'select current_user=$1 as approved, current_database()=$2 as db_ok',[cfg.approvedOperatorDbRole,'postgres'])).rows[0];need(who?.approved&&who.db_ok,'OPERATOR_CONNECTION_NOT_APPROVED');
  // Existing production initializer runs catalog SELECTs through this same transaction/client.
  const readRepo=new PostgresBillingRepository({pool:{query:(...args)=>c.query(...args),connect:()=>{throw Error('Unexpected nested connection');}}});
  await readRepo.initialize({approvedPolicyIds:policyIds,requiredExecutionClasses:classes});
  const policy=(await q(c,"select *, current_timestamp as observed_at from public.commercial_policies where policy_id=$1 and status='active' and effective_from<=current_timestamp and (effective_to is null or current_timestamp<effective_to)"+(lock?' for share':''),[POLICY])).rows[0];
  need(policy&&n(policy.included_monthly_credits)===100,'POLICY_AMOUNT_OR_EFFECTIVE_WINDOW_MISMATCH');
  need(iso(policy.observed_at)<END,'FUNDING_WINDOW_EXPIRED');return policy;
 }
 async function accountState(c){const rows=(await q(c,'select account_id,status from public.credit_accounts where tenant_id=$1',[scope.tenantId])).rows;need(rows.length<=1,'ACCOUNT_AMBIGUOUS');
  if(!rows.length)return {accountId:null,ledger:0,reserved:0,available:0,entries:0};need(rows[0].status==='active','ACCOUNT_NOT_ACTIVE');
  const s=(await q(c,'select coalesce(sum(balance_delta),0) as ledger,coalesce(sum(reserved_delta),0) as reserved,count(*) as entries from public.credit_ledger where tenant_id=$1 and account_id=$2',[scope.tenantId,rows[0].account_id])).rows[0];
  return {accountId:rows[0].account_id,ledger:n(s.ledger),reserved:n(s.reserved),available:n(s.ledger)-n(s.reserved),entries:n(s.entries)};
 }
 const serving="select * from public.tenant_entitlements where tenant_id=$1 and status in ('active','grace','cancel_pending')";
 function exact(e,plan){need(e&&e.entitlement_id===plan.entitlementId&&e.tenant_id===scope.tenantId&&e.policy_id===POLICY&&e.plan_code===plan.planCode&&e.status==='active'&&n(e.included_monthly_credit_grant)===100&&iso(e.ends_at)===END&&iso(e.reference_period_end)===END&&iso(e.starts_at)===iso(e.reference_period_start)&&!e.stripe_subscription_ref&&!e.cancellation_effective_at&&!e.grace_ends_at,'ENTITLEMENT_CONFLICT');}
 async function grantRows(c,plan){return (await q(c,"select * from public.credit_ledger where tenant_id=$1 and (entitlement_id=$2 or idempotency_key=$3)",[scope.tenantId,plan.entitlementId,plan.grantKey])).rows;}
 function exactGrant(g,plan,e){need(g&&g.entry_type==='monthly_grant'&&g.tenant_id===scope.tenantId&&g.account_id===plan.accountId&&g.entitlement_id===plan.entitlementId&&n(g.amount)===100&&n(g.balance_delta)===100&&n(g.reserved_delta)===0&&g.idempotency_key===plan.grantKey&&iso(g.reference_period_start)===iso(e.reference_period_start)&&iso(g.reference_period_end)===END&&!g.stripe_event_ref&&!g.payment_ref,'GRANT_CONFLICT');}
 try{
  await tx(true,async c=>{const who=(await q(c,'select current_user=$1 as approved, current_database()=$2 as db_ok',[cfg.approvedOperatorDbRole,'postgres'])).rows[0];need(who?.approved&&who.db_ok,'OPERATOR_CONNECTION_NOT_APPROVED');});
  if(mode==='prepare'){
   need(!fs.existsSync(cfg.planFile),'PLAN_ALREADY_EXISTS_DO_NOT_OVERWRITE');
   const plan=await tx(true,async c=>{const policy=await checks(c);need((await q(c,serving,[scope.tenantId])).rowCount===0,'SERVING_ENTITLEMENT_ALREADY_EXISTS');const state=await accountState(c);need(state.reserved===0&&state.ledger>=0,'RESERVATIONS_OR_INVALID_BALANCE');
    const token=sha(scope.tenantId).slice(0,24);return {version:'founder-staging-funding.v1',source:SOURCE,evidenceStamp,operatorName:cfg.operatorName,operatorGoogleAccount:cfg.operatorGoogleAccount,bindingSha256:cfg.bindingSha256,tenantId:scope.tenantId,entitlementId:'founder_20261130_'+token,accountId:state.accountId||'founder_account_'+token,planCode:policy.plan_code,policyId:POLICY,amount:100,endsAt:END,baseline:state,runtime:runtimeStamp};});
   save(cfg.planFile,plan);console.log(JSON.stringify({status:'PREPARED_NOT_AUTHORIZED',planSha256:sha(fs.readFileSync(cfg.planFile)),operatorBinding:'MATCH',runtimeCompatibility:'METADATA_AND_OPERATOR_SCHEMA_PASS',baselineLedger:plan.baseline.ledger,baselineReserved:plan.baseline.reserved}));return;
  }
  const plan=privateJson(cfg.planFile);
  need(sha(fs.readFileSync(cfg.planFile))===cfg.approvedPlanSha256,'EXACT_PLAN_APPROVAL_REQUIRED');
  need(plan.source===SOURCE&&plan.evidenceStamp===evidenceStamp&&plan.bindingSha256===cfg.bindingSha256&&plan.tenantId===scope.tenantId&&plan.amount===100&&plan.policyId===POLICY&&plan.endsAt===END,'APPROVED_PLAN_MISMATCH');
  need(ref(cfg.executionApprovalRef),'FINAL_FUNDING_APPROVAL_REQUIRED');
  if(mode==='execute'){
   need(!fs.existsSync(cfg.resultFile),'RESULT_EXISTS_USE_VERIFY_OR_RESUME_REVIEW');
   const e=await tx(false,async c=>{
    need((await q(c,'select tenant_id from public.tenants where tenant_id=$1 for update',[scope.tenantId])).rowCount===1,'TENANT_MISSING');const policy=await checks(c);need(policy.plan_code===plan.planCode,'POLICY_PLAN_DRIFT');
    let a=(await q(c,'select account_id,status from public.credit_accounts where tenant_id=$1 for update',[scope.tenantId])).rows[0];
    if(!a){need(plan.baseline.accountId===null,'APPROVED_ACCOUNT_MISSING');await q(c,'insert into public.credit_accounts(account_id,tenant_id) values($1,$2)',[plan.accountId,scope.tenantId]);a={account_id:plan.accountId,status:'active'};}
    need(a.account_id===plan.accountId&&a.status==='active','ACCOUNT_CONFLICT');
    const rows=(await q(c,'select * from public.tenant_entitlements where entitlement_id=$1 or (tenant_id=$2 and status in (\'active\',\'grace\',\'cancel_pending\')) for update',[plan.entitlementId,scope.tenantId])).rows;
    if(rows.length){need(rows.length===1,'ENTITLEMENT_CONFLICT');exact(rows[0],plan);return rows[0];}
    const current=await accountState(c);need(current.ledger===plan.baseline.ledger&&current.reserved===0&&current.entries===plan.baseline.entries,'BASELINE_CHANGED');
    const start=(await q(c,"select date_trunc('milliseconds',clock_timestamp()) as start")).rows[0].start;need(iso(start)<END,'FUNDING_WINDOW_EXPIRED');
    return (await q(c,"insert into public.tenant_entitlements(entitlement_id,tenant_id,policy_id,plan_code,status,starts_at,ends_at,reference_period_start,reference_period_end,included_monthly_credit_grant) values($1,$2,$3,$4,'active',$5,$6,$5,$6,100) returning *",[plan.entitlementId,scope.tenantId,POLICY,plan.planCode,start,END])).rows[0];
   });
   // Separate transaction: exact existing service and canonical key; never nest account locks.
   plan.grantKey=monthlyGrantIdempotencyKey(plan.entitlementId,iso(e.reference_period_start));
   // Hold only policy/entitlement shared locks while the existing service takes its own account lock.
   // Do not hold an account lock here: that would deadlock the service's separate transaction.
   await tx(false,async c=>{await checks(c,true);exact(e,plan);const others=(await q(c,serving+' for share',[scope.tenantId])).rows;need(others.length===1,'ENTITLEMENT_CONFLICT');exact(others[0],plan);need(iso(others[0].starts_at)===iso(e.starts_at),'PERIOD_DRIFT');const gs=await grantRows(c,plan);if(gs.length){need(gs.length===1,'GRANT_CONFLICT');exactGrant(gs[0],plan,e);}else{const s=await accountState(c);need(s.ledger===plan.baseline.ledger&&s.reserved===0&&s.entries===plan.baseline.entries,'BASELINE_CHANGED');}
    need(!poolFailed,'OPERATOR_POOL_FAILED');await service.grantMonthlyCredits({tenantId:scope.tenantId,idempotencyKey:plan.grantKey});
   });
  }
  if(mode==='compensate'){
   need(ref(cfg.rollbackApprovalRef),'SEPARATE_COMPENSATION_APPROVAL_REQUIRED');
   need(typeof cfg.rollbackAuditId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(cfg.rollbackAuditId),'ROLLBACK_AUDIT_REQUIRED');
   const e=await tx(false,async c=>{
    await q(c,'select tenant_id from public.tenants where tenant_id=$1 for update',[scope.tenantId]);const a=(await q(c,'select account_id from public.credit_accounts where tenant_id=$1 for update',[scope.tenantId])).rows[0];need(a?.account_id===plan.accountId,'ACCOUNT_CONFLICT');
    const e=(await q(c,'select * from public.tenant_entitlements where entitlement_id=$1 and tenant_id=$2 for update',[plan.entitlementId,scope.tenantId])).rows[0];need(e&&['active','inactive'].includes(e.status),'ENTITLEMENT_CONFLICT');exact({...e,status:'active'},plan);plan.grantKey=monthlyGrantIdempotencyKey(plan.entitlementId,iso(e.reference_period_start));
    const s=await accountState(c),g=await grantRows(c,plan),rollbackKey='rollback:'+plan.grantKey;
    if(!g.length){need(s.entries===plan.baseline.entries&&s.ledger===plan.baseline.ledger&&s.reserved===0,'BASELINE_CHANGED');}
    else{need(g.length===1,'GRANT_CONFLICT');exactGrant(g[0],plan,e);const prior=(await q(c,'select * from public.credit_ledger where idempotency_key=$1',[rollbackKey])).rows;
     if(prior.length){need(prior.length===1&&prior[0].tenant_id===scope.tenantId&&prior[0].account_id===plan.accountId&&prior[0].entry_type==='admin_adjustment'&&n(prior[0].amount)===100&&n(prior[0].balance_delta)===-100&&n(prior[0].reserved_delta)===0&&prior[0].transaction_correlation_id===cfg.rollbackAuditId,'ROLLBACK_CONFLICT');need(s.entries===plan.baseline.entries+2&&s.ledger===plan.baseline.ledger&&s.reserved===0,'ACCOUNT_CHANGED_AFTER_ROLLBACK');}
     else need(s.entries===plan.baseline.entries+1&&s.ledger===plan.baseline.ledger+100&&s.reserved===0,'CONSUMPTION_OR_RESERVATION_REQUIRES_FINANCE_REVIEW');}
    await q(c,"update public.tenant_entitlements set status='inactive',updated_at=current_timestamp where entitlement_id=$1 and tenant_id=$2",[plan.entitlementId,scope.tenantId]);return {e,hasGrant:g.length===1};
   });
   if(e.hasGrant){need(typeof cfg.rollbackAuditId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(cfg.rollbackAuditId),'ROLLBACK_AUDIT_REQUIRED');await service.adjustCredits({tenantId:scope.tenantId,amount:100,direction:'debit',transactionCorrelationId:cfg.rollbackAuditId,idempotencyKey:'rollback:'+plan.grantKey});}
   const s=await tx(true,accountState);need(s.ledger===plan.baseline.ledger&&s.reserved===0,'ROLLBACK_VERIFICATION_FAILED');console.log(JSON.stringify({status:'COMPENSATED_OR_UNFUNDED_ENTITLEMENT_DISABLED',ledgerPreserved:true}));return;
  }
  const result=await tx(true,async c=>{await checks(c);const es=(await q(c,serving,[scope.tenantId])).rows;need(es.length===1,'ENTITLEMENT_CONFLICT');const e=es[0];exact(e,plan);plan.grantKey=monthlyGrantIdempotencyKey(plan.entitlementId,iso(e.reference_period_start));const gs=await grantRows(c,plan);need(gs.length===1,'GRANT_NOT_VERIFIED');exactGrant(gs[0],plan,e);const s=await accountState(c);need(s.ledger===plan.baseline.ledger+100&&s.reserved===0&&s.available===plan.baseline.available+100&&s.entries===plan.baseline.entries+1,'POST_FUNDING_BALANCE_DRIFT');return {status:'FUNDED_VERIFIED',source:SOURCE,approvalRef:cfg.executionApprovalRef,grantKey:plan.grantKey,ledgerEntryId:gs[0].ledger_entry_id,startsAt:iso(e.starts_at),endsAt:END,amount:100,ledger:s.ledger,reserved:s.reserved};});
  if(!fs.existsSync(cfg.resultFile))save(cfg.resultFile,result);
  console.log(JSON.stringify({status:result.status,amount:100,endsAt:END,monthlyGrantCount:1,reservedBalance:result.reserved,recordedPrivately:true}));
 }finally{await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:e.safeCode||'OPERATOR_OPERATION_FAILED_OUTCOME_REQUIRES_READBACK',noAutomaticRetry:true}));process.exitCode=1;});
