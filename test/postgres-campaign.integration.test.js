const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { after, before, describe, it } = require("node:test");
const { Pool } = require("pg");
const { PostgresCampaignRepository, CampaignIdempotencyError, CampaignResourceError } = require("../src/campaigns");

const ADMIN_DATABASE_URL = process.env.TEST_DATABASE_URL;
const postgresDescribe = ADMIN_DATABASE_URL ? describe : describe.skip;
const AUTH_A = "11111111-1111-4111-8111-111111111111";
const AUTH_B = "22222222-2222-4222-8222-222222222222";
const context = { actor:{kind:"customer",auth_user_id:AUTH_A},tenant_id:"tenant_a",project_id:"project_a",membership_role:"owner",policy_version:"campaign-owner.v1" };
const command=(type,version,payload,campaign_id,key=`${type}_${randomUUID()}`)=>({contract_version:"campaign-spine.v1",idempotency_key:key,expected_campaign_version:version,command_type:type,tenant_id:"tenant_a",project_id:"project_a",...(campaign_id?{campaign_id}:{}),payload});

postgresDescribe("PostgresCampaignRepository real PostgreSQL 17 proof", { concurrency:1 }, () => {
  let adminPool,pool,database,repository;
  const url=(name)=>{const value=new URL(ADMIN_DATABASE_URL);value.pathname=`/${name}`;return value.toString();};
  before(async()=>{
    adminPool=new Pool({connectionString:ADMIN_DATABASE_URL});
    await adminPool.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$`);
    database=`bizgenie_campaign_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`create database ${database}`);
    pool=new Pool({connectionString:url(database),max:12});
    await pool.query(`create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'`);
    const directory=path.join(__dirname,"..","supabase","migrations");
    for(const filename of fs.readdirSync(directory).filter((file)=>file.endsWith(".sql")).sort()) {
      try { await pool.query(fs.readFileSync(path.join(directory,filename),"utf8")); }
      catch(error){error.message=`${filename}: ${error.message}`;throw error;}
    }
    repository=new PostgresCampaignRepository({pool,resolvePreviewReceipt:async(_context,payload)=>({render_receipt_id:payload.render_receipt_id,variant_id:payload.variant_id,revision_id:payload.revision_id,revision_content_hash:"b".repeat(64),profile_id:"instagram.feed",profile_version:1,profile_hash:"c".repeat(64),platform:"instagram",placement:"feed",format:"text",renderer_version:"renderer.v1",render_input_hash:"d".repeat(64),preview_digest:"e".repeat(64),rendered_at:new Date().toISOString()})});
    await pool.query(`insert into auth.users(id) values($1),($2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.customer_profiles(auth_user_id) values($1),($2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.tenants(tenant_id,name,created_by) values('tenant_a','A',$1),('tenant_b','B',$2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner'),('tenant_a',$2,'member'),('tenant_b',$2,'owner')`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.projects(project_id,tenant_id,name) values('project_a','tenant_a','A'),('project_b','tenant_b','B')`);
    await pool.query(`insert into public.brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('brand_a','project_a','A',1,'approved',now(),now()),('brand_b','project_b','B',1,'approved',now(),now())`);
  });
  after(async()=>{await pool?.end();if(adminPool&&database){for(let i=0;i<20;i++){try{await adminPool.query(`drop database if exists ${database}`);break;}catch{await new Promise((resolve)=>setTimeout(resolve,25));}}}await adminPool?.end();});
  it("initializes only when all fourteen relations are RLS-locked from direct roles",async()=>{await repository.initialize();});

  it("persists and reconstructs a campaign/item/revision across repository instances",async()=>{
    const create=command("create_campaign",0,{brand_id:"brand_a",name:"Launch",goal:"Launch",display_timezone:"Europe/London"},undefined,"create_1");
    const first=await repository.executeCommand(context,create);
    const item=await repository.executeCommand(context,command("create_content_item",1,{name:"Post",format:"text",platform:"instagram",placement:"feed",destination_label:"BizGenie",initial_content:{title:null,body:"Make. Launch. Learn what converts.",caption:null,alt_text:null,asset_refs:[]}},first.campaign_id,"item_1"));
    const fresh=new PostgresCampaignRepository({pool});
    const restored=await fresh.getCampaign(context,first.campaign_id);
    assert.equal(restored.version,2);assert.equal(restored.items.size,1);assert.equal(restored.events.length,4);
    assert.equal(item.created_ids.variant_ids.length,1);
  });

  it("recovers exact lost acknowledgement and conflicts on changed intent",async()=>{
    let fail=true;
    const lossy=new PostgresCampaignRepository({pool,fault:async(point)=>{if(point==="postgres_after_commit"&&fail){fail=false;throw new Error("lost ack");}}});
    const create=command("create_campaign",0,{brand_id:"brand_a",name:"Launch",goal:"Launch",display_timezone:"Europe/London"},undefined,"lost_ack");
    await assert.rejects(()=>lossy.executeCommand(context,create));
    const recovered=await repository.executeCommand(context,create);
    assert.equal(recovered.campaign_version,1);
    await assert.rejects(()=>repository.executeCommand(context,{...create,payload:{...create.payload,name:"Changed"}}),CampaignIdempotencyError);
  });

  it("does not accept a forged member write context or expose another tenant",async()=>{
    await assert.rejects(()=>repository.executeCommand({...context,actor:{kind:"customer",auth_user_id:AUTH_B},membership_role:"owner"},command("create_campaign",0,{brand_id:"brand_a",name:"X",goal:"X",display_timezone:"UTC"})),CampaignResourceError);
    const created=await repository.executeCommand(context,command("create_campaign",0,{brand_id:"brand_a",name:"Launch",goal:"Launch",display_timezone:"UTC"}));
    await assert.rejects(()=>repository.getCampaign({...context,tenant_id:"tenant_b",project_id:"project_b",actor:{kind:"customer",auth_user_id:AUTH_B}},created.campaign_id),CampaignResourceError);
  });

  it("database guards reject immutable evidence mutation and unsafe projection writes",async()=>{
    const created=await repository.executeCommand(context,command("create_campaign",0,{brand_id:"brand_a",name:"Launch",goal:"Launch",display_timezone:"UTC"}));
    await assert.rejects(()=>pool.query(`update public.campaign_events set payload='{}'::jsonb where campaign_id=$1`,[created.campaign_id]),/campaign evidence is immutable/);
    await assert.rejects(()=>pool.query(`update public.campaigns set name='Bypass' where campaign_id=$1`,[created.campaign_id]),/controlled command transaction/);
  });
});
