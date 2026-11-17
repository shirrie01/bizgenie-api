const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateFounderRecommendationsRelease:validate}=require('../scripts/staging/validate-founder-recommendations-release');
const {validateFounderOnboardingRelease:legacy}=require('../scripts/staging/validate-founder-onboarding-release');
const uuid='11111111-1111-4111-8111-111111111111';
function candidate(){
 const r=structuredClone(require('../scripts/staging/bridge-founder-recommendations-release.example.json'));
 Object.assign(r,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/bridge@sha256:'+'b'.repeat(64),identitySuitabilityEvidence:'synthetic_iam',publicInvokerApproval:'synthetic_public',upstreamTagEvidence:'synthetic_tag',founderOnboardingApproval:'synthetic_r1',founderIdentityBindingEvidence:'synthetic_binding',upstreamDatabasePoolEvidence:'synthetic_pool',upstreamAuthProvisionerEvidence:'synthetic_admin_acceptance_only',founderRecommendationsApproval:'synthetic_separate_step7',bridgeImageProvenanceEvidence:'synthetic_new_build_source_and_digest',rollbackEvidence:'synthetic_00002_dgz_flag_off'});
 Object.assign(r.environment,{SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:'https://tag---bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_AUDIENCE:'https://bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_SOURCE_SHA:'c'.repeat(40),BG_BRIDGE_REVIEW_REF:'synthetic_review',BG_BRIDGE_FOUNDER_AUTH_USER_ID:uuid,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS:'true'});
 return r;
}
function old(r){const c=structuredClone(r);delete c.environment.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS;for(const k of ['founderRecommendationsApproval','bridgeImageProvenanceEvidence','rollbackEvidence'])delete c[k];return c;}
test('new profile admits only separately evidenced founder recommendations without mutating inputs or old validator',()=>{
 const r=candidate(),before=structuredClone(r);assert.equal(validate(r).status,'OFFLINE_FOUNDER_RECOMMENDATIONS_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.deepEqual(r,before);assert.throws(()=>legacy(r));assert.equal(legacy(old(r)).status,'OFFLINE_FOUNDER_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL');
 for(const flag of [undefined,'false']){const x=candidate();x.environment.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS=flag;assert.deepEqual(validate(x),legacy(old(x)));}
});
test('missing/placeholder approval, provenance and rollback evidence cannot activate permission',()=>{
 for(const key of ['founderRecommendationsApproval','bridgeImageProvenanceEvidence','rollbackEvidence'])for(const v of [undefined,null,false,'','UNRESOLVED','PENDING','UNKNOWN']){const r=candidate();r[key]=v;assert.throws(()=>validate(r),/FOUNDER_RECOMMENDATIONS_RELEASE_NOT_READY/);}
 assert.throws(()=>validate(require('../scripts/staging/bridge-founder-recommendations-release.example.json')));
});
test('all prior identity, environment, scope, pin and gate rejections remain enforced',()=>{
 for(const flag of [true,false,'TRUE',' true','1','',null]){const r=candidate();r.environment.BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS=flag;assert.throws(()=>validate(r));}
 for(const key of ['BG_BRIDGE_ALLOW_WRITES','BG_BRIDGE_ALLOW_DRAFT_WORKFLOW','BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP','BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION','BG_BRIDGE_ALLOW_SOCIAL_WRITES','BG_BRIDGE_ALLOW_STRIPE_CHECKOUT']){const r=candidate();r.environment[key]='true';assert.throws(()=>validate(r));}
 for(const [key,value] of [['BG_BRIDGE_FOUNDER_AUTH_USER_ID','bad'],['BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING','false'],['BIZGENIE_ENVIRONMENT','production'],['SUPABASE_URL','https://uvgblmejpbswkvlqvqmz.supabase.co'],['BG_BRIDGE_STUDIO_ORIGIN','*'],['BG_BRIDGE_TARGET_URL','https://foreign.test'],['BG_BRIDGE_REVISION','bizgenie-apii-00126-vaw'],['BG_BRIDGE_SOURCE_SHA','main'],['BG_BRIDGE_REVIEW_REF','UNRESOLVED'],['SUPABASE_SERVICE_ROLE_KEY','synthetic'],['BG_BRIDGE_ALLOWED_ROUTES','POST /customer/*']]){const r=candidate();r.environment[key]=value;assert.throws(()=>validate(r));}
 for(const [key,value] of [['project','production'],['service','bizgenie-apii'],['image','mutable:latest'],['routes',['POST /customer/*']],['founderIdentityBindingEvidence','UNRESOLVED'],['upstreamDatabasePoolEvidence','UNRESOLVED']]){const r=candidate();r[key]=value;assert.throws(()=>validate(r));}
});
test('CLI emits safe status/source/service or generic failure, never UUID or key',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recommendation-profile-'));
 try{for(const valid of [true,false]){const r=candidate();if(!valid)r.bridgeImageProvenanceEvidence='UNRESOLVED';const p=path.join(dir,'synthetic.json');fs.writeFileSync(p,JSON.stringify(r));const out=spawnSync(process.execPath,[path.join(__dirname,'../scripts/staging/validate-founder-recommendations-release.js'),p],{encoding:'utf8'});assert.equal(out.status,valid?0:1);assert.ok(!(out.stdout+out.stderr).includes(uuid));assert.ok(!(out.stdout+out.stderr).includes(r.environment.SUPABASE_PUBLISHABLE_KEY));if(valid)assert.deepEqual(Object.keys(JSON.parse(out.stdout)).sort(),['service','sourceSha','status']);else assert.equal(out.stderr.trim(),'FOUNDER_RECOMMENDATIONS_RELEASE_NOT_READY');}}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
