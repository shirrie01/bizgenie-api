'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const request=require('supertest');
const {PATH,SQL,TABLES,registerRuntimeDatabaseEvidence:register}=require('../src/staging/runtimeDatabaseEvidence');
const founder='11111111-1111-4111-8111-111111111111',campaign='33333333-3333-4333-8333-333333333333';
const now=Date.parse('2026-11-22T12:00:00Z');
function binding(){return {founderId:founder,tenantId:'synthetic-tenant',projectId:'synthetic-project',brandId:'synthetic-brand',campaignId:campaign,approvedRole:'synthetic-private-role',privateIamEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-125',approvalRef:'https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-123',bindingEvidenceRef:'https://github.com/shirrie01/bizgenie-api/issues/257#issuecomment-124',expiresAt:new Date(now+60000).toISOString(),preview:{platform:'linkedin',placement:'feed',format:'text'}};}
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
 const tokenVerifier=options.tokenVerifier||{async verifyAccessToken(t){verifications++;if(t!=='synthetic-founder'||options.badCustomer)throw Error(founder);return {kind:'customer',auth_user_id:options.foreign?campaign:founder,trusted_scope:options.scope||{tenant_id:b.tenantId,project_id:b.projectId,brand_id:b.brandId}};}};
 const app=express();const initial=JSON.stringify(env);
 const enabled=register(app,{env,pool,tokenVerifier,now:()=>clock});
 app.get('/existing',(_,res)=>res.json({ok:true}));app.use((_,res)=>res.status(404).end());
 return {app,env,enabled,b,calls,released,get connects(){return connects;},get verifications(){return verifications;},initial,expire(){clock+=60001;},get(method='get',path=PATH){return request(app)[method](path).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer synthetic-iam');}};
}
test('default OFF leaves diagnostic absent and unrelated routes/flags unchanged',async()=>{
 for(const flag of [undefined,'false']){const f=fixture({env:{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED:flag}});assert.equal(f.enabled,false);assert.equal((await f.get()).status,404);assert.equal((await request(f.app).get('/existing')).status,200);assert.equal(JSON.stringify(f.env),f.initial);assert.equal(f.connects,0);}
});
test('enablement requires exact staging, valid private bindings, approval references and short expiry',()=>{
 for(const env of [{BIZGENIE_ENVIRONMENT:'production'},{SUPABASE_URL:'https://production.test'},{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_ENABLED:'TRUE'},{BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING:'secret-invalid'}])assert.throws(()=>fixture({env}),/CONFIGURATION_INVALID/);
 for(const mutate of [b=>delete b.campaignId,b=>delete b.founderId,b=>b.founderId='bad',b=>b.campaignId='bad',b=>b.tenantId='',b=>b.extra='no',b=>b.approvalRef='UNRESOLVED',b=>b.bindingEvidenceRef='',b=>b.privateIamEvidenceRef='UNRESOLVED',b=>b.approvedIamSubject='legacy',b=>b.expiresAt=new Date(now-1).toISOString(),b=>b.expiresAt=new Date(now+3600000).toISOString(),b=>b.preview={platform:'*'}])assert.throws(()=>fixture({binding:mutate}),/CONFIGURATION_INVALID/);
});
test('Cloud Run IAM header is not reverified or used to establish identity',async()=>{const f=fixture();const r=await request(f.app).get(PATH).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer signature-removed-by-cloud-run');assert.equal(r.status,200);assert.equal(r.headers['cache-control'],'private, no-store');assert.equal(r.body.provenanceBasis,'source_wiring_not_dynamic_attestation');});
test('missing and invalid authentication, foreign founder, and mismatched trusted scopes never reach pool',async()=>{
 for(const option of [{badCustomer:true},{foreign:true},{scope:{}},{scope:{tenant_id:'foreign'}},{scope:{tenant_id:'synthetic-tenant',project_id:'foreign',brand_id:'synthetic-brand'}},{scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'foreign'}}]){const f=fixture(option);assert.ok([401,403,503].includes((await f.get()).status));assert.equal(f.connects,0);}
 const f=fixture();assert.ok([401,403,503].includes((await request(f.app).get(PATH)).status));assert.equal(f.connects,0);
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
 const serialized=JSON.stringify(r.body);for(const s of [founder,campaign,f.b.approvedRole,f.b.tenantId,'postgres://secret'])assert.ok(!serialized.includes(s));assert.equal(JSON.stringify(f.env),f.initial);
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
 register(app,{env:fixture().env,pool,now:()=>now,tokenVerifier:{verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'synthetic-brand'}})}});
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
 register(app,{env:f.env,now:()=>now,pool:{connect:async()=>{connects++;throw Error();}},tokenVerifier:{verifyAccessToken:()=>new Promise(resolve=>{unblock=()=>resolve({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'synthetic-brand'}});})}});
 const req=()=>request(app).get(PATH).set('Authorization','Bearer synthetic-founder').set('X-Serverless-Authorization','Bearer synthetic-iam');
 const first=req().then(r=>r);while(!unblock)await new Promise(resolve=>setImmediate(resolve));assert.equal((await req()).status,429);unblock();assert.equal((await first).status,503);assert.equal(connects,1);
});

test('real Supabase SDK signature verification and canonical token verifier reject invalid JWT contracts',async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');
 const {createClient}=require('@supabase/supabase-js');
 const {createSupabaseCustomerTokenVerifierFromEnv}=require('../src/authentication/tokenVerifier');
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),foreign=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk={...pair.publicKey.export({format:'jwk'}),kid:'synthetic-runtime-evidence-key',alg:'ES256',use:'sig'};
 const project='https://zrczojyxebwjgpymbmgu.supabase.co';let jwksReads=0;
 const tokenVerifier=createSupabaseCustomerTokenVerifierFromEnv({env:{SUPABASE_URL:project,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic'},createClientImpl:(url,key,options)=>createClient(url,key,{...options,global:{fetch:async(url)=>{assert.equal(String(url),project+'/auth/v1/.well-known/jwks.json');jwksReads++;return Response.json({keys:[jwk]});}}})});
 const base={iss:project+'/auth/v1',sub:founder,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+300,app_metadata:{tenant_id:'synthetic-tenant',project_id:'synthetic-project',brand_id:'synthetic-brand'}};
 const jwt=(claims,key=pair.privateKey)=>{const h=Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT',kid:jwk.kid})).toString('base64url'),p=Buffer.from(JSON.stringify(claims)).toString('base64url'),data=h+'.'+p;return data+'.'+sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');};
 const cases=[['valid',base,pair.privateKey,200],['signature',base,foreign.privateKey,401],['issuer',{...base,iss:'https://foreign.test/auth/v1'},pair.privateKey,401],['audience',{...base,aud:'foreign'},pair.privateKey,401],['expired',{...base,exp:Math.floor(Date.now()/1000)-60},pair.privateKey,401],['untrusted_metadata',{...base,app_metadata:{},user_metadata:base.app_metadata},pair.privateKey,401],['foreign_scope',{...base,app_metadata:{...base.app_metadata,tenant_id:'foreign'}},pair.privateKey,403],['foreign_founder',{...base,sub:campaign},pair.privateKey,403]];
 for(const [name,claims,key,status] of cases){const f=fixture({tokenVerifier});const token=jwt(claims,key);const r=await request(f.app).get(PATH).set('Authorization','Bearer '+token);assert.equal(r.status,status,name);assert.equal(f.connects,status===200?1:0,name);assert.ok(!JSON.stringify(r.body).includes(token));}
 assert.ok(jwksReads>=1);
});
test('CORS origins and preflight denied without browser access, IAM or database inference',async()=>{
 for(const origin of ['https://bizgenie-studio-staging.pages.dev','https://foreign.test','null'])for(const method of ['get','options']){const f=fixture();const r=await f.get(method).set('Origin',origin).set('Access-Control-Request-Method','GET');assert.equal(r.status,403);assert.equal(r.headers['access-control-allow-origin'],undefined);assert.equal(f.connects,0);}
});
test('Studio bridge cannot carry the private diagnostic under any existing founder gate',async()=>{
 const {createStudioBridge}=require('../src/studio-bridge/service');const {target}=require('./helpers/founder-bridge');let upstream=0;
 const app=createStudioBridge({target,tokenVerifier:{verifyAccessToken:async()=>{throw Error('not reached');},verifyIdentityAccessToken:async()=>{throw Error('not reached');}},iamTokenProvider:async()=>{throw Error('not reached');},fetchImpl:async()=>{upstream++;throw Error('not reached');}});
 for(const method of ['get','post','options'])assert.equal((await request(app)[method](PATH).set('Origin',target.origin)).status,404);
 assert.equal(upstream,0);
});

test('disposable PostgreSQL: migrated schema, read-only state, role evidence, timeout and released pool', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
 const {createDrainedPool}=require('./helpers/drained-pg-pool');
 const {PostgresCampaignRepository}=require('../src/campaigns');
 const url=new URL(process.env.TEST_DATABASE_URL);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only an explicitly disposable loopback PostgreSQL test instance is allowed');
 const admin=createDrainedPool({connectionString:url.toString(),max:1});let pool,db;
 try{
  const bootstrap=await admin.connect();try{await bootstrap.query('select pg_advisory_lock(734921)');await bootstrap.query("do $r$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $r$");}finally{await bootstrap.query('select pg_advisory_unlock(734921)');bootstrap.release();}
  db='runtime_evidence_'+randomUUID().replaceAll('-','');await admin.query(`create database "${db}"`);url.pathname='/'+db;pool=createDrainedPool({connectionString:url.toString(),max:1});
  await pool.query("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select null::uuid'");
  const directory=path.join(__dirname,'../supabase/migrations');for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.sql')).sort())await pool.query(fs.readFileSync(path.join(directory,file),'utf8'));
  const b=binding();await pool.query('insert into auth.users(id) values($1)',[founder]);await pool.query('insert into customer_profiles(auth_user_id) values($1)',[founder]);
  await pool.query('insert into tenants(tenant_id,name,created_by) values($1,$2,$3)',[b.tenantId,'Synthetic runtime evidence',founder]);
  await pool.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values($1,$2,'owner')",[b.tenantId,founder]);
  await pool.query('insert into projects(project_id,tenant_id,name) values($1,$2,$3)',[b.projectId,b.tenantId,'Synthetic runtime evidence']);
  await pool.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values($1,$2,'Synthetic',1,'approved',now(),now())",[b.brandId,b.projectId]);
  const repository=new PostgresCampaignRepository({pool});
  const root=await repository.executeCommand({actor:{kind:'customer',auth_user_id:founder},tenant_id:b.tenantId,project_id:b.projectId,membership_role:'owner',policy_version:'campaign-owner.v1'},{contract_version:'campaign-spine.v1',idempotency_key:'runtime-evidence.synthetic',expected_campaign_version:0,command_type:'create_campaign',tenant_id:b.tenantId,project_id:b.projectId,payload:{brand_id:b.brandId,name:'Synthetic runtime evidence',goal:'Local enquiries',display_timezone:'Europe/London'}});
  b.campaignId=root.campaign_id;b.approvedRole=(await pool.query('select current_user as role')).rows[0].role;b.preview={platform:'email',placement:'message',format:'text'};
  const snapshot=async()=> (await pool.query('select jsonb_agg(to_jsonb(c) order by campaign_id) as value from campaigns c')).rows[0].value;
  const before=await snapshot(),app=express();const tokenVerifier={verifyAccessToken:async()=>({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:b.tenantId,project_id:b.projectId,brand_id:b.brandId}})};
  const env={...fixture().env,BG_STAGING_RUNTIME_DATABASE_EVIDENCE_BINDING:JSON.stringify(b)};
  register(app,{env,pool,tokenVerifier,now:()=>now});
  const res=await request(app).get(PATH).set('Authorization','Bearer synthetic-founder');assert.equal(res.status,200);assert.equal(res.body.ownership,'MATCH');assert.equal(res.body.intendedPreview,'MATCH');assert.equal(res.body.role.classification,'APPROVED_ROLE');assert.ok(res.body.tables.every(r=>r.present&&r.rls_enabled&&r.can_select));assert.equal(pool.waitingCount,0);assert.equal(pool.idleCount,pool.totalCount);assert.deepEqual(await snapshot(),before);
  const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await assert.rejects(c.query("insert into campaigns select * from campaigns where false"),{code:'25006'});await c.query('ROLLBACK');await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='10ms'");await assert.rejects(c.query('select pg_sleep(1)'),{code:'57014'});await c.query('ROLLBACK');}finally{c.release();}
  // Force a real database timeout through the handler; it must roll back and return the sole pool client.
  const timedPool={connect:async()=>{const client=await pool.connect();return {query:q=>client.query(q.text===SQL.ownership?{...q,text:'select pg_sleep(2)',values:[]}:q),release:e=>client.release(e)};}};
  const timedApp=express();register(timedApp,{env,pool:timedPool,tokenVerifier,now:()=>now});assert.equal((await request(timedApp).get(PATH).set('Authorization','Bearer synthetic-founder')).status,503);assert.equal(pool.waitingCount,0);assert.equal(pool.idleCount,pool.totalCount);assert.deepEqual(await snapshot(),before);
 }finally{await pool?.end();try{if(db)await admin.query(`drop database "${db}"`);}finally{await admin.end();}}
});
