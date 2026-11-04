'use strict';
// Finite GET/OPTIONS read-only operator runner. Never obtains/mints credentials, starts providers or mutates cloud/DB state.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const crypto=require('node:crypto');
const TARGET='bizgenie-api-staging-00030-pob',OLD='bizgenie-api-staging-00029-wtc';
const SUPABASE='zrczojyxebwjgpymbmgu',PROJECT='bizgenie-backend';
class Stop extends Error{constructor(code,notRun=false){super(code);this.code=code;this.notRun=notRun;}}
const ensure=(ok,code)=>{if(!ok)throw new Stop(code);};
function validateConfig(c){
 ensure(c&&c.project===PROJECT&&c.service==='bizgenie-api-staging'&&/^bizgenie-api-staging-[0-9]{5}-[a-z0-9]{3}$/.test(c.revision||''),'WRONG_TARGET');
 if(c.revision!==TARGET)ensure(typeof c.targetApprovalRef==='string'&&c.targetApprovalRef.length>0,'NEW_REVISION_APPROVAL_REQUIRED');
 ensure(typeof c.region==='string'&&/^[a-z]+-[a-z]+[0-9]$/.test(c.region),'REGION_REQUIRED');
 ensure(/^(global|[a-z]+-[a-z]+[0-9])$/.test(c.buildRegion||''),'BUILD_REGION_REQUIRED');
 ensure(/^[a-f0-9]{40}$/.test(c.expectedSha||'')&&/^[a-f0-9-]{10,80}$/.test(c.buildId||''),'SOURCE_PROVENANCE_REQUIRED');
 ensure(c.supabaseProject===SUPABASE,'PRODUCTION_OR_UNKNOWN_AUTH_PROJECT');
 for(const key of ['databaseSecretRef','authSecretRef'])ensure(c[key]&&typeof c[key].name==='string'&&c[key].name.length>0&&/^[1-9][0-9]*$/.test(c[key].version||'')&&typeof c[key].approvalRef==='string'&&c[key].approvalRef.length>0,'APPROVED_STAGING_SECRET_REFERENCES_REQUIRED');
 ensure(c.fixture&&c.fixture.approved===true&&typeof c.fixture.approvalRef==='string'&&c.fixture.approvalRef.length>0,'APPROVED_EXISTING_FIXTURES_REQUIRED');
 ensure(['tenant_id','project_id','brand_id'].every(k=>/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(c.fixture[k]||'')),'INVALID_SCOPE');
 ensure(['campaign_id','variant_id','revision_id','asset_id'].every(k=>/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(c.fixture[k]||'')),'INVALID_OBJECT_FIXTURE');
 ensure(Number.isSafeInteger(c.fixture.expected_campaign_version)&&c.fixture.expected_campaign_version>=0,'INVALID_CAMPAIGN_VERSION');
 ensure(Number.isSafeInteger(c.fixture.expectedCredits)&&c.fixture.expectedCredits>=0,'EXPECTED_CREDITS_REQUIRED');
 ensure(/^[a-f0-9]{64}$/.test(c.fixture.mediaSha256||'')&&['image/jpeg','image/png','image/webp'].includes(c.fixture.mediaMime),'EXISTING_IMAGE_DIGEST_REQUIRED');
 ensure(['ownerTokenEnv','foreignTokenEnv','cloudRunTokenEnv'].every(k=>/^[A-Z][A-Z0-9_]{2,80}$/.test(c[k]||'')),'EXISTING_TOKEN_ENV_NAMES_REQUIRED');
 ensure(new Set([c.ownerTokenEnv,c.foreignTokenEnv,c.cloudRunTokenEnv]).size===3,'DISTINCT_CREDENTIALS_REQUIRED');
 return c;
}
function digestOf(value){const m=String(value||'').match(/(?:@|^)(sha256:[a-f0-9]{64})$/);return m?.[1];}
function verifyMetadata(c,m){
 const {service:s,revision:r,build:b,project:p}=m;
 ensure(p?.projectId===c.project&&String(s?.metadata?.namespace)===String(p.projectNumber),'PROJECT_MISMATCH');
 ensure(s?.metadata?.name===c.service&&r?.metadata?.name===c.revision&&String(r.metadata.namespace)===String(p.projectNumber),'REVISION_MISMATCH');
 ensure(r.status?.conditions?.some(x=>x.type==='Ready'&&x.status==='True'),'REVISION_NOT_READY');
 const traffic=s.status?.traffic||[],tags=traffic.filter(x=>x.revisionName===c.revision&&x.tag&&x.url);
 ensure(tags.length===1,'EXACTLY_ONE_EXISTING_TARGET_TAG_REQUIRED');
 ensure(traffic.every(x=>x.revisionName===OLD||Number(x.percent||0)===0)&&traffic.filter(x=>x.revisionName===OLD).reduce((n,x)=>n+Number(x.percent||0),0)===100,'UNEXPECTED_TRAFFIC_SPLIT');
 ensure(traffic.filter(x=>x.revisionName===c.revision).every(x=>Number(x.percent||0)===0),'TARGET_HAS_TRAFFIC');
 const u=new URL(tags[0].url),base=new URL(s.status.url);
 ensure(u.protocol==='https:'&&u.hostname.endsWith('.run.app')&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password&&!u.port&&u.origin!==base.origin&&!u.hostname.includes('bizgenie-apii'),'INVALID_ISOLATED_TAG_URL');
 ensure(base.protocol==='https:'&&base.hostname.endsWith('.run.app')&&!base.username&&!base.password,'INVALID_SERVICE_URL');
 const image=r.status?.imageDigest,commit=b.sourceProvenance?.resolvedRepoSource?.commitSha;if(!commit)throw new Stop('RESOLVED_BUILD_SOURCE_UNAVAILABLE',true);
 ensure(b.id===c.buildId&&b.status==='SUCCESS'&&commit===c.expectedSha,'BUILD_SOURCE_NOT_VERIFIED');
 const imageDigest=digestOf(image);ensure(imageDigest&&b.results?.images?.some(x=>x.digest===imageDigest),'DEPLOYED_IMAGE_DIGEST_MISMATCH');
 ensure(r.spec?.serviceAccountName==='bizgenie-staging-runtime@'+PROJECT+'.iam.gserviceaccount.com','STAGING_RUNTIME_IDENTITY_UNVERIFIED');
 // Inspect only public Supabase URL from captured revision metadata; never emit/store full env configuration.
 const env=r.spec.containers?.[0]?.env||[],url=env.find(x=>x.name==='SUPABASE_URL');
 if(!url?.value)throw new Stop('SUPABASE_URL_REFERENCE_REQUIRES_EXISTING_PROVENANCE',true);
 ensure(url.value==='https://'+SUPABASE+'.supabase.co','STAGING_SUPABASE_NOT_VERIFIED');
 ensure(!env.some(x=>typeof x.value==='string'&&x.value.includes('uvgblmejpbswkvlqvqmz')),'PRODUCTION_REFERENCE_FOUND');
 for(const [key,name] of [['databaseSecretRef','BRAND_BRAIN_DATABASE_URL'],['authSecretRef','SUPABASE_SERVICE_ROLE_KEY']]){const ref=env.find(x=>x.name===name)?.valueFrom?.secretKeyRef;ensure(ref?.name===c[key].name&&String(ref.key)===c[key].version,'STAGING_SECRET_REFERENCE_MISMATCH');}
 return {url:u.origin,audience:base.origin,runtime:r.spec.serviceAccountName,imageDigest,sourceSha:commit};
}
function tokenClaims(token,issuer){
 try{const parts=token.split('.');ensure(parts.length===3,'INVALID_EXISTING_SESSION');const p=JSON.parse(Buffer.from(parts[1],'base64url'));ensure(p.iss===issuer&&p.exp>Date.now()/1000&&typeof p.sub==='string','EXPIRED_OR_WRONG_SESSION');return p;}catch{throw new Stop('EXPIRED_OR_WRONG_SESSION');}
}
async function runAcceptance(config,deps){
 const report={contract_version:'bizgenie.staging-acceptance.v1',scope:deps.scope||'simulation',liveAcceptance:false,promotionAuthorized:false,target:config?.revision||TARGET,rows:[]};
 const row=(name,result,extra={})=>report.rows.push({name,result,...extra});
 try{
  const c=validateConfig(config);let m;try{m=await deps.metadata(c);}catch(e){if(e instanceof Stop)throw e;throw new Stop('AUTHORIZED_METADATA_UNAVAILABLE',true);}const target=verifyMetadata(c,m);row('target_metadata','PASS',{source_sha:target.sourceSha,image_digest:target.imageDigest,runtime:target.runtime});
  const tokens=await deps.credentials(c);if(!tokens?.owner||!tokens.foreign||!tokens.cloudRun)throw new Stop('EXISTING_AUTHORIZED_TOKENS_UNAVAILABLE',true);
  const issuer='https://'+SUPABASE+'.supabase.co/auth/v1',owner=tokenClaims(tokens.owner,issuer),foreign=tokenClaims(tokens.foreign,issuer);
  ensure(owner.sub!==foreign.sub,'DISTINCT_TENANT_IDENTITIES_REQUIRED');
  ensure(owner.app_metadata?.tenant_id===c.fixture.tenant_id&&owner.app_metadata?.project_id===c.fixture.project_id&&owner.app_metadata?.brand_id===c.fixture.brand_id,'OWNER_SCOPE_MISMATCH');
  ensure(foreign.app_metadata?.tenant_id&&foreign.app_metadata.tenant_id!==c.fixture.tenant_id,'FOREIGN_TENANT_FIXTURE_REQUIRED');
  const iam=tokenClaims(tokens.cloudRun,'https://accounts.google.com');ensure(iam.aud===target.audience||iam.aud===target.url,'CLOUD_RUN_AUDIENCE_MISMATCH');
  let requests=0;
  async function get(name,path,who,expected,validate){
   ensure(++requests<=16&&(path.startsWith('/customer/')||name==='root'&&path==='/'),'REQUEST_ALLOWLIST');
   ensure(!/generate|oauth|confirm|cancel|refresh|attach|poll|bootstrap|select/i.test(path),'STATEFUL_ROUTE_EXCLUDED');
   const r=await deps.get(target.url+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'X-Serverless-Authorization':'Bearer '+tokens.cloudRun,...(who?{Authorization:'Bearer '+tokens[who]}:{})}});
   ensure(r.status===expected,'HTTP_'+name+'_'+r.status);let data;
   if(expected===200&&name==='media'){const reader=r.body.getReader(),chunks=[];let n=0;try{for(;;){const part=await reader.read();if(part.done)break;n+=part.value.length;ensure(n<=32*1024*1024,'MEDIA_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}data=Buffer.concat(chunks);}
   else if(name!=='root'){const reader=r.body?.getReader();ensure(reader,'EMPTY_JSON');let n=0;const chunks=[];try{for(;;){const part=await reader.read();if(part.done)break;n+=part.value.length;ensure(n<=262144,'JSON_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Stop('INVALID_JSON_'+name);}}
   else await r.body?.cancel();
   if(path.startsWith('/customer/')){ensure(/private/.test(r.headers.get('cache-control')||'')&&/no-store/.test(r.headers.get('cache-control')||'')&&/authorization/i.test(r.headers.get('vary')||''),'PRIVATE_HEADERS_MISSING');}
   if(validate)validate(data,r);row(name,'PASS',{http_status:r.status});return data;
  }
  const f=c.fixture,scope=new URLSearchParams({tenant_id:f.tenant_id,project_id:f.project_id}),campaign='/customer/campaigns/'+f.campaign_id+'?'+scope;
  await get('root','/',null,200);
  const cors=await deps.get(target.url+'/customer/workspace',{method:'OPTIONS',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'X-Serverless-Authorization':'Bearer '+tokens.cloudRun,Origin:'https://staging-app.getbizgenie.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});
  ensure(cors.status===204&&cors.headers.get('access-control-allow-origin')==='https://staging-app.getbizgenie.com'&&/authorization/i.test(cors.headers.get('access-control-allow-headers')||''),'CORS_NOT_CONFIGURED');await cors.body?.cancel();row('cors','PASS',{http_status:204,scope:'Authorized operator preflight only; browser IAM bridge acceptance still required'});
  await get('unauthenticated','/customer/workspace',null,401,d=>ensure(d.error?.code==='AUTHENTICATION_REQUIRED','WRONG_AUTH_ERROR'));
  await get('identity','/customer/workspace','owner',200,d=>{const w=(d.workspaces||[d.workspace]).find(w=>w?.tenant_id===f.tenant_id&&w.project_id===f.project_id&&w.brand_id===f.brand_id);ensure(w?.membership_role==='owner','OWNER_WORKSPACE_NOT_FOUND');});
  await get('foreign_identity','/customer/workspace','foreign',200,d=>{const ws=d.workspaces||[d.workspace];ensure(ws.some(w=>w?.tenant_id===foreign.app_metadata.tenant_id)&&!ws.some(w=>w?.tenant_id===f.tenant_id),'FOREIGN_WORKSPACE_FIXTURE_INVALID');});
  await get('campaign',campaign,'owner',200,d=>ensure(d.campaign?.campaign_id===f.campaign_id&&d.campaign.version===f.expected_campaign_version,'CAMPAIGN_FIXTURE_CHANGED'));
  await get('foreign_campaign',campaign,'foreign',404,d=>ensure(d.error?.code==='RESOURCE_NOT_AVAILABLE','WRONG_FOREIGN_ERROR'));
  const meta='/customer/campaigns/'+f.campaign_id+'/variants/'+f.variant_id+'/creative-preview?'+scope+'&revision_id='+f.revision_id+'&expected_campaign_version='+f.expected_campaign_version;
  await get('preview_metadata',meta,'owner',200,d=>ensure(d.preview?.contract_version==='campaign-creative-preview.v1'&&d.preview.campaign_id===f.campaign_id&&d.preview.variant_id===f.variant_id&&d.preview.revision_id===f.revision_id&&d.preview.campaign_version===f.expected_campaign_version&&d.preview.media?.some(a=>a.asset_id===f.asset_id&&a.mime_type===f.mediaMime&&a.source_kind==='generated'),'PREVIEW_FIXTURE_MISMATCH'));
  if(c.fixture.mediaReadHasNoDatabaseWrites!==true){row('media','NOT RUN',{reason:'Deployment preview budget/audit side effects not verified absent'});row('foreign_media','NOT RUN',{reason:'Positive byte fixture not tested'});}
  else{
   const bytes='/customer/campaigns/'+f.campaign_id+'/variants/'+f.variant_id+'/revisions/'+f.revision_id+'/assets/'+f.asset_id+'/preview?'+scope+'&expected_campaign_version='+f.expected_campaign_version;
   await get('media',bytes,'owner',200,(data,r)=>ensure(r.headers.get('content-type')===f.mediaMime&&crypto.createHash('sha256').update(data).digest('hex')===f.mediaSha256,'MEDIA_BYTES_MISMATCH'));
   await get('foreign_media',bytes,'foreign',404,d=>ensure(d.error?.code==='RESOURCE_NOT_AVAILABLE','WRONG_MEDIA_DENIAL'));
  }
  await get('credits','/customer/billing/subscription?tenant_id='+encodeURIComponent(f.tenant_id),'owner',200,d=>ensure(d.status==='ready'&&d.subscription&&d.available_credits===f.expectedCredits,'ENTITLEMENT_OR_CREDIT_FIXTURE_CHANGED'));
  await get('foreign_credits','/customer/billing/subscription?tenant_id='+encodeURIComponent(f.tenant_id),'foreign',404,d=>ensure(d.error?.code==='RESOURCE_NOT_AVAILABLE','WRONG_CREDIT_DENIAL'));
  try{const logs=await deps.logs(c);row('error_logs',logs.count?'NOT RUN':'PASS',{required:logs.count>0,error_count:logs.count,reason:logs.count?'Untriaged revision errors; no raw logs exposed':'No revision ERROR entries in bounded recent query'});}catch{row('error_logs','NOT RUN',{required:false,reason:'Authorized logging metadata unavailable'});}
  report.liveAcceptance=report.scope==='live'&&!report.rows.some(x=>x.required!==false&&x.result!=='PASS');
 }catch(e){row('stopped',e.notRun?'NOT RUN':'FAIL',{reason:e instanceof Stop?e.code:'AUTHORIZED_ACCESS_OR_TRANSPORT_UNAVAILABLE'});}
 report.evidenceClass=report.scope==='live'?(report.rows.some(x=>x.http_status!==undefined)?'HOSTED REAL':'NOT RUN'):'MOCKED';report.releaseGate=report.liveAcceptance?'GO':'NO-GO';report.gateScope='Read-only source/fixture acceptance only; no traffic/deployment authority';
 report.result=report.rows.some(x=>x.result==='FAIL')?'FAIL':report.liveAcceptance?'PASS':'NOT RUN';return report;
}
function cloud(args){try{return JSON.parse(execFileSync('gcloud',args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']}));}catch{throw new Stop('EXISTING_GCLOUD_AUTH_OR_METADATA_UNAVAILABLE',true);}}
function liveDependencies(env){return {scope:'live',credentials:async c=>({owner:env[c.ownerTokenEnv],foreign:env[c.foreignTokenEnv],cloudRun:env[c.cloudRunTokenEnv]}),get:globalThis.fetch,metadata:async c=>{
 const flags=['--project='+c.project,'--region='+c.region,'--platform=managed'];
 return {project:cloud(['projects','describe',c.project,'--format=json(projectId,projectNumber)']),service:cloud(['run','services','describe',c.service,...flags,'--format=json(metadata.name,metadata.namespace,status.url,status.traffic)']),
 revision:cloud(['run','revisions','describe',c.revision,...flags,'--format=json(metadata.name,spec.serviceAccountName,spec.containers.image,spec.containers.env,status.imageDigest,status.conditions)']),
 build:cloud(['builds','describe',c.buildId,'--project='+c.project,'--region='+c.buildRegion,'--format=json(id,status,sourceProvenance.resolvedRepoSource.commitSha,results.images)'])};},
 logs:async c=>{const from=new Date(Date.now()-15*60000).toISOString(),filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'+c.service+'" AND resource.labels.revision_name="'+c.revision+'" AND severity>=ERROR AND timestamp>="'+from+'"';const logs=cloud(['logging','read',filter,'--project='+c.project,'--limit=20','--format=json(timestamp,severity)']);return {count:logs.length};}};}
if(require.main===module){(async()=>{try{const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const report=await runAcceptance(config,liveDependencies(process.env));console.log(JSON.stringify(report,null,2));process.exitCode=report.result==='PASS'?0:report.result==='FAIL'?1:2;}catch{console.log(JSON.stringify({result:'NOT RUN',reason:'VALID_NON_SECRET_CONFIG_REQUIRED',liveAcceptance:false,promotionAuthorized:false}));process.exitCode=2;}})();}
module.exports={validateConfig,verifyMetadata,runAcceptance,liveDependencies};
