'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {validateFounderDraftRelease:validate}=require('../scripts/staging/validate-founder-draft-release');
const {validateFounderCampaignRelease:prior}=require('../scripts/staging/validate-founder-campaign-release');
const {validateBridgeTarget}=require('../src/studio-bridge/service');
const uuid='11111111-1111-4111-8111-111111111111',campaign='33333333-3333-4333-8333-333333333333';
const names=['founderDraftWorkflowApproval','founderDraftCampaignBindingEvidence','draftWorkflowDatabasePoolEvidence','founderDraftRollbackEvidence'];
const pins=['TENANT_ID','PROJECT_ID','BRAND_ID','CAMPAIGN_ID'];
function candidate(){
 const r=structuredClone(require('../scripts/staging/bridge-founder-draft-release.example.json'));
 for(const k of Object.keys(r))if(k.endsWith('Evidence')||k.endsWith('Approval'))r[k]='synthetic_verified_'+k;
 Object.assign(r,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:'+'b'.repeat(64)});
 Object.assign(r.environment,{SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:'https://tag---bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_AUDIENCE:'https://bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_SOURCE_SHA:'c'.repeat(40),BG_BRIDGE_REVIEW_REF:'synthetic_review',BG_BRIDGE_FOUNDER_AUTH_USER_ID:uuid,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:'true',BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT:'true',BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID:'t',BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID:'p',BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID:'b',BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256:'d'.repeat(64),BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW:'true',BG_BRIDGE_FOUNDER_DRAFT_TENANT_ID:'t',BG_BRIDGE_FOUNDER_DRAFT_PROJECT_ID:'p',BG_BRIDGE_FOUNDER_DRAFT_BRAND_ID:'b',BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID:campaign});
 r.founderDraftCampaignBinding={auth_user_id:uuid,tenant_id:'t',project_id:'p',brand_id:'b',campaign_id:campaign};
 r.founderDraftRollback.acceptedR2={revision:'bizgenie-studio-bridge-staging-r2-synthetic',image:'europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:5f4519afba18377726460273d668cad1b3f961222a357cf16c1fe9e5b33e8c9c'};
 return r;
}
function legacy(r){const c=structuredClone(r);for(const k of [...names,'founderDraftCampaignBinding','founderDraftRollback'])delete c[k];delete c.environment.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW;for(const k of pins)delete c.environment['BG_BRIDGE_FOUNDER_DRAFT_'+k];return c;}
function runtime(r){const e=r.environment;return validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,allowFounderOnboarding:true,allowFounderRecommendations:true,allowFounderCampaignRoot:true,allowFounderDraftWorkflow:true,founderCampaign:{tenant_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID,project_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID,brand_id:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID,body_sha256:e.BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256},founderDraftScope:Object.fromEntries(pins.map(k=>[k.toLowerCase(),e['BG_BRIDGE_FOUNDER_DRAFT_'+k]]))});}
test('dedicated enabled profile preserves all founder permissions and immutable input; prior validator unchanged',()=>{
 const r=candidate(),before=structuredClone(r);assert.deepEqual(validate(r),{status:'OFFLINE_FOUNDER_DRAFT_VALIDATED_NOT_DEPLOYMENT_APPROVAL',sourceSha:r.sourceSha,service:r.service});assert.deepEqual(r,before);assert.equal(runtime(r).allowFounderDraftWorkflow,true);assert.throws(()=>prior(r));assert.equal(prior(legacy(r)).status,'OFFLINE_FOUNDER_CAMPAIGN_VALIDATED_NOT_DEPLOYMENT_APPROVAL');
 for(const flag of [undefined,'false']){const x=legacy(r);x.environment.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW=flag;assert.deepEqual(validate(x),prior(legacy(x)));}
 assert.throws(()=>validate(require('../scripts/staging/bridge-founder-draft-release.example.json')));
});
test('all private pins and independent binding record must match valid founder and accepted R2 scope',()=>{
 for(const k of pins)for(const value of [undefined,null,'','bad scope',' x']){const r=candidate();r.environment['BG_BRIDGE_FOUNDER_DRAFT_'+k]=value;assert.throws(()=>validate(r));}
 for(const key of ['auth_user_id','tenant_id','project_id','brand_id','campaign_id']){const r=candidate();r.founderDraftCampaignBinding[key]='foreign';assert.throws(()=>validate(r));}
 for(const key of ['tenant_id','project_id','brand_id']){const r=candidate();r.founderDraftCampaignBinding[key]='foreign';r.environment['BG_BRIDGE_FOUNDER_DRAFT_'+key.toUpperCase()]='foreign';assert.throws(()=>validate(r),'draft and record matching each other cannot override R2 root scope');}
 for(const value of ['bad',undefined,uuid+'\n']){const r=candidate();r.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID=value;assert.throws(()=>validate(r));}
 const extra=candidate();extra.founderDraftCampaignBinding.extra='no';assert.throws(()=>validate(extra));
 const off=candidate();off.environment.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW='false';assert.throws(()=>validate(off),'stale binding while OFF must not pass');
});
test('default-OFF malformed flags, broad gates, missing founder capabilities and approvals are denied',()=>{
 for(const value of [true,false,null,'TRUE',' true','1','']){const r=candidate();r.environment.BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW=value;assert.throws(()=>validate(r));}
 for(const k of ['WRITES','DRAFT_WORKFLOW','WORKSPACE_BOOTSTRAP','GENERATION_CONFIRMATION','SOCIAL_WRITES','STRIPE_CHECKOUT']){const r=candidate();r.environment['BG_BRIDGE_ALLOW_'+k]='true';assert.throws(()=>validate(r));}
 for(const k of ['ONBOARDING','RECOMMENDATIONS','CAMPAIGN_ROOT']){const r=candidate();r.environment['BG_BRIDGE_ALLOW_FOUNDER_'+k]='false';assert.throws(()=>validate(r));}
 for(const k of names)for(const value of [undefined,false,{},'','UNRESOLVED','pending approval','UNKNOWN']){const r=candidate();r[k]=value;assert.throws(()=>validate(r));}
});
test('production/mutable/unknown route and credential configuration remains rejected by delegated validators',()=>{
 for(const [k,v] of [['project','production'],['region','us-central1'],['service','bizgenie-apii'],['image','mutable:latest'],['sourceSha','main'],['identitySuitabilityEvidence','UNRESOLVED'],['routes',['POST /customer/*']]]){const r=candidate();r[k]=v;assert.throws(()=>validate(r));}
 for(const [k,v] of [['BIZGENIE_ENVIRONMENT','production'],['SUPABASE_URL','https://uvgblmejpbswkvlqvqmz.supabase.co'],['BG_BRIDGE_TARGET_URL','https://foreign.test'],['BG_BRIDGE_STUDIO_ORIGIN','*'],['BG_BRIDGE_SOURCE_SHA','main'],['BG_BRIDGE_REVIEW_REF','UNRESOLVED'],['BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256','bad'],['BG_BRIDGE_ALLOWED_ROUTES','*'],['SUPABASE_SERVICE_ROLE_KEY','synthetic'],['BG_FOUNDER_VIDEO_ACCEPTANCE_ENABLED','true']]){const r=candidate();r.environment[k]=v;assert.throws(()=>validate(r));}
});
test('both rollback targets are mandatory, immutable, distinct and preserve locked Step7 pair',()=>{
 for(const f of [r=>delete r.founderDraftRollback,r=>delete r.founderDraftRollback.acceptedR2,r=>delete r.founderDraftRollback.step7,r=>r.founderDraftRollback.extra={},r=>r.founderDraftRollback.acceptedR2.image='mutable:latest',r=>r.founderDraftRollback.acceptedR2.image=[r.founderDraftRollback.acceptedR2.image],r=>r.founderDraftRollback.acceptedR2.image=r.image,r=>r.founderDraftRollback.acceptedR2.image=r.founderDraftRollback.step7.image,r=>r.founderDraftRollback.acceptedR2.revision='bizgenie-apii-00126-vaw',r=>r.founderDraftRollback.acceptedR2.revision=r.founderDraftRollback.step7.revision,r=>r.founderDraftRollback.step7.image=r.founderDraftRollback.acceptedR2.image,r=>r.founderDraftRollback.step7.revision='bizgenie-studio-bridge-staging-00001-9lm']){const r=candidate();f(r);assert.throws(()=>validate(r));}
});
test('CLI outputs safe status/source/service or generic failure without any private binding fields',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-draft-profile-'));
 try{for(const valid of [true,false]){const r=candidate();if(!valid)r.environment.BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID='bad';const file=path.join(dir,'synthetic.json');fs.writeFileSync(file,JSON.stringify(r));const out=spawnSync(process.execPath,[path.join(__dirname,'../scripts/staging/validate-founder-draft-release.js'),file],{encoding:'utf8'});assert.equal(out.status,valid?0:1);for(const value of [uuid,campaign,r.environment.SUPABASE_PUBLISHABLE_KEY])assert.ok(!(out.stdout+out.stderr).includes(value));if(valid){assert.deepEqual(Object.keys(JSON.parse(out.stdout)).sort(),['service','sourceSha','status']);assert.equal(out.stderr,'');}else{assert.equal(out.stdout,'');assert.equal(out.stderr.trim(),'FOUNDER_DRAFT_RELEASE_NOT_READY');}}}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
