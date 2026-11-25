'use strict';
// BG-FOUNDER-RELEASE-07 — two separate, default-OFF founder bridge permissions. Pure checks: no I/O, no provider, no database.
//   1. allowFounderAdditionalWorkspace: exactly `POST /customer/workspace/brands` with one pinned body, which MUST carry a pinned idempotency key: the API derives the
//      workspace ids from (owner, tenant, key), so duplicate protection is durable in the database and survives restarts, replicas and lost responses.
//   2. allowFounderAssetIntake: exactly the existing media-intake sequence (init, bytes, complete) plus founder-only reads, for ONE pinned scope.
// The API keeps every authoritative check (owner role, tenant ownership, rights policy, hash, scan, state machine). This module only narrows what the bridge forwards.
const {z}=require('zod');
const {CustomerTrustedScopeSchema}=require('../authorization/schema');
const UUID='[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const MAX_BYTES=33554432;
const TYPES=Object.freeze(['image/png','image/jpeg','image/webp','video/mp4']);
const BROAD=['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'];
const text=max=>z.string().min(1).max(max).refine(v=>v===v.trim()&&v.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(v));
const WorkspaceBinding=z.object({tenant_id:CustomerTrustedScopeSchema.shape.tenant_id,idempotency_key:z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).refine(v=>v!=='bg-r2-founder-campaign-v1'),business_name:text(200),website_or_social_profile:text(500).optional(),primary_marketing_challenge:text(1000).optional()}).strict();
const same=(a,b)=>['tenant_id','project_id','brand_id'].every(k=>a?.[k]!==undefined&&a[k]===b?.[k]);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&!Buffer.isBuffer(v);
const keys=v=>Object.keys(v).sort().join(',');

function scopeBinding(value){const p=CustomerTrustedScopeSchema.safeParse(value);if(!p.success||Object.keys(p.data).some(k=>p.data[k]!==value[k])||keys(p.data)!=='brand_id,project_id,tenant_id')throw Error('Verified founder intake scope required');return Object.freeze({...p.data});}
function workspaceBinding(value){const p=WorkspaceBinding.safeParse(value);if(!p.success||Object.keys(p.data).some(k=>p.data[k]!==value[k]))throw Error('Verified founder workspace binding required');return Object.freeze({...p.data});}

// Startup validation, called from config(). Both permissions are isolated from every other write permission except where stated.
function validate(c,validFounderId){
 for(const key of ['allowFounderAdditionalWorkspace','allowFounderAssetIntake'])if(c[key]!==undefined&&typeof c[key]!=='boolean')throw Error('Explicit founder release permission required');
 const others=['allowFounderOnboarding','allowFounderRecommendations','allowFounderCampaignRoot','allowFounderDraftWorkflow','allowFounderCopyEditing','allowFounderSocialConnections','allowFounderVideoAttachment'];
 if(c.allowFounderAdditionalWorkspace===true){
  if(!validFounderId(c.founderAuthUserId)||c.allowFounderAssetIntake===true||c.founderVideo!==undefined||others.some(k=>c[k]===true)||BROAD.some(k=>c[k]!==undefined&&c[k]!==false))throw Error('Isolated founder workspace permission required');
  c.founderAdditionalWorkspace=workspaceBinding(c.founderAdditionalWorkspace);
 }else if(c.founderAdditionalWorkspace!==undefined)throw Error('Explicit founder workspace permission required');
 if(c.allowFounderAssetIntake===true){
  if(!validFounderId(c.founderAuthUserId)||c.founderVideo!==undefined||c.allowFounderVideoAttachment===true||BROAD.some(k=>c[k]!==undefined&&c[k]!==false))throw Error('Isolated founder intake permission required');
  c.founderAssetIntake=scopeBinding(c.founderAssetIntake);
  if(c.allowFounderDraftWorkflow===true&&!same(c.founderDraftScope,c.founderAssetIntake))throw Error('Consistent founder intake scope required');
  if(c.allowFounderCampaignRoot===true&&!same(c.founderCampaign,c.founderAssetIntake))throw Error('Consistent founder intake scope required');
 }else if(c.founderAssetIntake!==undefined)throw Error('Explicit founder intake permission required');
}

// Entrypoint parsing: strict true/false, and stale pins are rejected while the permission is OFF.
function fromEnv(env){
 const flag=(key)=>{const v=env[key];if(v===undefined||v==='false')return false;if(v==='true')return true;throw Error('Explicit founder release permission required');};
 const ws=flag('BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE'),ia=flag('BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE'),out={allowFounderAdditionalWorkspace:ws,allowFounderAssetIntake:ia};
 const pins=prefix=>Object.keys(env).filter(k=>k.startsWith(prefix)&&env[k]!==undefined);
 if(ws){const w={tenant_id:env.BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID,idempotency_key:env.BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY,business_name:env.BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME};if(env.BG_BRIDGE_FOUNDER_WORKSPACE_WEBSITE!==undefined)w.website_or_social_profile=env.BG_BRIDGE_FOUNDER_WORKSPACE_WEBSITE;if(env.BG_BRIDGE_FOUNDER_WORKSPACE_CHALLENGE!==undefined)w.primary_marketing_challenge=env.BG_BRIDGE_FOUNDER_WORKSPACE_CHALLENGE;out.founderAdditionalWorkspace=w;}
 else if(pins('BG_BRIDGE_FOUNDER_WORKSPACE_').length)throw Error('Explicit founder workspace permission required');
 if(ia)out.founderAssetIntake={tenant_id:env.BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID,project_id:env.BG_BRIDGE_FOUNDER_INTAKE_PROJECT_ID,brand_id:env.BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID};
 else if(pins('BG_BRIDGE_FOUNDER_INTAKE_').length)throw Error('Explicit founder intake permission required');
 return out;
}

// Route classifiers. `url` is req.originalUrl (including any query): anything not byte-for-byte one of these shapes is denied.
function workspace(c,method,url){return c.allowFounderAdditionalWorkspace===true&&method==='POST'&&url==='/customer/workspace/brands';}
function intakeKind(c,method,url){
 if(c.allowFounderAssetIntake!==true)return null;
 if(method==='POST'&&url==='/customer/assets/uploads')return 'init';
 if(method==='POST'&&new RegExp('^/customer/assets/'+UUID+'/complete$').test(url))return 'complete';
 if(method==='PUT'&&new RegExp('^/customer/assets/uploads/'+UUID+'/bytes\\?[^#]*$').test(url))return 'bytes';
 return null;
}
function intakeRead(c,method,url){return c.allowFounderAssetIntake===true&&['GET','HEAD'].includes(method)&&/^\/customer\/assets(?:[/?]|$)/.test(url);}

function workspaceBodyMatches(binding,body){return plain(body)&&keys(body)===keys(binding)&&Object.keys(binding).every(k=>body[k]===binding[k]);}
function queryScope(url,optional=[]){const q=new URL(url,'http://bridge.invalid').searchParams,names=[...q.keys()],need=['tenant_id','project_id','brand_id'];if(new Set(names).size!==names.length||need.some(k=>!names.includes(k))||names.some(k=>!need.includes(k)&&!optional.includes(k)))return null;return Object.fromEntries(need.map(k=>[k,q.get(k)]));}
function trustedScopeValid(c,scope){return same(scope,c.founderAssetIntake);}
function readScopeValid(c,url){const q=queryScope(url,['limit','cursor']);return !!q&&same(q,c.founderAssetIntake);}

// True only when the (already parsed) request is exactly the pinned, rights-confirmed shape. Reasons are deliberately not returned.
function intakeValid(c,kind,{body,url,contentType,trustedScope}){
 const pin=c.founderAssetIntake;if(!same(trustedScope,pin))return false;
 if(kind==='init'){
  if(!plain(body)||keys(body)!=='brand_id,bytes,content_type,filename,idempotency_key,project_id,rights_confirmed,tenant_id'||!same(body,pin)||body.rights_confirmed!==true)return false;
  return TYPES.includes(body.content_type)&&Number.isSafeInteger(body.bytes)&&body.bytes>=1&&body.bytes<=MAX_BYTES&&typeof body.filename==='string'&&body.filename.length>=1&&body.filename.length<=200&&/^[^/\\\x00-\x1f]+$/.test(body.filename)&&CustomerTrustedScopeSchema.shape.tenant_id.safeParse(body.idempotency_key).success;
 }
 if(kind==='complete')return plain(body)&&keys(body)==='brand_id,project_id,tenant_id'&&same(body,pin);
 if(kind==='bytes'){const q=queryScope(url);return !!q&&same(q,pin)&&TYPES.includes(contentType)&&Buffer.isBuffer(body)&&body.length>=1&&body.length<=MAX_BYTES;}
 return false;
}
module.exports={validate,fromEnv,workspace,intakeKind,intakeRead,workspaceBodyMatches,intakeValid,readScopeValid,trustedScopeValid,scopeBinding,workspaceBinding,MAX_BYTES,TYPES};
