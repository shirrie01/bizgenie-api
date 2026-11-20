'use strict';
// Dedicated OFFLINE profile; never edits accepted manifests or accesses cloud/database services.
const {validateFounderCampaignRelease}=require('./validate-founder-campaign-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const pins=['TENANT_ID','PROJECT_ID','BRAND_ID','CAMPAIGN_ID'];
const evidence=['founderDraftWorkflowApproval','founderDraftCampaignBindingEvidence','draftWorkflowDatabasePoolEvidence','founderDraftRollbackEvidence'];
const metadata=['founderDraftCampaignBinding','founderDraftRollback'];
const fields=['auth_user_id','tenant_id','project_id','brand_id','campaign_id'];
const image=/^europe-west1-docker\.pkg\.dev\/bizgenie-backend\/cloud-run-source-deploy\/bizgenie-studio-bridge@sha256:[a-f0-9]{64}$/;
const revision=/^bizgenie-studio-bridge-staging-[a-z0-9]+(?:-[a-z0-9]+)*$/;
function exact(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function validateFounderDraftRelease(r){try{
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error();
 const c=structuredClone(r),e=r.environment||{},flag=e.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW;
 for(const key of [...evidence,...metadata])delete c[key];
 delete c.environment.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW;
 for(const key of pins)delete c.environment['BG_BRIDGE_FOUNDER_DRAFT_'+key];
 // All prior staging/identity/root-hash/upstream/schema/OFF-gate restrictions remain authoritative.
 const result=validateFounderCampaignRelease(c);
 if(flag===undefined||flag==='false'){
  if(pins.some(k=>e['BG_BRIDGE_FOUNDER_DRAFT_'+k]!==undefined)||r.founderDraftCampaignBinding!==undefined)throw Error();
  return result;
 }
 if(flag!=='true'||['ONBOARDING','RECOMMENDATIONS','CAMPAIGN_ROOT'].some(k=>e['BG_BRIDGE_ALLOW_FOUNDER_'+k]!=='true'))throw Error();
 for(const key of evidence)if(typeof r[key]!=='string'||!r[key].trim()||/UNRESOLVED|PENDING|UNKNOWN/i.test(r[key]))throw Error();
 const b=r.founderDraftCampaignBinding;
 if(!exact(b,fields)||b.auth_user_id!==e.BG_BRIDGE_FOUNDER_AUTH_USER_ID||pins.some(k=>b[k.toLowerCase()]!==e['BG_BRIDGE_FOUNDER_DRAFT_'+k]))throw Error();
 const rollback=r.founderDraftRollback;
 if(!exact(rollback,['acceptedR2','step7']))throw Error();
 for(const v of Object.values(rollback))if(!exact(v,['revision','image'])||typeof v.revision!=='string'||v.revision.length>63||!revision.test(v.revision)||typeof v.image!=='string'||!image.test(v.image))throw Error();
 if(rollback.acceptedR2.revision===rollback.step7.revision||rollback.acceptedR2.image===r.image)throw Error();
 if(rollback.acceptedR2.image!=='europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:5f4519afba18377726460273d668cad1b3f961222a357cf16c1fe9e5b33e8c9c')throw Error();
 if(rollback.step7.revision!=='bizgenie-studio-bridge-staging-step7-c023184c'||rollback.step7.image!=='europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18')throw Error();
 validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,
  allowFounderOnboarding:true,allowFounderRecommendations:true,allowFounderCampaignRoot:true,allowFounderDraftWorkflow:true,
  founderCampaign:{tenant_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,project_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brand_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID,body_sha256:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256},
  founderDraftScope:Object.fromEntries(pins.map(k=>[k.toLowerCase(),e['BG_BRIDGE_FOUNDER_DRAFT_'+k]])),
  ...Object.fromEntries([['allowWrites','WRITES'],['allowWorkspaceBootstrap','WORKSPACE_BOOTSTRAP'],['allowDraftWorkflow','DRAFT_WORKFLOW'],['allowGenerationConfirmation','GENERATION_CONFIRMATION'],['allowSocialWrites','SOCIAL_WRITES'],['allowStripeCheckout','STRIPE_CHECKOUT']].map(([k,v])=>[k,e['BG_BRIDGE_ALLOW_'+v]==='true']))});
 return {...result,status:'OFFLINE_FOUNDER_DRAFT_VALIDATED_NOT_DEPLOYMENT_APPROVAL'};
}catch{throw Error('FOUNDER_DRAFT_RELEASE_NOT_READY');}}
if(require.main===module){try{console.log(JSON.stringify(validateFounderDraftRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_DRAFT_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderDraftRelease};
