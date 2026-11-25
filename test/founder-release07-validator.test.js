const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateFounderRelease07:validate}=require('../scripts/staging/validate-founder-release07');
const founder='11111111-1111-4111-8111-111111111111';
const ref=n=>'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-'+n;
const fairway={tenant_id:'tenant_fairway',project_id:'project_fairway',brand_id:'brand_fairway',campaign_id:'66666666-6666-4666-8666-666666666666'};
const fonzo={tenant_id:'tenant_fairway',project_id:'project_fonzo',brand_id:'brand_fonzo'};
const campaign='33333333-3333-4333-8333-333333333333';
function common(b){Object.assign(b.environment,{SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:'https://tag---bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_AUDIENCE:'https://bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_SOURCE_SHA:'c'.repeat(40),BG_BRIDGE_REVIEW_REF:'synthetic_review',BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder});}
function workspace(){
 const b=structuredClone(require('../scripts/staging/bridge-founder-onboarding-release.example.json'));
 Object.assign(b,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:'+'b'.repeat(64),identitySuitabilityEvidence:'synthetic.iam',publicInvokerApproval:'synthetic.invoker',upstreamTagEvidence:'synthetic.tag'});common(b);
 Object.assign(b.environment,{BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE:'true',BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID:fairway.tenant_id,BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME:'Fonzo'});
 return {profile:'workspace',baseProfile:b,approvalRef:ref(1),independentScopeEvidenceRef:ref(2),rollbackEvidenceRef:ref(3),protectedScope:{...fairway}};
}
function a2(){
 const b=structuredClone(require('../scripts/staging/bridge-founder-draft-release.example.json'));
 for(const k of Object.keys(b))if(k.endsWith('Evidence')||k.endsWith('Approval'))b[k]='synthetic_verified_'+k;
 Object.assign(b,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:'+'b'.repeat(64)});common(b);
 const body='d'.repeat(64);
 Object.assign(b.environment,{BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:'true',BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT:'true',BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID:fonzo.tenant_id,BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID:fonzo.project_id,BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID:fonzo.brand_id,BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256:body,BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:'true',BG_BRIDGE_FOUNDER_DRAFT_TENANT_ID:fonzo.tenant_id,BG_BRIDGE_FOUNDER_DRAFT_PROJECT_ID:fonzo.project_id,BG_BRIDGE_FOUNDER_DRAFT_BRAND_ID:fonzo.brand_id,BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID:campaign,BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING:'true',BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS:'true',BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE:'true',BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID:fonzo.tenant_id,BG_BRIDGE_FOUNDER_INTAKE_PROJECT_ID:fonzo.project_id,BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID:fonzo.brand_id});
 b.founderDraftCampaignBinding={auth_user_id:founder,...fonzo,campaign_id:campaign};
 b.founderDraftRollback.acceptedR2={revision:'bizgenie-studio-bridge-staging-r2-synthetic',image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:5f4519afba18377726460273d668cad1b3f961222a357cf16c1fe9e5b33e8c9c'};
 return {profile:'fonzo_a2',baseProfile:b,approvalRef:ref(11),independentScopeEvidenceRef:ref(12),rollbackEvidenceRef:ref(13),protectedScope:{...fairway},a1:{campaignRoot:{...fonzo,body_sha256:body}}};
}
test('workspace profile validates offline, never mutates its input, and says it is not deployment approval',()=>{
 const r=workspace(),before=structuredClone(r);assert.equal(validate(r).status,'OFFLINE_FOUNDER_WORKSPACE07_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.deepEqual(r,before);
});
test('workspace profile rejects missing or reused evidence, other permissions, wrong tenant and unknown fields',()=>{
 const edits=[r=>delete r.independentScopeEvidenceRef,r=>r.independentScopeEvidenceRef=r.approvalRef,r=>r.rollbackEvidenceRef='UNKNOWN',r=>r.approvalRef='https://example.invalid/x#issuecomment-1',r=>r.extra=true,r=>r.profile='general',r=>delete r.protectedScope,r=>r.protectedScope.campaign_id='not-a-uuid',
  r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE='false',r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID='tenant_other',r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME=' Fonzo',r=>delete r.baseProfile.environment.BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME,
  r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_WRITES='true',r=>r.baseProfile.image='latest',r=>delete r.baseProfile.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID];
 for(const edit of edits){const r=workspace();edit(r);assert.throws(()=>validate(r),/FOUNDER_RELEASE07_NOT_READY/);}
});
test('A2 profile validates only when A1 deployed exactly the root pins that A2 carries and the Fonzo scope is separate from Fairway',()=>{
 const r=a2(),before=structuredClone(r);assert.equal(validate(r).status,'OFFLINE_FOUNDER_FONZO_A2_07_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.deepEqual(r,before);
});
test('A2 handoff fails closed on any pin drift, reuse of the protected Fairway scope or campaign, and on missing or reused evidence',()=>{
 const edits=[r=>r.a1.campaignRoot.body_sha256='e'.repeat(64),r=>r.a1.campaignRoot.brand_id='brand_other',r=>r.a1.campaignRoot.project_id='project_other',r=>r.a1.campaignRoot.tenant_id='tenant_other',r=>delete r.a1,r=>r.a1.extra=1,
  r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID=r.protectedScope.campaign_id,r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID='not-a-uuid',
  r=>{r.protectedScope.project_id=r.a1.campaignRoot.project_id;},r=>{r.protectedScope.brand_id=r.a1.campaignRoot.brand_id;},
  r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_INTAKE_PROJECT_ID='project_fairway',r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID='brand_fairway',r=>r.baseProfile.environment.BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID='tenant_other',r=>delete r.baseProfile.environment.BG_BRIDGE_FOUNDER_INTAKE_BRAND_ID,
  r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE='false',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_WRITES='true',r=>r.baseProfile.environment.BG_BRIDGE_ALLOW_SOCIAL_WRITES='true',
  r=>r.independentScopeEvidenceRef=r.approvalRef,r=>r.rollbackEvidenceRef='UNKNOWN',r=>delete r.protectedScope,r=>r.extra=true];
 for(const [i,edit] of edits.entries()){const r=a2();edit(r);assert.throws(()=>validate(r),/FOUNDER_RELEASE07_NOT_READY/,'edit '+i);}
});
