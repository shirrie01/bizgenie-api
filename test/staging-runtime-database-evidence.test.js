'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const request=require('supertest');
const {PATH,SQL,TABLES,registerRuntimeDatabaseEvidence:register}=require('../src/staging/runtimeDatabaseEvidence');
const founder='11111111-1111-4111-8111-111111111111',campaign='33333333-3333-4333-8333-333333333333';
const now=Date.parse('2026-11-22T12:00:00Z');
function binding(){return {founderId:founder,tenantId:'synthetic-tenant',projectId:'synthetic-project',brandId:'synthetic-brand',campaignId:campaign,approvedRole:'synthetic-private-role',approvedIamSubject:'synthetic-operator',approvalRef:'https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-123',bindingEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-124',expiresAt:new Date(now+60000).toISOString(),preview:{platform:'linkedin',placement:'feed',format:'text'}};}
function fixture(options={}){
 const b=binding(); options.binding?.(b);
 const env={BIZGENIE_ENVIRONMENT:'staging',SUPABASE_URL:'https://zrczojyxebwjgpymbmgu.supabase.co',BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED:'true',BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING:JSON.stringify(b),BG_BRIDGE_ALLOW_WRITES:'false',...options.env};
 let clock=now,released=[],calls=[],connects=0,verifications=0;
 const client={async query(q){calls.push(q);if(options.fail?.(q))throw Error('private:'+founder+' postgres://secret');
  if(q.text===SQL.authority)return {rows:[{authorized:options.authorized!==false}]};
  if(q.text===SQL.ownership)return {rows:[{ownership:options.ownership||'MATCH'}]};
  if(q.text===SQL.role)return {rows:[{effective_role:options.foreignRole?'other':b.approvedRole,rolsuper:false,rolbypassrls:true,no_role_switch:true}]};
  if(q.text===SQL.tables)return {rows:TABLES.map(name=>({name,present:!(options.missing&&name==='campaign_preview_profiles'),real_table:true,rls_enabled:true,rls_forced:false,owner_privileges:true,schema_usage:true,can_select:true,can_insert:name==='campaign_preview_profiles'?null:true,can_update:name==='campaign_preview_profiles'?null:true,rls_effective:false,extra:founder})).map(row=>row.present?row:Object.fromEntries(Object.keys(row).map(k=>[k,k==='name'?row.name:k==='present'?false:null])))};
  if(q.text===SQL.preview)return {rows:[{active:options.active!==false}]};
  return {rows:[]};},release(error){released.push(error);}};
 const pool={connect:async()=>{connects++;return client;}};
 const tokenVerifier={async verifyAccessToken(t){verifications++;if(t!=='synthetic-founder'||options.badCustomer)throw Error(founder);return {kind:'customer',auth_user_id:options.foreign?campaign:founder,trusted_scope:options.scope||{tenant_id:b.tenantId,project_id:b.projectId,brand_id:b.brandId}};}};
 const iamVerifier=options.noIam?null:{async verifyAccessToken(t){if(t!=='synthetic-iam'||options.badIam)throw Error('private');return {kind:options.fakeKind?'unverified':'google_iam',subject:options.foreignIam?'foreign':b.approvedIamSubject};}};
 const app=express();const initial=JSON.stringify(env);
 const enabled=register(app,{env,pool,tokenVerifier,iamVerifier,now:()=>clock});
 app.get('/existing',(_,res)=>res.json({ok:true}));app.use((_,res)=>res.status(404).end());
 return {app,env,enabled,b,calls,released,get connects(){return connects;},get verifications(){return verifications;},initial,expire(){clock+=60001;},get(method='get',path=PATH){return request(app)[method](path).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer synthetic-iam');}};
}
test('default OFF leaves diagnostic absent and unrelated routes/flags unchanged',async()=>{
 for(const flag of [undefined,'false']){const f=fixture({env:{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED:flag}});assert.equal(f.enabled,false);assert.equal((await f.get()).status,404);assert.equal((await request(f.app).get('/existing')).status,200);assert.equal(JSON.stringify(f.env),f.initial);assert.equal(f.connects,0);}
});
test('enablement requires exact staging, valid private bindings, approval references and short expiry',()=>{
 for(const env of [{BIZGENIE_ENVIRONMENT:'production'},{SUPABASE_URL:'https://production.test'},{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED:'TRUE'},{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING:'secret-invalid'}])assert.throws(()=>fixture({env}),/CONFIGURATION_INVALID/);
 for(const mutate of [b=>delete b.campaignId,b=>b.founderId='bad',b=>b.campaignId='bad',b=>b.tenantId='',b=>b.extra='no',b=>b.approvalRef='UNRESOLVED',b=>b.bindingEvidenceRef='',b=>b.expiresAt=new Date(now-1).toISOString(),b=>b.expiresAt=new Date(now+3600000).toISOString(),b=>b.preview={platform:'*'}])assert.throws(()=>fixture({binding:mutate}),/CONFIGURATION_INVALID/);
});
test('no established IAM proof fails closed before customer verification or pool use',async()=>{
 const f=fixture({noIam:true});const r=await f.get();assert.equal(r.status,503);assert.equal(f.connects,0);assert.equal(f.verifications,0);assert.equal(r.headers['cache-control'],'private, no-store');
});
test('missing and invalid authentication, foreign IAM or founder, and mismatched trusted scopes never reach pool',async()=>{
 for(const option of [{badIam:true},{badCustomer:true},{foreignIam:true},{fakeKind:true},{foreign:true},{scope:{}},{scope:{tenant_id:'foreign'}},{scope:{tenant_id:'synthetic-tenant',project_id:'foreign',brand_id:'synthetic-brand'}},{scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'foreign'}}]){const f=fixture(option);assert.ok([403,503].includes((await f.get()).status));assert.equal(f.connects,0);}
 const f=fixture();assert.ok([403,503].includes((await request(f.app).get(PATH)).status));assert.equal(f.connects,0);
});
test('expiry and unexpected methods/queries/paths/body rejected before authentication/database',async()=>{
 const f=fixture();f.expire();assert.equal((await f.get()).status,403);assert.equal(f.connects,0);
 for(const [method,path] of [['post',PATH],['put',PATH],['head',PATH],['options',PATH],['get',PATH+'?scope=foreign'],['get',PATH+'/extra'],['get',PATH+'/']]){const f=fixture();assert.equal((await f.get(method,path)).status,400);assert.equal(f.connects,0);}
 const b=fixture();assert.equal((await b.get().set('Content-Type','application/json').send({sql:'SELECT secret'})).status,400);assert.equal(b.connects,0);
});
test('successful evidence uses injected client, fixed parameterized reads and rollback; output redacted',async()=>{
 const f=fixture();const r=await f.get();assert.equal(r.status,200);assert.equal(r.body.ownership,'MATCH');assert.equal(r.body.intendedPreview,'MATCH');assert.equal(r.body.role.classification,'APPROVED_ROLE');assert.equal(r.body.catalogOnly,true);
 assert.equal(f.connects,1);assert.deepEqual(f.released,[undefined]);assert.match(f.calls[0].text,/BEGIN.*READ ONLY/);assert.equal(f.calls.at(-1).text,'ROLLBACK');
 assert.deepEqual(f.calls.find(q=>q.text===SQL.ownership).values,[campaign,f.b.tenantId,f.b.projectId,f.b.brandId]);
 assert.deepEqual(f.calls.find(q=>q.text===SQL.preview).values,['linkedin','feed','text']);
 for(const q of f.calls){assert.equal(q.query_timeout,1500);assert.ok(Object.values(SQL).includes(q.text)||q.text==='ROLLBACK'||q.text.startsWith('BEGIN ')||q.text.startsWith('SET LOCAL '));}
 const serialized=JSON.stringify(r.body);for(const s of [founder,campaign,f.b.approvedRole,f.b.tenantId,f.b.approvedIamSubject,'postgres://secret'])assert.ok(!serialized.includes(s));assert.equal(JSON.stringify(f.env),f.initial);
});
test('revoked owner or mismatched membership denies inside read-only transaction and releases client',async()=>{
 const f=fixture({authorized:false});assert.equal((await f.get()).status,403);assert.equal(f.calls.at(-1).text,'ROLLBACK');assert.equal(f.calls.some(q=>q.text===SQL.ownership),false);assert.deepEqual(f.released,[false]);
});
test('D2 mismatch/missing and unapproved role remain honest; no profile tuple inferred',async()=>{
 for(const ownership of ['MISMATCH','NOT VERIFIED']){const f=fixture({ownership,foreignRole:true,binding:b=>b.preview=null});const r=await f.get();assert.equal(r.status,200);assert.equal(r.body.ownership,ownership);assert.equal(r.body.role.classification,'UNAPPROVED_ROLE');assert.equal(r.body.intendedPreview,'NOT VERIFIED');assert.equal(f.calls.some(q=>q.text===SQL.preview),false);}
 const f=fixture({active:false});assert.equal((await f.get()).body.intendedPreview,'NOT VERIFIED');
});
test('missing relation preserves null boolean evidence and skips missing registry lookup',async()=>{
 const f=fixture({missing:true});const r=await f.get();assert.equal(r.status,200);assert.equal(r.body.tables.find(t=>t.name==='campaign_preview_profiles').present,false);assert.equal(r.body.intendedPreview,'NOT VERIFIED');assert.equal(r.body.tables.find(t=>t.name==='campaign_preview_profiles').can_select,null);assert.equal(f.calls.some(q=>q.text===SQL.preview),false);
 assert.match(SQL.tables,/CASE WHEN c\.oid IS NOT NULL THEN has_table_privilege/);assert.match(SQL.tables,/CASE WHEN c\.relkind IN/);
});
test('query timeout/failure always rolls back/releases; raw errors never escape',async()=>{
 for(const stage of ['BEGIN',SQL.authority,SQL.ownership,SQL.role,SQL.tables,SQL.preview]){const f=fixture({fail:q=>q.text===stage||q.text.startsWith(stage)});const r=await f.get();assert.equal(r.status,503);assert.deepEqual(r.body,{error:{code:'DIAGNOSTIC_UNAVAILABLE'}});assert.equal(f.calls.at(-1).text,'ROLLBACK');assert.equal(f.released.length,1);}
 const f=fixture({fail:q=>q.text==='ROLLBACK'});assert.equal((await f.get()).status,503);assert.deepEqual(f.released,[true]);
});
test('bounded acquisition releases a late client without executing SQL',async()=>{
 const app=express();let released=false,queried=false;
 const pool={connect:()=>new Promise(resolve=>setTimeout(()=>resolve({release:()=>released=true,query:()=>queried=true}),1550))};
 register(app,{env:fixture().env,pool,now:()=>now,iamVerifier:{verifyAccessToken:async()=>({kind:'google_iam',subject:'synthetic-operator'})},tokenVerifier:{verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'synthetic-brand'}})}});
 const r=await request(app).get(PATH).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer synthetic-iam');assert.equal(r.status,503);await new Promise(r=>setTimeout(r,90));assert.equal(released,true);assert.equal(queried,false);
});
test('per-process attempt bound refuses further acquisitions',async()=>{
 const f=fixture();for(let i=0;i<3;i++)assert.equal((await f.get()).status,200);assert.equal((await f.get()).status,429);assert.equal(f.connects,3);
});
test('production wiring passes only existing pool, no IAM header inference or bridge changes',()=>{
 const source=require('fs').readFileSync(require.resolve('../index'),'utf8');assert.match(source,/runtimeDatabaseEvidencePool: brandBrainRepository.pool/);assert.match(source,/pool: runtimeDatabaseEvidencePool/);
 const diagnostic=require('fs').readFileSync(require.resolve('../src/staging/runtimeDatabaseEvidence'),'utf8');assert.doesNotMatch(diagnostic,/new Pool|console\.|logger\./);
});

test('concurrent authenticated request is rejected while the first owns the diagnostic slot',async()=>{
 const f=fixture();let unblock;const app=express();let connects=0;
 register(app,{env:f.env,now:()=>now,pool:{connect:async()=>{connects++;throw Error();}},iamVerifier:{verifyAccessToken:()=>new Promise(resolve=>{unblock=()=>resolve({kind:'google_iam',subject:'synthetic-operator'});})},tokenVerifier:{verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'synthetic-brand'}})}});
 const req=()=>request(app).get(PATH).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer synthetic-iam');
 const first=req().then(r=>r);while(!unblock)await new Promise(resolve=>setImmediate(resolve));assert.equal((await req()).status,429);unblock();assert.equal((await first).status,503);assert.equal(connects,1);
});
