// Explicitly local-only rehearsal: two new synthetic databases, never an existing app database.
if(process.env.BIZGENIE_DISPOSABLE_RESTORE_PROOF!=='1')throw new Error('Set BIZGENIE_DISPOSABLE_RESTORE_PROOF=1 only for the documented local Docker PostgreSQL fixture');
const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {spawnSync}=require('node:child_process');const {Pool}=require('pg');
const root=require('node:path').resolve(__dirname,'..');const url='postgresql://postgres@127.0.0.1:5433/postgres';const container='bizgenie-dev-postgres17';
const suffix=randomUUID().replaceAll('-','');const source='local_restore_source_'+suffix,target='local_restore_target_'+suffix;
function docker(args,input){const r=spawnSync('docker',['exec','-i',container,...args],{input,maxBuffer:64*1024*1024,timeout:30000});if(r.status!==0)throw new Error(String(r.stderr));return r.stdout;}
(async()=>{const admin=new Pool({connectionString:url});let a,b;try{
 await admin.query(`create database ${source}`);await admin.query(`create database ${target}`);
 const sourceUrl=new URL(url),targetUrl=new URL(url);sourceUrl.pathname='/'+source;targetUrl.pathname='/'+target;a=new Pool({connectionString:sourceUrl.toString()});b=new Pool({connectionString:targetUrl.toString()});
 await a.query("create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'");
 for(const f of fs.readdirSync(root+'/supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await a.query(fs.readFileSync(root+'/supabase/migrations/'+f,'utf8'));
 const id='11111111-1111-4111-8111-111111111111';await a.query('insert into auth.users values($1)',[id]);await a.query('insert into customer_profiles(auth_user_id) values($1)',[id]);await a.query("insert into tenants(tenant_id,name,created_by) values('synthetic','Synthetic',$1)",[id]);await a.query("insert into tenant_memberships(tenant_id,auth_user_id,role) values('synthetic',$1,'owner')",[id]);await a.query("insert into projects(project_id,tenant_id,name) values('synthetic','synthetic','Synthetic')");await a.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('synthetic','synthetic','Synthetic',1,'approved',now(),now())");
 await a.query(`insert into workspace_onboarding_profiles(tenant_id,project_id,brand_id,profile_version,status,sector_key,sector_source,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash) values('synthetic','synthetic','synthetic',1,'in_progress','professional_services','customer',now(),now(),$1,'synthetic-retry',$2)`,[id,'a'.repeat(64)]);
 const version=docker(['pg_dump','--version']).toString().trim();const dump=docker(['pg_dump','-U','postgres','-Fc','-d',source]);
 docker(['pg_restore','-U','postgres','--exit-on-error','--no-owner','-d',target],dump);
 const before=(await a.query('select * from workspace_onboarding_profiles')).rows,after=(await b.query('select * from workspace_onboarding_profiles')).rows;
 require('node:assert/strict').deepEqual(after,before);
 const {preflight}=require(root+'/src/workspace-onboarding/preflight');const schema=await preflight(b);
 require('node:assert/strict').equal(schema.professional,true);
 console.log(JSON.stringify({result:'PASS',tool:version,scope:'two new disposable databases only',rows_preserved:after.length,sector:after[0].sector_key,preflight:schema,dump_bytes:dump.length,shared_or_managed_restore:false},null,2));
}finally{await a?.end();await b?.end();await admin.query(`drop database if exists ${source}`);await admin.query(`drop database if exists ${target}`);await admin.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
