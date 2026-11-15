// OFFLINE only: syntax/evidence references cannot establish actual IAM, pricing or approval truth.
'use strict';
const {validateFounderOnboardingRelease}=require('./validate-founder-onboarding-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const {bridgeVideoConfig,apiVideoConfig,reference}=require('../../src/provider-spend/founderVideoConfig');
const {matches,MAX_STATUS_OBSERVATIONS}=require('../../src/provider-spend/founderVideo');
const {approvedEstimate}=require('../../src/provider-spend/estimateAuthority');
const videoKeys=['BG_BRIDGE_ALLOW_FOUNDER_VIDEO','BG_BRIDGE_FOUNDER_VIDEO_TENANT_ID','BG_BRIDGE_FOUNDER_VIDEO_PROJECT_ID','BG_BRIDGE_FOUNDER_VIDEO_BRAND_ID','BG_BRIDGE_FOUNDER_VIDEO_CAMPAIGN_ID','BG_BRIDGE_FOUNDER_VIDEO_VARIANT_ID','BG_BRIDGE_FOUNDER_VIDEO_APPROVAL_REF'];
const evidence=['founderOnboardingApproval','founderIdentityBindingEvidence','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence','founderVideoApproval','runtimeCompositionEvidence','migrationAcceptanceEvidence','pricingAuthorityEvidence','entitlementEvidence','rollbackEvidence','legalApprovalEvidence','operator'];
const top=['project','region','service','sourceSha','image','serviceAccount','identitySuitabilityEvidence','publicInvokerApproval','upstreamTagEvidence','environment',...evidence,'apiEnvironment','apiImage','apiSourceSha','costPolicy','validatedAt'];
function validateFounderVideoRelease(r,{now=new Date()}={}){
 try{
  if(!r||Object.keys(r).some(k=>!top.includes(k))||evidence.some(k=>!reference(r[k]))||!r.environment||r.environment.BG_BRIDGE_ALLOW_FOUNDER_VIDEO!=='true')throw Error();
  for(const k of ['identitySuitabilityEvidence','publicInvokerApproval','upstreamTagEvidence'])if(!reference(r[k]))throw Error();
  if(!/^[a-f0-9]{40}$/.test(r.apiSourceSha||'')||r.apiSourceSha!==r.environment.BG_BRIDGE_SOURCE_SHA||!/^europe-west1-docker.pkg.dev\/bizgenie-backend\/[a-z0-9_-]+\/[a-z0-9_-]+@sha256:[a-f0-9]{64}$/.test(r.apiImage||''))throw Error();
  const founder=bridgeVideoConfig(r.environment),api=apiVideoConfig(r.apiEnvironment||{});
  const apiKeys=['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','GCP_PROJECT','BIZGENIE_ENVIRONMENT','SUPABASE_URL','QUOTED_GENERATION_ENABLED','VIDEO_GENERATION_ENABLED','MEDIA_STORAGE_ENABLED','BILLING_DURABLE_ENABLED','PRODUCTION_ACTIVATION_ENABLED','IMAGE_GENERATION_ENABLED','SOCIAL_PUBLISHING_ENABLED','STRIPE_BILLING_ENABLED','STRATEGY_WORKFLOWS_ENABLED','LEARNING_ENABLED','MEDIA_INTAKE_ENABLED','VIDEO_DURATION_SECONDS','VIDEO_ASPECT_RATIO','VIDEO_INSPECTION_ISOLATION','VIDEO_PROVIDER_OUTPUT_STORAGE_URI','FOUNDER_VIDEO_ACCEPTANCE_ENABLED','FOUNDER_VIDEO_AUTH_USER_ID','FOUNDER_VIDEO_TENANT_ID','FOUNDER_VIDEO_PROJECT_ID','FOUNDER_VIDEO_BRAND_ID','FOUNDER_VIDEO_CAMPAIGN_ID','FOUNDER_VIDEO_VARIANT_ID','FOUNDER_VIDEO_APPROVAL_REF','FOUNDER_VIDEO_SPEND_POLICY_VERSION','FOUNDER_VIDEO_SUBMIT_ESTIMATE_VERSION','FOUNDER_VIDEO_STATUS_ESTIMATE_VERSION'];
  if(!api||api.approvalRef!==r.founderVideoApproval||r.environment.BG_BRIDGE_FOUNDER_VIDEO_APPROVAL_REF!==r.founderVideoApproval||Object.keys(r.apiEnvironment).some(k=>!apiKeys.includes(k))||!matches(founder,api.founder))throw Error();
  const clone=structuredClone(r);for(const k of Object.keys(clone))if(!['project','region','service','sourceSha','image','serviceAccount','identitySuitabilityEvidence','publicInvokerApproval','upstreamTagEvidence','environment','founderOnboardingApproval','founderIdentityBindingEvidence','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence'].includes(k))delete clone[k];
  for(const k of videoKeys)delete clone.environment[k];
  const base=validateFounderOnboardingRelease(clone);
  const e=r.environment;
  validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,founderVideo:founder,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,allowFounderOnboarding:e.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING==='true',...Object.fromEntries([['allowWrites','BG_BRIDGE_ALLOW_WRITES'],['allowWorkspaceBootstrap','BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP'],['allowDraftWorkflow','BG_BRIDGE_ALLOW_DRAFT_WORKFLOW'],['allowGenerationConfirmation','BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION'],['allowSocialWrites','BG_BRIDGE_ALLOW_SOCIAL_WRITES'],['allowStripeCheckout','BG_BRIDGE_ALLOW_STRIPE_CHECKOUT']].map(([k,v])=>[k,e[v]==='true']))});
  const at=new Date(r.validatedAt),p=r.costPolicy;
  if(!Number.isFinite(now.getTime())||!Number.isFinite(at.getTime())||Math.abs(now.getTime()-at.getTime())>300000||!p||p.currency!=='GBP'||p.cap_minor!==10000||p.customer_limit!==10||p.acceptance_cap_minor!==500||p.max_status_observations!==MAX_STATUS_OBSERVATIONS||p.version!==api.policyVersion)throw Error();
  for(const [v,unit,version]of [[p.submit,'second',api.submitVersion],[p.status,'request',api.statusVersion]])if(!v||v.version!==version||!reference(v.source_ref)||!approvedEstimate(v,now)||v.authority?.pricing_unit!==unit||!reference(v.authority.pricing_source_ref)||!reference(v.authority.pricing_version)||!(Date.parse(v.authority.pricing_valid_until)>now.getTime())||!(Date.parse(v.valid_until)>now.getTime()))throw Error();
  if(p.submit.upper_bound_minor+MAX_STATUS_OBSERVATIONS*p.status.upper_bound_minor>500)throw Error();
  return{...base,status:'OFFLINE_FOUNDER_VIDEO_VALIDATED_NOT_DEPLOYMENT_APPROVAL',apiSourceSha:r.apiSourceSha};
 }catch{throw Error('FOUNDER_VIDEO_RELEASE_NOT_READY');}
}
if(require.main===module){try{console.log(JSON.stringify(validateFounderVideoRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_VIDEO_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderVideoRelease};
