// Explicit staging runtime composition. Reads policy/schema metadata only; never creates or seeds it.
const {apiVideoConfig,reference}=require('./founderVideoConfig');
const {createFounderVideoAcceptance}=require('./founderVideoComposition');
const {approvedEstimate}=require('./estimateAuthority');
const {SUBMIT,RECONCILE,MAX_STATUS_OBSERVATIONS}=require('./founderVideo');
const {SpendError}=require('./index');
function createFounderSpendPool({env,Pool=require('pg').Pool}={}){
 if(!apiVideoConfig(env))return null;
 try{
  const a=new URL(env.BRAND_BRAIN_DATABASE_URL),s=new URL(env.PROVIDER_SPEND_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(a.protocol)||!['postgres:','postgresql:'].includes(s.protocol)||!s.hostname||a.hostname!==s.hostname||a.port!==s.port||a.pathname!==s.pathname||/uvgblmejpbswkvlqvqmz/i.test(a.href+s.href))throw Error();
  return new Pool({connectionString:env.PROVIDER_SPEND_DATABASE_URL,options:'-c role=bizgenie_provider_spend_runtime',max:2});
 }catch{throw new SpendError('FOUNDER_VIDEO_SPEND_POOL_REQUIRED');}
}
function prices(policy,config){
 for(const [op,unit,version]of [[SUBMIT,'second',config.submitVersion],[RECONCILE,'request',config.statusVersion]]){
  const e=policy.estimates[op];
  if(!e||e.version!==version||!reference(e.source_ref)||!approvedEstimate(e,policy.db_now)||!(Date.parse(e.valid_until)>policy.db_now.getTime())||e.authority?.pricing_unit!==unit||!reference(e.authority.pricing_source_ref)||!reference(e.authority.pricing_version)||!(Date.parse(e.authority.pricing_valid_until)>policy.db_now.getTime()))throw new SpendError('FOUNDER_VIDEO_PRICE_UNVERIFIED');
 }
 if(policy.estimates[SUBMIT].upper_bound_minor+MAX_STATUS_OBSERVATIONS*policy.estimates[RECONCILE].upper_bound_minor>500)throw new SpendError('FOUNDER_VIDEO_CAP_EXHAUSTED');
}
async function createFounderVideoRuntime({config,applicationPool,spendPool}={}){
 if(!config)return null;
 if(!applicationPool||!spendPool)throw new SpendError('FOUNDER_VIDEO_SPEND_POOL_REQUIRED');
 try{
 // Same binding and pinned policy feed quote service, bridge review and worker transport scope.
 const acceptance=createFounderVideoAcceptance({environment:'staging',founder:config.founder,pool:spendPool,enabled:true,policyVersion:config.policyVersion,minStatusIntervalMs:config.minStatusIntervalMs});
 const database=(await applicationPool.query('select current_database() as database_name')).rows[0]?.database_name;
 // Use the actual monthly ledger's schema/privilege checks and aggregate lock; no writes.
 const {FounderVideoSpend}=require('./founderVideo');
 const spend=new FounderVideoSpend({founder:config.founder,pool:spendPool,enabled:true,policyVersion:config.policyVersion,minStatusIntervalMs:config.minStatusIntervalMs});
 await spend.transaction(async client=>{
  const role=(await client.query("select current_database() as database_name,current_user as role,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,exists(select 1 from pg_auth_members m where m.member=r.oid) as has_memberships from pg_roles r where r.rolname=current_user")).rows[0];
  if(!database||role?.database_name!==database||role.role!=='bizgenie_provider_spend_runtime'||role.rolsuper!==false||role.rolbypassrls!==false||role.rolcreaterole!==false||role.rolcreatedb!==false||role.has_memberships!==false)throw new SpendError('FOUNDER_VIDEO_RUNTIME_ROLE_UNSAFE');
  const p=await spend.policy(client);prices(p,config);
  const customers=(await client.query('select tenant_id from public.provider_spend_customers where active=true')).rows;
  if(customers.length>10||!customers.some(r=>r.tenant_id===config.founder.tenant_id))throw new SpendError('PROVIDER_SPEND_CUSTOMER_HOLD');
 });
 return Object.freeze({
  ...acceptance,
  operationsForRow:async()=>({[SUBMIT]:{estimateVersion:config.submitVersion},[RECONCILE]:{estimateVersion:config.statusVersion}}),
 });
 }catch(error){if(error instanceof SpendError)throw error;throw new SpendError('FOUNDER_VIDEO_RUNTIME_UNAVAILABLE');}
}
module.exports={createFounderSpendPool,createFounderVideoRuntime,prices};
