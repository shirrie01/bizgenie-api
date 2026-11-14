// Offline metadata/profile validation only; never authenticates, deploys or prints the founder ID.
'use strict';
const {validateRelease}=require('./validate-bridge-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const fields=['project','region','service','sourceSha','image','serviceAccount','identitySuitabilityEvidence','publicInvokerApproval','upstreamTagEvidence','environment',
 'founderOnboardingApproval','founderIdentityBindingEvidence','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence'];
const evidence=['founderOnboardingApproval','founderIdentityBindingEvidence','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence'];
function validateFounderOnboardingRelease(r){
 try{
  if(!r||Object.keys(r).some(k=>!fields.includes(k)))throw Error();
  const e=r.environment||{},flag=e.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING;
  if(flag===undefined||flag==='false')return validateRelease(r);
  if(flag!=='true')throw Error();
  for(const key of evidence)if(typeof r[key]!=='string'||!r[key].trim()||r[key].includes('UNRESOLVED'))throw Error();
  const clone=structuredClone(r);clone.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING='false';
  // This preserves exact project/service/image/IAM/upstream pins, all other gates OFF,
  // strict environment keys and optional UUID validation. No original manifest mutation.
  const result=validateRelease(clone);
  // Use the actual bridge's configuration rules, including missing UUID rejection.
  validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,
   sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,
   allowFounderOnboarding:true,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID});
  return {...result,status:'OFFLINE_FOUNDER_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL'};
 }catch{throw Error('FOUNDER_ONBOARDING_RELEASE_NOT_READY');}
}
if(require.main===module){try{console.log(JSON.stringify(validateFounderOnboardingRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_ONBOARDING_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderOnboardingRelease};
