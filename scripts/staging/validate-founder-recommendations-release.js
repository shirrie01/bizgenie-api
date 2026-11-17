'use strict';
// Separate OFFLINE profile. Never changes the locked R1 manifest or contacts infrastructure.
const {validateFounderOnboardingRelease}=require('./validate-founder-onboarding-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const evidence=['founderRecommendationsApproval','bridgeImageProvenanceEvidence','rollbackEvidence'];
function validateFounderRecommendationsRelease(r){
 try{
  if(!r||typeof r!=='object'||Array.isArray(r))throw Error();
  const clone=structuredClone(r),e=clone.environment||{},flag=e.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS;
  delete e.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS;
  for(const key of evidence)delete clone[key];
  // Existing validator still enforces its exact top-level/env schema, pins, founder
  // identity/evidence, staging-only target and every unrelated write gate OFF.
  const result=validateFounderOnboardingRelease(clone);
  if(flag===undefined||flag==='false')return result;
  if(flag!=='true'||e.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING!=='true')throw Error();
  for(const key of evidence)if(typeof r[key]!=='string'||!r[key].trim()||/UNRESOLVED|PENDING|UNKNOWN/.test(r[key]))throw Error();
  validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,
   sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,
   allowFounderOnboarding:true,allowFounderRecommendations:true,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,
   ...Object.fromEntries([['allowWrites','WRITES'],['allowWorkspaceBootstrap','WORKSPACE_BOOTSTRAP'],['allowDraftWorkflow','DRAFT_WORKFLOW'],['allowGenerationConfirmation','GENERATION_CONFIRMATION'],['allowSocialWrites','SOCIAL_WRITES'],['allowStripeCheckout','STRIPE_CHECKOUT']].map(([k,v])=>[k,e['BG_BRIDGE_ALLOW_'+v]==='true']))});
  return {...result,status:'OFFLINE_FOUNDER_RECOMMENDATIONS_VALIDATED_NOT_DEPLOYMENT_APPROVAL'};
 }catch{throw Error('FOUNDER_RECOMMENDATIONS_RELEASE_NOT_READY');}
}
if(require.main===module){try{console.log(JSON.stringify(validateFounderRecommendationsRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_RECOMMENDATIONS_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderRecommendationsRelease};
