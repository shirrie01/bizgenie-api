const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateFounderRelease04:validate}=require('../scripts/staging/validate-founder-release04');
const {validateFounderDraftRelease:prior}=require('../scripts/staging/validate-founder-draft-release');
function candidate(){
 const b=structuredClone(require('../scripts/staging/bridge-founder-draft-release.example.json'));
 for(const k of Object.keys(b))if(k.endsWith('Evidence')||k.endsWith('Approval'))b[k]='synthetic_verified_'+k;
 Object.assign(b,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:'+'b'.repeat(64)});
 const founder='11111111-1111-4111-8111-111111111111',campaign='33333333-3333-4333-8333-333333333333';
 Object.assign(b.environment,{SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:'https://tag---bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_AUDIENCE:'https://bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_SOURCE_SHA:'c'.repeat(40),BG_BRIDGE_REVIEW_REF:'synthetic_review',BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:'true',BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT:'true',BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID:'t',BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID:'p',BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID:'b',BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256:'d'.repeat(64),BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:'true',BG_BRIDGE_FOUNDER_DRAFT_TENANT_ID:'t',BG_BRIDGE_FOUNDER_DRAFT_PROJECT_ID:'p',BG_BRIDGE_FOUNDER_DRAFT_BRAND_ID:'b',BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID:campaign,BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING:'true',BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS:'true'});
 b.founderDraftCampaignBinding={auth_user_id:founder,tenant_id:'t',project_id:'p',brand_id:'b',campaign_id:campaign};
 b.founderDraftRollback.acceptedR2={revision:'bizgenie-studio-bridge-staging-r2-synthetic',image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:5f4519afba18377726460273d668cad1b3f961222a357cf16c1fe9e5b33e8c9c'};
 return {profile:'draft_connections',baseProfile:b,approvalRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-123',routeEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-124',rollbackEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-125'};
}
test('new offline profile accepts pinned draft/copy/social lifecycle without mutating or weakening prior validator',()=>{
 const r=candidate(),before=structuredClone(r);assert.equal(validate(r).status,'OFFLINE_FOUNDER_RELEASE04_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.deepEqual(r,before);assert.throws(()=>prior(r.baseProfile));
});
test('new profile requires actual prior pins and rejects broad gates, missing authority, unknown fields or inactive admission',()=>{
 for(const edit of [r=>r.approvalRef='UNKNOWN',r=>delete r.routeEvidenceRef,r=>r.extra=true,r=>r.profile='general',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_WRITES='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_SOCIAL_WRITES='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_STRIPE_CHECKOUT='true',r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_DRAFT_BRAND_ID='foreign',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING=1,r=>{delete r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING;delete r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS;},r=>r.baseProfile.image='latest']){
  const r=candidate();edit(r);assert.throws(()=>validate(r));
 }
});
function videoCandidate(){
 const {apiEnv,bridgeEnv,estimate,now}=require('./helpers/founder-video-runtime');const {target}=require('./helpers/founder-bridge');
 const b=structuredClone(require('../scripts/staging/bridge-founder-onboarding-release.example.json'));
 Object.assign(b,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/bridge@sha256:'+'b'.repeat(64),apiSourceSha:target.sourceSha,apiImage:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/api@sha256:'+'c'.repeat(64),identitySuitabilityEvidence:'synthetic.iam',publicInvokerApproval:'synthetic.invoker',upstreamTagEvidence:'synthetic.tag',founderOnboardingApproval:'synthetic.onboarding',founderIdentityBindingEvidence:'synthetic.binding',upstreamDatabasePoolEvidence:'synthetic.pool',upstreamAuthProvisionerEvidence:'synthetic.provisioner',founderVideoApproval:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-123',runtimeCompositionEvidence:'synthetic.runtime',migrationAcceptanceEvidence:'synthetic.schema',pricingAuthorityEvidence:'synthetic.pricing',entitlementEvidence:'synthetic.entitlement',rollbackEvidence:'synthetic.rollback',legalApprovalEvidence:'synthetic.legal',operator:'synthetic.operator',apiEnvironment:apiEnv(),validatedAt:now.toISOString(),costPolicy:{version:'policy.v1',currency:'GBP',cap_minor:10000,customer_limit:10,acceptance_cap_minor:500,max_status_observations:10,submit:estimate(300,'second','submit.v1'),status:estimate(20,'request','status.v1')}});
 Object.assign(b.environment,bridgeEnv(),{BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT:'true',BG_BRIDGE_FOUNDER_VIDEO_APPROVAL_REF:b.founderVideoApproval});b.apiEnvironment.FOUNDER_VIDEO_APPROVAL_REF=b.founderVideoApproval;
 return {r:{profile:'video',baseProfile:b,approvalRef:b.founderVideoApproval,routeEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-124',rollbackEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-125'},now};
}
test('video attachment profile preserves exact founder match and unchanged one-job GBP500p guard',()=>{
 const {r,now}=videoCandidate();assert.equal(validate(r,{now}).status,'OFFLINE_FOUNDER_RELEASE04_VALIDATED_NOT_DEPLOYMENT_APPROVAL');
 for(const edit of [v=>v.baseProfile.costPolicy.status.upper_bound_minor=51,v=>v.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING='true',v=>v.approvalRef='https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-999',v=>v.baseProfile.apiEnvironment.FOUNDER_VIDEO_CAMPAIGN_ID='foreign']){const bad=structuredClone(r);edit(bad);assert.throws(()=>validate(bad,{now}));}
});
