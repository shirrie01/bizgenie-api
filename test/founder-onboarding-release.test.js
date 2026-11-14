const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {validateRelease}=require('../scripts/staging/validate-bridge-release');
const {validateFounderOnboardingRelease:validate}=require('../scripts/staging/validate-founder-onboarding-release');
const {validateWorkspaceWriteRelease}=require('../scripts/staging/validate-workspace-write-release');
const {validateBridgeTarget}=require('../src/studio-bridge/service');
const uuid='11111111-1111-4111-8111-111111111111';
function candidate(){
 const r=structuredClone(require('../scripts/staging/bridge-release.example.json'));
 Object.assign(r,{sourceSha:'a'.repeat(40),image:'europe-west1-docker.pkg.dev/bizgenie-backend/synthetic/bridge@sha256:'+'b'.repeat(64),identitySuitabilityEvidence:'synthetic_iam',publicInvokerApproval:'synthetic_public_approval',upstreamTagEvidence:'synthetic_tag'});
 Object.assign(r.environment,{SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:'https://tag---bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_AUDIENCE:'https://bizgenie-api-staging-synthetic-ew.a.run.app',BG_BRIDGE_SOURCE_SHA:'c'.repeat(40),BG_BRIDGE_REVIEW_REF:'synthetic_review'});
 return r;
}
function enabled(){const r=candidate();Object.assign(r,{founderOnboardingApproval:'synthetic_permission_approval',founderIdentityBindingEvidence:'synthetic_private_identity_binding',upstreamDatabasePoolEvidence:'synthetic_pool',upstreamAuthProvisionerEvidence:'synthetic_provisioner'});Object.assign(r.environment,{BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_FOUNDER_AUTH_USER_ID:uuid});return r;}
function bridge(r){const e=r.environment;return validateBridgeTarget({environment:e.BIZGENIE_ENVIRONMENT,upstream:e.BG_BRIDGE_TARGET_URL,audience:e.BG_BRIDGE_AUDIENCE,revision:e.BG_BRIDGE_REVISION,sourceSha:e.BG_BRIDGE_SOURCE_SHA,reviewRef:e.BG_BRIDGE_REVIEW_REF,origin:e.BG_BRIDGE_STUDIO_ORIGIN,allowFounderOnboarding:e.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING==='true',founderAuthUserId:e.BG_BRIDGE_FOUNDER_AUTH_USER_ID,...Object.fromEntries([['allowWrites','WRITES'],['allowWorkspaceBootstrap','WORKSPACE_BOOTSTRAP'],['allowDraftWorkflow','DRAFT_WORKFLOW'],['allowGenerationConfirmation','GENERATION_CONFIRMATION'],['allowSocialWrites','SOCIAL_WRITES'],['allowStripeCheckout','STRIPE_CHECKOUT']].map(([k,v])=>[k,e['BG_BRIDGE_ALLOW_'+v]==='true']))});}
test('legacy absent/OFF profiles and rollback stay read-only without weakening original validators',()=>{
 const r=candidate();assert.deepEqual(validate(r),validateRelease(r));
 r.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING='false';assert.deepEqual(validate(r),validateRelease(r));
 r.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID=uuid;assert.deepEqual(validate(r),validateRelease(r));assert.equal(bridge(r).allowFounderOnboarding,false);
 const on=enabled();assert.throws(()=>validateRelease(on));assert.throws(()=>validateWorkspaceWriteRelease(on));
 on.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING='false';assert.equal(validate(on).status,'OFFLINE_VALIDATED_NOT_DEPLOYMENT_APPROVAL');assert.equal(bridge(on).allowFounderOnboarding,false);
});
test('founder-only profile validates offline with explicit identity/evidence and no manifest mutation',()=>{
 const r=enabled(),before=structuredClone(r);assert.deepEqual(validate(r),{status:'OFFLINE_FOUNDER_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL',sourceSha:r.sourceSha,service:r.service});assert.deepEqual(r,before);assert.equal(bridge(r).allowFounderOnboarding,true);
 for(const field of ['founderOnboardingApproval','founderIdentityBindingEvidence','upstreamDatabasePoolEvidence','upstreamAuthProvisionerEvidence'])for(const value of [undefined,'','UNRESOLVED',false]){const bad=enabled();bad[field]=value;assert.throws(()=>validate(bad),/FOUNDER_ONBOARDING_RELEASE_NOT_READY/);}
 assert.throws(()=>validate(require('../scripts/staging/bridge-founder-onboarding-release.example.json')));
});
test('malformed flags/UUIDs and non-staging environments fail closed, agreeing with runtime configuration',()=>{
 for(const value of [undefined,'',' bad ',uuid+'\n',uuid.toUpperCase().replace('11111111','ABCDEFAB'),null,123,'owner@example.test']){const r=enabled();r.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID=value;assert.throws(()=>validate(r));assert.throws(()=>bridge(r));}
 for(const value of ['',true,false,'TRUE',' true','0',null]){const r=enabled();r.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING=value;assert.throws(()=>validate(r));}
 for(const value of ['production','preview','unknown','',undefined]){const r=enabled();r.environment.BIZGENIE_ENVIRONMENT=value;assert.throws(()=>validate(r));assert.throws(()=>bridge(r));}
 for(const flag of [undefined,'false']){const r=candidate();r.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING=flag;r.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID='malformed';assert.throws(()=>validate(r));assert.throws(()=>validateRelease(r));}
});
test('every other write/paid/social gate conflicts; old workspace profile cannot enable founder mode',()=>{
 for(const flag of ['WORKSPACE_BOOTSTRAP','WRITES','DRAFT_WORKFLOW','GENERATION_CONFIRMATION','SOCIAL_WRITES','STRIPE_CHECKOUT']){const r=enabled();r.environment['BG_BRIDGE_ALLOW_'+flag]='true';assert.throws(()=>validate(r));assert.throws(()=>bridge(r));}
 const old=candidate();Object.assign(old,{workspaceBootstrapApproval:'synthetic',upstreamDatabasePoolEvidence:'synthetic',upstreamAuthProvisionerEvidence:'synthetic'});old.environment.BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP='true';assert.equal(validateWorkspaceWriteRelease(old).status,'OFFLINE_WORKSPACE_ONLY_VALIDATED_NOT_DEPLOYMENT_APPROVAL');old.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING='true';old.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID=uuid;assert.throws(()=>validateWorkspaceWriteRelease(old));
});
test('custom route/method scope, unknown environment keys and unsafe deployment pins are rejected',()=>{
 for(const flag of [undefined,'false','true'])for(const key of ['routes','allowedRoutes','methods','permissions','founderRoutes']){const r=enabled();r.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING=flag;r[key]=['POST /customer/*'];assert.throws(()=>validate(r));}
 for(const key of ['BG_BRIDGE_ALLOWED_ROUTES','BG_BRIDGE_FOUNDER_ROUTES','SUPABASE_SERVICE_ROLE_KEY','UNKNOWN_FLAG']){const r=enabled();r.environment[key]='synthetic';assert.throws(()=>validate(r));}
 for(const [key,value]of [['project','production'],['region','us-central1'],['service','bizgenie-apii'],['serviceAccount','other@example.test'],['image','mutable:latest'],['sourceSha','main'],['identitySuitabilityEvidence','UNRESOLVED'],['publicInvokerApproval','UNRESOLVED'],['upstreamTagEvidence','UNRESOLVED']]){const r=enabled();r[key]=value;assert.throws(()=>validate(r));}
 for(const [key,value]of [['SUPABASE_URL','https://uvgblmejpbswkvlqvqmz.supabase.co'],['BG_BRIDGE_STUDIO_ORIGIN','*'],['BG_BRIDGE_TARGET_URL','https://foreign.test'],['BG_BRIDGE_AUDIENCE','https://foreign.test'],['BG_BRIDGE_REVISION','bizgenie-apii-00126-vaw'],['BG_BRIDGE_SOURCE_SHA','main'],['BG_BRIDGE_REVIEW_REF','UNRESOLVED'],['PORT','80'],['BG_BRIDGE_BIND','127.0.0.1']]){const r=enabled();r.environment[key]=value;assert.throws(()=>validate(r));}
});
test('CLI reports only safe status/source/service or generic failure, never configured identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-release-'));
 try{for(const active of [true,false])for(const valid of [true,false]){
  const r=enabled();r.environment.BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING=active?'true':'false';if(!valid)r.environment.BG_BRIDGE_FOUNDER_AUTH_USER_ID=uuid+'\n';
  const file=path.join(dir,'synthetic.json');fs.writeFileSync(file,JSON.stringify(r));const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/staging/validate-founder-onboarding-release.js'),file],{encoding:'utf8'});
  assert.equal(result.status,valid?0:1);assert.ok(!result.stdout.includes(uuid));assert.ok(!result.stderr.includes(uuid));if(valid){assert.deepEqual(Object.keys(JSON.parse(result.stdout)).sort(),['service','sourceSha','status']);assert.equal(result.stderr,'');}else{assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'FOUNDER_ONBOARDING_RELEASE_NOT_READY');}
 }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
