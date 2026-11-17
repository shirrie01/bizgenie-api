'use strict';
const {validateFounderRecommendationsRelease}=require('./validate-founder-recommendations-release');
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
const evidence=['founderCampaignApproval','campaignAcceptanceBindingEvidence','campaignRepositoryAcceptanceEvidence'];
const extra=['BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT',...['TENANT_ID','PROJECT_ID','BRAND_ID','BODY_SHA256'].map(k=>'BG_BRIDGE_FOUNDER_CAMPAIGN_'+k)];
function validateFounderCampaignRelease(r){try{
 const c=structuredClone(r),e=r.environment||{},flag=e.BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT;
 for(const k of evidence)delete c[k];for(const k of extra)delete c.environment[k];
 const result=validateFounderRecommendationsRelease(c);
 if(flag===undefined||flag==='false'){if(extra.slice(1).some(k=>e[k]!==undefined))throw Error();return result;}
 if(flag!=='true'||e.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING!=='true')throw Error();
 for(const k of evidence)if(typeof r[k]!=='string'||!r[k].trim()||/UNRESOLVED|UNKNOWN|PENDING/.test(r[k]))throw Error();
 validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,allowFounderOnboarding:true,allowFounderRecommendations:e.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS==='true',allowFounderCampaignRoot:true,founderCampaign:{tenant_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,project_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brand_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID,body_sha256:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256}});
 return {...result,status:'OFFLINE_FOUNDER_CAMPAIGN_VALIDATED_NOT_DEPLOYMENT_APPROVAL'};
}catch{throw Error('FOUNDER_CAMPAIGN_RELEASE_NOT_READY');}}
if(require.main===module){try{console.log(JSON.stringify(validateFounderCampaignRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('FOUNDER_CAMPAIGN_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateFounderCampaignRelease};
