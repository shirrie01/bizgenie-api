'use strict';
// Separate OFFLINE profile. Syntax checks never establish actual authority or deployment.
const {validateFounderDraftRelease}=require('./validate-founder-draft-release');
const {validateFounderVideoRelease}=require('./validate-founder-video-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const {bridgeVideoConfig}=require('../../src/provider-spend/founderVideoConfig');
const flags={allowFounderCopyEditing:'BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING',allowFounderVideoAttachment:'BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT',allowFounderSocialConnections:'BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS'};
const ref=v=>typeof v==='string'&&/^https:\/\/github\.com\/shirrie01\/bizgenie-api\/(?:issues|pull)\/\d+#issuecomment-\d+$/.test(v);
function validateFounderRelease04(input,{now=new Date()}={}){
 try{
  const keys=['profile','baseProfile','approvalRef','routeEvidenceRef','rollbackEvidenceRef'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k))||!['draft_connections','video'].includes(input.profile)||!['approvalRef','routeEvidenceRef','rollbackEvidenceRef'].every(k=>ref(input[k])))throw Error();
  const clone=structuredClone(input.baseProfile),env=clone?.environment;if(!env)throw Error();
  const permissions={};for(const [name,key] of Object.entries(flags)){if(env[key]!==undefined&&!['true','false'].includes(env[key]))throw Error();permissions[name]=env[key]==='true';delete env[key];}
  let base;
  if(input.profile==='video'){
   if(!permissions.allowFounderVideoAttachment||permissions.allowFounderCopyEditing||permissions.allowFounderSocialConnections||input.approvalRef!==input.baseProfile.founderVideoApproval)throw Error();
   base=validateFounderVideoRelease(clone,{now});
  }else{
   if(permissions.allowFounderVideoAttachment||!permissions.allowFounderCopyEditing&&!permissions.allowFounderSocialConnections)throw Error();
   base=validateFounderDraftRelease(clone);
  }
  const b=input.baseProfile.environment;
  const config={...permissions,environment:b.BIZGENIE_ENVIRONMENT,upstream:b.BG_BRIDGE_TARGET_URL,audience:b.BG_BRIDGE_AUDIENCE,revision:b.BG_BRIDGE_REVISION,sourceSha:b.BG_BRIDGE_SOURCE_SHA,reviewRef:b.BG_BRIDGE_REVIEW_REF,origin:b.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:b.BG_BRIDGE_FOUNDER_AUTH_USER_ID};
  for(const [name,key]of Object.entries({allowFounderOnboarding:'ONBOARDING',allowFounderRecommendations:'RECOMMENDATIONS',allowFounderCampaignRoot:'CAMPAIGN_ROOT',allowFounderDraftWorkflow:'DRAFT_WORKFLOW'}))config[name]=b['BG_BRIDGE_ALLOW_FOUNDER_'+key]==='true';
  for(const [name,key]of Object.entries({allowWrites:'WRITES',allowWorkspaceBootstrap:'WORKSPACE_BOOTSTRAP',allowDraftWorkflow:'DRAFT_WORKFLOW',allowGenerationConfirmation:'GENERATION_CONFIRMATION',allowSocialWrites:'SOCIAL_WRITES',allowStripeCheckout:'STRIPE_CHECKOUT'}))config[name]=b['BG_BRIDGE_ALLOW_'+key]==='true';
  if(config.allowFounderDraftWorkflow)config.founderDraftScope=Object.fromEntries(['TENANT_ID','PROJECT_ID','BRAND_ID','CAMPAIGN_ID'].map(k=>[k.toLowerCase(),b['BG_BRIDGE_FOUNDER_DRAFT_'+k]]));
  if(config.allowFounderCampaignRoot)config.founderCampaign={tenant_id:b.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,project_id:b.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brand_id:b.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID,body_sha256:b.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256};
  const video=bridgeVideoConfig(b);if(video)config.founderVideo=video;
  validateBridgeTarget(config);
  return {...base,status:'OFFLINE_FOUNDER_RELEASE04_VALIDATED_NOT_DEPLOYMENT_APPROVAL',profile:input.profile};
 }catch{throw Error('FOUNDER_RELEASE04_NOT_READY');}
}
if(require.main===module){try{console.log(JSON.stringify(validateFounderRelease04(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_RELEASE04_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderRelease04,flags};
