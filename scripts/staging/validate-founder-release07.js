'use strict';
// BG-FOUNDER-RELEASE-07 — OFFLINE envelope validation for the Fonzo workspace and the Fonzo A1->A2 handoff. It reads a private JSON envelope only.
// A syntactically valid evidence reference is NOT evidence that an approval exists, and equal pins do NOT prove account ownership or database authority:
// the independent evidence must be read by a reviewer. This script never authenticates, calls cloud/database services, or prints identifiers.
const {validateFounderOnboardingRelease}=require('./validate-founder-onboarding-release');
const {validateFounderRelease04}=require('./validate-founder-release04');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const R07=require('../../src/studio-bridge/founderRelease07');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const WORKSPACE_KEYS=['BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE','BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID','BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME','BG_BRIDGE_FOUNDER_WORKSPACE_WEBSITE','BG_BRIDGE_FOUNDER_WORKSPACE_CHALLENGE'];
const INTAKE_KEYS=['BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE','BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID','BG_BRIDGE_FOUNDER_INTAKE_PROJECT_ID','BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID'];
const ref=v=>typeof v==='string'&&/^https:\/\/github\.com\/shirrie01\/bizgenie-api\/(?:issues|pull)\/\d+#issuecomment-\d+$/.test(v);
const ids=['tenant_id','project_id','brand_id'];
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const same3=(a,b)=>ids.every(k=>typeof a?.[k]==='string'&&a[k]===b?.[k]);
function strip(env,keys){const out={};for(const k of keys){if(env[k]!==undefined)out[k]=env[k];delete env[k];}return out;}
function evidence(input,extra){
 const keys=['profile','baseProfile','approvalRef','independentScopeEvidenceRef','rollbackEvidenceRef','protectedScope',...extra];
 if(!exact(input,keys)||!['approvalRef','independentScopeEvidenceRef','rollbackEvidenceRef'].every(k=>ref(input[k]))||new Set([input.approvalRef,input.independentScopeEvidenceRef,input.rollbackEvidenceRef]).size!==3)throw Error();
 // The accepted Fairway scope, supplied privately, must be a full tuple (campaign optional) and is only ever compared against.
 if(!exact(input.protectedScope,['tenant_id','project_id','brand_id','campaign_id'])||ids.some(k=>typeof input.protectedScope[k]!=='string'||!input.protectedScope[k])||!UUID.test(input.protectedScope.campaign_id))throw Error();
}
function validateWorkspaceProfile(input){
 evidence(input,[]);
 const clone=structuredClone(input.baseProfile),env=clone?.environment;if(!env)throw Error();
 const pins=strip(env,WORKSPACE_KEYS);
 if(pins.BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE!=='true'||[...INTAKE_KEYS,'BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING','BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS','BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT','BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING','BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS','BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT','BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW'].some(k=>env[k]==='true'))throw Error();
 const base=validateFounderOnboardingRelease(clone);
 const target={...R07.fromEnv({...pins,BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE:'false'}),environment:env.BIZGENIE_ENVIRONMENT,upstream:env.BG_BRIDGE_TARGET_URL,audience:env.BG_BRIDGE_AUDIENCE,revision:env.BG_BRIDGE_REVISION,sourceSha:env.BG_BRIDGE_SOURCE_SHA,reviewRef:env.BG_BRIDGE_REVIEW_REF,origin:env.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:env.BG_BRIDGE_FOUNDER_AUTH_USER_ID,allowFounderOnboarding:false};
 for(const [name,key]of Object.entries({allowWrites:'WRITES',allowWorkspaceBootstrap:'WORKSPACE_BOOTSTRAP',allowDraftWorkflow:'DRAFT_WORKFLOW',allowGenerationConfirmation:'GENERATION_CONFIRMATION',allowSocialWrites:'SOCIAL_WRITES',allowStripeCheckout:'STRIPE_CHECKOUT'}))target[name]=env['BG_BRIDGE_ALLOW_'+key]==='true';
 validateBridgeTarget(target);
 // The new workspace is created under the founder's existing tenant: the pin must name that tenant and the protected Fairway campaign is never a target.
 if(pins.BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID!==input.protectedScope.tenant_id)throw Error();
 return {...base,status:'OFFLINE_FOUNDER_WORKSPACE07_VALIDATED_NOT_DEPLOYMENT_APPROVAL',profile:'workspace'};
}
// A1 is the accepted founder-campaign profile for the NEW Fonzo scope; A2 adds draft, copy, social and asset intake with the campaign id that A1 produced.
function validateA1ToA2(input,options){
 evidence(input,['a1']);
 if(!exact(input.a1,['campaignRoot'])||!exact(input.a1.campaignRoot,[...ids,'body_sha256'])||!/^[a-f0-9]{64}$/.test(input.a1.campaignRoot.body_sha256))throw Error();
 const clone=structuredClone(input.baseProfile),env=clone?.environment;if(!env)throw Error();
 const intake=strip(env,INTAKE_KEYS);if(Object.keys(strip(env,WORKSPACE_KEYS)).length)throw Error();
 if(intake.BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE!=='true')throw Error();
 const root={tenant_id:env.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,project_id:env.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brand_id:env.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID},draft={tenant_id:env.BG_BRIDGE_FOUNDER_DRAFT_TENANT_ID,project_id:env.BG_BRIDGE_FOUNDER_DRAFT_PROJECT_ID,brand_id:env.BG_BRIDGE_FOUNDER_DRAFT_BRAND_ID},pin={tenant_id:intake.BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID,project_id:intake.BG_BRIDGE_FOUNDER_INTAKE_PROJECT_ID,brand_id:intake.BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID};
 // Handoff: what A1 actually deployed must be what A2 carries, byte for byte, and A2's campaign must be a new campaign.
 if(!same3(root,input.a1.campaignRoot)||env.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256!==input.a1.campaignRoot.body_sha256||!same3(draft,root)||!same3(pin,root))throw Error();
 if(!UUID.test(env.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID||'')||env.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID===input.protectedScope.campaign_id)throw Error();
 // Fairway protection: the fixed campaign key is namespaced by tenant/project/actor, so the Fonzo project must differ, and no pin may equal the protected brand.
 if(root.project_id===input.protectedScope.project_id||root.brand_id===input.protectedScope.brand_id||same3(root,input.protectedScope))throw Error();
 const base=validateFounderRelease04({profile:'draft_connections',baseProfile:clone,approvalRef:input.approvalRef,routeEvidenceRef:input.independentScopeEvidenceRef,rollbackEvidenceRef:input.rollbackEvidenceRef},options);
 // Re-run the real configuration rules with intake included.
 const flag=k=>env[k]==='true';
 const target={...R07.fromEnv({...intake,BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE:'false'}),environment:env.BIZGENIE_ENVIRONMENT,upstream:env.BG_BRIDGE_TARGET_URL,audience:env.BG_BRIDGE_AUDIENCE,revision:env.BG_BRIDGE_REVISION,sourceSha:env.BG_BRIDGE_SOURCE_SHA,reviewRef:env.BG_BRIDGE_REVIEW_REF,origin:env.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:env.BG_BRIDGE_FOUNDER_AUTH_USER_ID,allowFounderOnboarding:flag('BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING'),allowFounderRecommendations:flag('BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS'),allowFounderCampaignRoot:true,founderCampaign:{...root,body_sha256:env.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256},allowFounderDraftWorkflow:true,founderDraftScope:{...draft,campaign_id:env.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID},allowFounderCopyEditing:flag('BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING'),allowFounderSocialConnections:flag('BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS')};
 for(const [name,key]of Object.entries({allowWrites:'WRITES',allowWorkspaceBootstrap:'WORKSPACE_BOOTSTRAP',allowDraftWorkflow:'DRAFT_WORKFLOW',allowGenerationConfirmation:'GENERATION_CONFIRMATION',allowSocialWrites:'SOCIAL_WRITES',allowStripeCheckout:'STRIPE_CHECKOUT'}))target[name]=flag('BG_BRIDGE_ALLOW_'+key);
 validateBridgeTarget(target);
 return {...base,status:'OFFLINE_FOUNDER_FONZO_A2_07_VALIDATED_NOT_DEPLOYMENT_APPROVAL',profile:'fonzo_a2'};
}
function validateFounderRelease07(input,options={}){
 try{
  if(input?.profile==='workspace')return validateWorkspaceProfile(input);
  if(input?.profile==='fonzo_a2')return validateA1ToA2(input,options);
  throw Error();
 }catch{throw Error('FOUNDER_RELEASE07_NOT_READY');}
}
if(require.main===module){try{console.log(JSON.stringify(validateFounderRelease07(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_RELEASE07_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderRelease07,WORKSPACE_KEYS,INTAKE_KEYS};
