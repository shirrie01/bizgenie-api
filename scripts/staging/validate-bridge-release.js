// Offline validation only. Never deploys, contacts cloud services or emits credentials.
'use strict';
const {validateBridgeTarget}=require('../../src/studio-bridge/service');
function validateRelease(r){
 const fail=()=>{throw Error('BRIDGE_RELEASE_NOT_READY');};
 if(!r||r.project!=='bizgenie-backend'||r.region!=='europe-west1'||r.service!=='bizgenie-studio-bridge-staging'||r.serviceAccount!=='bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com')fail();
 if(!/^[a-f0-9]{40}$/.test(r.sourceSha||'')||!/^europe-west1-docker.pkg.dev\/bizgenie-backend\/[a-z0-9_-]+\/[a-z0-9_-]+@sha256:[a-f0-9]{64}$/.test(r.image||''))fail();
 for(const k of ['identitySuitabilityEvidence','publicInvokerApproval','upstreamTagEvidence'])if(typeof r[k]!=='string'||!r[k].trim()||r[k].includes('UNRESOLVED'))fail();
 const e=r.environment||{};
 const keys=['BIZGENIE_ENVIRONMENT','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','BG_BRIDGE_STUDIO_ORIGIN','BG_BRIDGE_TARGET_URL','BG_BRIDGE_AUDIENCE','BG_BRIDGE_REVISION','BG_BRIDGE_SOURCE_SHA','BG_BRIDGE_REVIEW_REF','BG_BRIDGE_ALLOW_WRITES','BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION','BG_BRIDGE_ALLOW_SOCIAL_WRITES','BG_BRIDGE_BIND','PORT'];
 if(Object.keys(e).some(k=>!keys.includes(k))||keys.some(k=>typeof e[k]!=='string'||!e[k].trim()||e[k].includes('UNRESOLVED')))fail();
 if(e.SUPABASE_URL!=='https://zrczojyxebwjgpymbmgu.supabase.co'||!e.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')||e.BG_BRIDGE_STUDIO_ORIGIN!=='https://bizgenie-studio-staging.pages.dev'||e.PORT!=='8080'||e.BG_BRIDGE_BIND!=='0.0.0.0')fail();
 for(const k of ['BG_BRIDGE_ALLOW_WRITES','BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION','BG_BRIDGE_ALLOW_SOCIAL_WRITES'])if(e[k]!=='false')fail();
 validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN});
 return {status:'OFFLINE_VALIDATED_NOT_DEPLOYMENT_APPROVAL',sourceSha:r.sourceSha,service:r.service};
}
if(require.main===module){try{console.log(JSON.stringify(validateRelease(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}catch{console.error('BRIDGE_RELEASE_NOT_READY');process.exitCode=1;}}
module.exports={validateRelease};
