const {test}=require('node:test'),assert=require('node:assert/strict');
const {apiEnv,bridgeEnv,estimate,binding,now}=require('./helpers/founder-video-runtime');
const {target}=require('./helpers/founder-bridge');
function releaseCandidate(){
 const r=structuredClone(require('../scripts/staging/bridge-founder-onboarding-release.example.json'));
 Object.assign(r,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/bridge@sha256:'+'b'.repeat(64),apiSourceSha:target.sourceSha,apiImage:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/api@sha256:'+'c'.repeat(64),identitySuitabilityEvidence:'synthetic.iam',publicInvokerApproval:'synthetic.invoker',upstreamTagEvidence:'synthetic.tag',founderOnboardingApproval:'synthetic.onboarding',founderIdentityBindingEvidence:'synthetic.binding',upstreamDatabasePoolEvidence:'synthetic.pool',upstreamAuthProvisionerEvidence:'synthetic.provisioner',founderVideoApproval:'issue.191.synthetic',runtimeCompositionEvidence:'synthetic.runtime',migrationAcceptanceEvidence:'synthetic.schema',pricingAuthorityEvidence:'synthetic.pricing',entitlementEvidence:'synthetic.entitlement',rollbackEvidence:'synthetic.rollback',legalApprovalEvidence:'synthetic.legal',operator:'synthetic.operator',apiEnvironment:apiEnv(),validatedAt:now.toISOString(),costPolicy:{version:'policy.v1',currency:'GBP',cap_minor:10000,customer_limit:10,acceptance_cap_minor:500,max_status_observations:4,submit:estimate(300,'second','submit.v1'),status:estimate(50,'request','status.v1')}});
 Object.assign(r.environment,bridgeEnv(),{BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true'});return r;
}
test('new offline release profile validates exact founder API/bridge binding without mutating or replacing existing profiles',()=>{
 const {validateFounderVideoRelease}=require('../scripts/staging/validate-founder-video-release');const r=releaseCandidate(),copy=structuredClone(r);
 assert.equal(validateFounderVideoRelease(r,{now}).status,'OFFLINE_FOUNDER_VIDEO_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.deepEqual(r,copy);
 const {validateFounderOnboardingRelease}=require('../scripts/staging/validate-founder-onboarding-release');assert.throws(()=>validateFounderOnboardingRelease(r));
 for(const edit of [v=>v.environment.BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION='true',v=>v.environment.BG_BRIDGE_ALLOW_WRITES='true',v=>v.environment.BG_BRIDGE_FOUNDER_VIDEO_CAMPAIGN_ID=binding.variant_id,v=>v.apiEnvironment.FOUNDER_VIDEO_TENANT_ID='foreign',v=>v.apiEnvironment.STRIPE_BILLING_ENABLED='true',v=>v.apiEnvironment.PROVIDER_SPEND_DATABASE_URL='postgres://synthetic',v=>v.costPolicy.status.upper_bound_minor=51,v=>v.costPolicy.submit.authority.pricing_unit='unknown',v=>v.costPolicy.submit.authority.fx=undefined,v=>v.validatedAt='2020-01-01',v=>v.apiSourceSha='d'.repeat(40),v=>v.apiImage='latest',v=>v.operator='UNKNOWN',v=>delete v.runtimeCompositionEvidence,v=>v.founderVideoApproval='another.approval',v=>v.environment.BG_BRIDGE_REVIEW_REF='UNRESOLVED']){
  const bad=structuredClone(r);edit(bad);assert.throws(()=>validateFounderVideoRelease(bad,{now}));
 }
});
