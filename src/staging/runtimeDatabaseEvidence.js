'use strict';
const PATH = '/internal/staging/founder-database-evidence';
const { AuthenticationRequiredError } = require('../authorization');
const { extractBearerToken } = require('../authentication/customerGenerationBoundary');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CONFIG_ERROR = 'RUNTIME_DATABASE_EVIDENCE_CONFIGURATION_INVALID';
const TABLES = Object.freeze(['campaigns','campaign_content_items','campaign_platform_variants','campaign_revisions','campaign_approval_events','campaign_schedule_entries','campaign_preview_evidence','campaign_preview_render_receipts','campaign_command_receipts','campaign_preview_profiles']);
const SQL = Object.freeze({
 authority: `SELECT EXISTS (SELECT 1 FROM public.customer_profiles cp JOIN public.tenant_memberships tm ON tm.auth_user_id=cp.auth_user_id JOIN public.projects p ON p.tenant_id=tm.tenant_id JOIN public.brand_brains b ON b.project_id=p.project_id WHERE cp.auth_user_id=$1 AND tm.tenant_id=$2 AND tm.role='owner' AND p.project_id=$3 AND b.brand_id=$4) AS authorized`,
 ownership: `SELECT CASE WHEN count(*)=0 THEN 'NOT VERIFIED' WHEN count(*)=1 AND bool_and(tenant_id::text=$2::text AND project_id::text=$3::text AND brand_id::text=$4::text) THEN 'MATCH' ELSE 'MISMATCH' END AS ownership FROM public.campaigns WHERE campaign_id::text=$1::text`,
 role: `SELECT current_user::text AS effective_role, r.rolsuper, r.rolbypassrls, current_user=session_user AS no_role_switch FROM pg_roles r WHERE r.rolname=current_user`,
 tables: `WITH required AS (SELECT unnest($1::text[]) AS name) SELECT q.name, c.oid IS NOT NULL AS present, c.relkind IN ('r','p') AS real_table, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, CASE WHEN c.oid IS NOT NULL THEN pg_has_role(current_user,c.relowner,'USAGE') END AS owner_privileges, has_schema_privilege(current_user,'public','USAGE') AS schema_usage, CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(current_user,c.oid,'SELECT') END AS can_select, CASE WHEN c.oid IS NOT NULL AND q.name<>'campaign_preview_profiles' THEN has_table_privilege(current_user,c.oid,'INSERT') END AS can_insert, CASE WHEN c.oid IS NOT NULL AND q.name<>'campaign_preview_profiles' THEN has_table_privilege(current_user,c.oid,'UPDATE') END AS can_update, CASE WHEN c.relkind IN ('r','p') THEN row_security_active(c.oid) END AS rls_effective FROM required q LEFT JOIN pg_namespace n ON n.nspname='public' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=q.name ORDER BY q.name`,
 preview: `SELECT EXISTS (SELECT 1 FROM public.campaign_preview_profiles WHERE platform=$1 AND placement=$2 AND format=$3 AND status='active') AS active`
});
function config(env, now) {
 const flag=env.BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED;
 if(flag===undefined||flag==='false') return null;
 try {
  if(flag!=='true'||env.BIZGENIE_ENVIRONMENT!=='staging'||env.SUPABASE_URL!=='https://zrczojyxebwjgpymbmgu.supabase.co') throw Error();
  const b=JSON.parse(env.BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING);
  const keys=['founderId','tenantId','projectId','brandId','campaignId','approvedRole','privateIamEvidenceRef','approvalRef','bindingEvidenceRef','expiresAt','preview'];
  if(!b||Array.isArray(b)||Object.keys(b).length!==keys.length||keys.some(k=>!Object.hasOwn(b,k)))throw Error();
  if(typeof b.founderId!=='string'||typeof b.campaignId!=='string'||!UUID.test(b.founderId)||!UUID.test(b.campaignId))throw Error();
  for(const k of ['tenantId','projectId','brandId','approvedRole'])if(typeof b[k]!=='string'||!b[k]||b[k].length>128||b[k].trim()!==b[k]||/[\s\x00-\x1f]/.test(b[k]))throw Error();
  for(const k of ['approvalRef','bindingEvidenceRef','privateIamEvidenceRef'])if(typeof b[k]!=='string'||!/^https:\/\/github\.com\/shirrie01\/bizgenie-api\/(issues|pull)\/\d+#issuecomment-\d+$/.test(b[k]))throw Error();
  const end=Date.parse(b.expiresAt); if(typeof b.expiresAt!=='string'||!Number.isFinite(end)||end<=now()||end>now()+30*60*1000)throw Error();
  if(b.preview!==null && (!b.preview||Array.isArray(b.preview)||Object.keys(b.preview).sort().join(',')!=='format,placement,platform'||Object.values(b.preview).some(v=>typeof v!=='string'||! /^[a-z][a-z0-9_-]{0,39}$/.test(v))))throw Error();
  return structuredClone(b);
 } catch { throw Error(CONFIG_ERROR); }
}
function bounded(promise, ms, late) {
 let timer, expired=false;
 const work=Promise.resolve(promise).then(v=>{if(expired)late?.(v);return v;});
 return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('UNAVAILABLE'));},ms);})]).finally(()=>clearTimeout(timer));
}
function registerRuntimeDatabaseEvidence(app,{env={},pool,tokenVerifier,now=Date.now}={}) {
 const b=config(env,now); if(!b)return false;
 let busy=false, attempts=0;
 app.use(PATH,async(req,res)=>{
  res.set('Cache-Control','private, no-store'); res.vary('Authorization'); res.vary('Origin');
  const deny=(status,code)=>res.status(status).json({error:{code}});
  if(req.get('Origin'))return deny(403,'DIAGNOSTIC_BROWSER_ACCESS_DENIED');
  if(req.method!=='GET'||req.originalUrl!==PATH||req.headers['transfer-encoding']||req.headers['content-length']&&req.headers['content-length']!=='0'||req.body&&Object.keys(req.body).length)return deny(400,'DIAGNOSTIC_INPUT_REJECTED');
  if(now()>=Date.parse(b.expiresAt))return deny(403,'DIAGNOSTIC_AUTHORIZATION_EXPIRED');
  // Cloud Run enforces IAM before the container and strips the IAM token signature.
  // Its enforcement and effective invoker policy MUST be independently verified before release.
  // privateIamEvidenceRef records that external evidence, not a dynamic attestation.
  // Never infer IAM/privacy from request headers, K_SERVICE or this staging flag.
  if(typeof tokenVerifier?.verifyAccessToken!=='function'||typeof pool?.connect!=='function')return deny(503,'DIAGNOSTIC_UNAVAILABLE');
  if(busy||attempts>=3)return deny(429,'DIAGNOSTIC_LIMIT_REACHED');
  busy=true; let client, reply;
  const errorReply=(status,code)=>({status,body:{error:{code}}});
  try {
   reply=await(async()=>{
   const actor=await bounded(tokenVerifier.verifyAccessToken(extractBearerToken(req.get('Authorization'))),1500);
   if(actor?.kind!=='customer'||actor.auth_user_id!==b.founderId||!actor.trusted_scope||actor.trusted_scope.tenant_id!==b.tenantId||actor.trusted_scope.project_id!==b.projectId||actor.trusted_scope.brand_id!==b.brandId)return errorReply(403,'DIAGNOSTIC_ACCESS_DENIED');
   if(now()>=Date.parse(b.expiresAt))return errorReply(403,'DIAGNOSTIC_AUTHORIZATION_EXPIRED');
   attempts++;
   client=await bounded(pool.connect(),1500,c=>c.release(true));
   const query=(text,values=[])=>client.query({text,values,query_timeout:1500});
   await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await query("SET LOCAL statement_timeout = '1000ms'");
   await query("SET LOCAL lock_timeout = '500ms'");
   await query("SET LOCAL idle_in_transaction_session_timeout = '2000ms'");
   const authority=await query(SQL.authority,[b.founderId,b.tenantId,b.projectId,b.brandId]);
   if(authority.rows[0]?.authorized!==true)return errorReply(403,'DIAGNOSTIC_ACCESS_DENIED');
   const d2=(await query(SQL.ownership,[b.campaignId,b.tenantId,b.projectId,b.brandId])).rows[0]?.ownership;
   const role=(await query(SQL.role)).rows[0];
   const tables=(await query(SQL.tables,[TABLES])).rows;
   if(!role||tables.length!==TABLES.length||tables.some(r=>!TABLES.includes(r.name))||new Set(tables.map(r=>r.name)).size!==TABLES.length)throw Error();
   let preview='NOT VERIFIED';
   if(b.preview&&tables.find(t=>t.name==='campaign_preview_profiles')?.present===true)preview=(await query(SQL.preview,[b.preview.platform,b.preview.placement,b.preview.format])).rows[0]?.active===true?'MATCH':'NOT VERIFIED';
   const bool=v=>typeof v==='boolean'?v:null;
   const output={poolOrigin:'injected_application_pool',provenanceBasis:'source_wiring_not_dynamic_attestation',ownership:['MATCH','MISMATCH','NOT VERIFIED'].includes(d2)?d2:'NOT VERIFIED',role:{classification:role.effective_role===b.approvedRole?'APPROVED_ROLE':'UNAPPROVED_ROLE',superuser:bool(role.rolsuper),bypassRls:bool(role.rolbypassrls),noRoleSwitch:bool(role.no_role_switch)},tables:tables.map(r=>Object.fromEntries(['name','present','real_table','rls_enabled','rls_forced','owner_privileges','schema_usage','can_select','can_insert','can_update','rls_effective'].map(k=>[k,k==='name'?r[k]:bool(r[k])]))),intendedPreview:preview,catalogOnly:true};
   if(now()>=Date.parse(b.expiresAt))throw Error();
   return {status:200,body:output};
   })();
  } catch(error) {
   reply=error instanceof AuthenticationRequiredError ? errorReply(401,'DIAGNOSTIC_AUTHENTICATION_REQUIRED') : errorReply(503,'DIAGNOSTIC_UNAVAILABLE');
  } finally {
   if(client){
    let destroy=false;
    try{await client.query({text:'ROLLBACK',query_timeout:1500});}
    catch{destroy=true;reply=errorReply(503,'DIAGNOSTIC_UNAVAILABLE');}
    try{client.release(destroy);}
    catch{
     reply=errorReply(503,'DIAGNOSTIC_UNAVAILABLE');
     // A failed release must not leave the connection available for reuse.
     try{await bounded(client.end(),1500);}catch{}
    }
   }
   busy=false;
  }
  return res.status(reply.status).json(reply.body);
 });
 return true;
}
module.exports={PATH,SQL,TABLES,registerRuntimeDatabaseEvidence};
