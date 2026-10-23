const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { after, before, describe, it } = require("node:test");
const { Pool } = require("pg");
const { PostgresCampaignRepository, CampaignIdempotencyError, CampaignResourceError } = require("../src/campaigns");
const {regressionCases,scenario,previewReceipt,context:regressionContext,content:regressionContent,NOW}=require('./helpers/campaign-regressions');

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
    const roleBootstrapClient=await adminPool.connect();
    try {
      await roleBootstrapClient.query("select pg_advisory_lock(734921)");
      await roleBootstrapClient.query("do $role_bootstrap$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $role_bootstrap$");
    } finally {
      try { await roleBootstrapClient.query("select pg_advisory_unlock(734921)"); }
      finally { roleBootstrapClient.release(); }
    }
    database=`bizgenie_campaign_${process.pid}_${Date.now()}`.toLowerCase();
    await adminPool.query(`create database ${database}`);
    pool=new Pool({connectionString:url(database),max:12});
    await pool.query(`create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable set search_path='' as 'select null::uuid'`);
    const directory=path.join(__dirname,"..","supabase","migrations");
    for(const filename of fs.readdirSync(directory).filter((file)=>file.endsWith(".sql")).sort()) {
      try { await pool.query(fs.readFileSync(path.join(directory,filename),"utf8")); }
      catch(error){error.message=`${filename}: ${error.message}`;throw error;}
    }
    repository=new PostgresCampaignRepository({pool,now:()=>new Date(NOW),resolvePreviewReceipt:previewReceipt,validatePreview:async()=>true});
    await pool.query(`insert into auth.users(id) values($1),($2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.customer_profiles(auth_user_id) values($1),($2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.tenants(tenant_id,name,created_by) values('tenant_a','A',$1),('tenant_b','B',$2)`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.tenant_memberships(tenant_id,auth_user_id,role) values('tenant_a',$1,'owner'),('tenant_a',$2,'member'),('tenant_b',$2,'owner')`,[AUTH_A,AUTH_B]);
    await pool.query(`insert into public.projects(project_id,tenant_id,name) values('project_a','tenant_a','A'),('project_b','tenant_b','B')`);
    await pool.query(`insert into public.brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values('brand_a','project_a','A',1,'approved',now(),now()),('brand_b','project_b','B',1,'approved',now(),now())`);
  });
  after(async()=>{await pool?.end();if(adminPool&&database){for(let i=0;i<20;i++){try{await adminPool.query(`drop database if exists ${database}`);break;}catch{await new Promise((resolve)=>setTimeout(resolve,25));}}}await adminPool?.end();});
  it("initializes only when all fourteen relations are RLS-locked from direct roles",async()=>{await repository.initialize();});
  regressionCases(()=>repository);
  it('reruns the unapplied I-B migration with existing disposable campaign evidence intact',async()=>{
    const s=await scenario(repository);await s.add();const before=await s.get();
    const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260903090000_create_campaign_spine_persistence.sql'),'utf8');
    await pool.query(sql);await repository.initialize();assert.deepEqual(await s.get(),before);
  });
  it('startup rejects unsafe TRUNCATE and private-function grants',async()=>{
    try{await pool.query('grant truncate on public.campaigns to authenticated');await assert.rejects(()=>repository.initialize());}
    finally{await pool.query('revoke truncate on public.campaigns from authenticated');}
    try{await pool.query('grant execute on function campaign_private.validate_preview_binding() to authenticated');await assert.rejects(()=>repository.initialize());}
    finally{await pool.query('revoke execute on function campaign_private.validate_preview_binding() from authenticated');}
    await repository.initialize();
  });
  it('immutable guards reject ordinary writes and nested content is checked by PostgreSQL',async()=>{
    const s=await scenario(repository),t=await s.add();
    for(const table of ['campaign_brand_snapshots','campaign_revisions','campaign_preview_evidence','campaign_approval_events','campaign_schedule_entries','campaign_manual_attempts','campaign_attempt_resolutions','campaign_publications','campaign_publication_corrections','campaign_events','campaign_command_receipts'])await assert.rejects(()=>pool.query(`delete from public.${table} where false`),/immutable/);
    await assert.rejects(()=>pool.query(`insert into public.campaign_revisions select (jsonb_populate_record(null::public.campaign_revisions,to_jsonb(r)||jsonb_build_object('revision_id',$2::text,'content','{"unknown":true}'::jsonb))).* from public.campaign_revisions r where revision_id=$1`,[t.revision_id,randomUUID()]),/invalid campaign revision content/);
    const client=await pool.connect();try{await client.query('begin');await client.query('set local role authenticated');await assert.rejects(()=>client.query('select * from public.campaigns'),/permission denied/);}finally{await client.query('rollback');client.release();}
  });
  it('rejects identity, format, counter and lifecycle changes even with the command marker',async()=>{
    const s=await scenario(repository),t=await s.add(),c=await s.get(),item=[...c.items.values()][0];
    for(const [sql,params] of [
      ['update public.campaign_content_items set format=$1 where content_item_id=$2',['image',item.content_item_id]],
      ['update public.campaigns set name=$1 where campaign_id=$2',['Unrecorded',s.id]],
      ['update public.campaigns set version=version+1 where campaign_id=$1',[s.id]],
      ['update public.campaign_platform_variants set workflow=$1 where variant_id=$2',['review',t.variant_id]],
    ]){const client=await pool.connect();try{await client.query('begin');await client.query("select set_config('bizgenie.campaign_command',txid_current()::text,true)");await assert.rejects(async()=>{await client.query(sql,params);await client.query('set constraints all immediate');});}finally{await client.query('rollback');client.release();}}
    assert.deepEqual(await s.get(),c);assert.equal((await repository.verifyCampaignProjection(context,s.id)).valid,true);
  });
  it('returns one consistent snapshot when a concurrent writer adds a child',async()=>{
    const s=await scenario(repository);await s.add();let ready,release;
    const atRoot=new Promise(resolve=>{ready=resolve;}),continueRead=new Promise(resolve=>{release=resolve;});
    const prior=repository.fault;let intercepted=false;
    repository.fault=async name=>{if(name==='postgres_after_root_read'&&!intercepted){intercepted=true;ready();await continueRead;}};
    try{const reading=s.get();await atRoot;await s.add();release();const snapshot=await reading;assert.equal(snapshot.version,2);assert.equal(snapshot.items.size,1);assert.equal((await s.get()).items.size,2);}finally{release();repository.fault=prior;}
  });
  it('reconstructs a corrected calendar date after a fresh repository instance',async()=>{
    const prior=repository.now;try{
      const s=await scenario(repository),a=await s.approve(await s.add());await s.publish(a);
      repository.now=()=>new Date('2026-09-04T12:00:00Z');
      await s.cmd('correct_publication',{variant_id:a.variant_id,publication_id:(await s.variant(a)).publication_id,published_at:'2026-09-04T10:00:00Z',publication_url:'https://example.test/post',external_reference:null,note:null,reason:'Correct date'});
      const fresh=new PostgresCampaignRepository({pool});const rows=await fresh.listCalendarEntries(context,{from:'2026-09-04T00:00:00Z',to:'2026-09-05T00:00:00Z'});assert.equal(rows.find(r=>r.campaign_id===s.id).occurrence_at,'2026-09-04T10:00:00.000Z');assert.equal((await fresh.verifyCampaignProjection(context,s.id)).valid,true);
    }finally{repository.now=prior;}
  });
  it("persists sector and planning channels in existing Brand Brain JSON across repository recreation", async () => {
    const { PostgresBrandBrainRepository } = require("../src/brand-brain");
    const first = new PostgresBrandBrainRepository({ pool });
    const original = await first.getByProjectAndBrand("project_a", "brand_a");
    const value = { ...original, identity: { ...original.identity, sector: "Vehicle leasing" },
      commercial: { ...original.commercial, preferred_channels: ["instagram", "website"] },
      metadata: { ...original.metadata, version: original.metadata.version + 1 } };
    await first.upsert(value);
    const read = await new PostgresBrandBrainRepository({ pool }).getByProjectAndBrand("project_a", "brand_a");
    assert.equal(read.identity.sector, "Vehicle leasing"); assert.deepEqual(read.commercial.preferred_channels, ["instagram", "website"]);
    assert.equal(read.metadata.status, original.metadata.status);
  });

  it("onboarding proposal is absent by default, then persists private CAS drafts in the disposable fixture only", async () => {
    const { PostgresCustomerWorkspaceRepository, CustomerOnboardingConflictError, CustomerWorkspacePersistenceError, CustomerWorkspaceService } = require("../src/customer-workspace");
    const { PostgresBrandBrainRepository } = require("../src/brand-brain");
    const first = new PostgresCustomerWorkspaceRepository({ pool });
    await assert.rejects(() => first.getOnboardingDraft(AUTH_A), CustomerWorkspacePersistenceError);
    assert.ok((await first.listWorkspacesForAuthUserId(AUTH_A)).length);
    await pool.query(fs.readFileSync(path.join(__dirname, "../docs/studio/migrations/BG-STUDIO-010-onboarding-drafts.proposed.sql"), "utf8"));
    const newUser = randomUUID();
    await pool.query("insert into auth.users(id) values($1)", [newUser]);
    await first.saveOnboardingDraft({ auth_user_id: newUser, expected_version: 0, draft: { workspace: null, step: "identity", answers: { business_name: "" } } });
    assert.equal((await new PostgresCustomerWorkspaceRepository({ pool }).getOnboardingDraft(newUser)).version, 1);
    assert.equal((await pool.query("select 1 from public.customer_profiles where auth_user_id=$1", [newUser])).rowCount, 0);
    const draft = { workspace: null, step: "channels", answers: { sector_choice: "Leasing", preferred_channels: ["website"], goal: "More enquiries" } };
    const results = await Promise.allSettled([first.saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 0, draft }),
      new PostgresCustomerWorkspaceRepository({ pool }).saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 0, draft })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.ok(results.find(r => r.status === "rejected").reason instanceof CustomerOnboardingConflictError);
    const recreated = new PostgresCustomerWorkspaceRepository({ pool });
    assert.deepEqual((await recreated.getOnboardingDraft(AUTH_A)).draft, draft);
    assert.equal(await recreated.getOnboardingDraft(AUTH_B), null);
    const changed = { ...draft, answers: { goal: "Changed goal" } };
    assert.equal((await recreated.saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 1, draft: changed })).version, 2);
    await assert.rejects(() => recreated.saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 1, draft }), CustomerOnboardingConflictError);
    const bound = { ...draft, workspace: { tenant_id: "tenant_a", project_id: "project_a", brand_id: "brand_a" } };
    await recreated.saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 2, draft: bound });
    const service = new CustomerWorkspaceService({ repository: recreated, brandBrainRepository: new PostgresBrandBrainRepository({ pool }) });
    await pool.query("update public.tenant_memberships set role='member' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]);
    try {
      await assert.rejects(() => service.getOnboardingDraft({ actor: context.actor }));
      await assert.rejects(() => recreated.saveOnboardingDraft({ auth_user_id: AUTH_A, expected_version: 3, draft: bound }));
      assert.equal((await recreated.getOnboardingDraft(AUTH_A)).version, 3);
    } finally { await pool.query("update public.tenant_memberships set role='owner' where tenant_id='tenant_a' and auth_user_id=$1", [AUTH_A]); }
    const table = await pool.query("select relrowsecurity from pg_class where oid='public.customer_onboarding_drafts'::regclass");
    assert.equal(table.rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const client = await pool.connect();
      try { await client.query("begin"); await client.query(`set local role ${role}`);
        await assert.rejects(() => client.query("select * from public.customer_onboarding_drafts"), /permission denied/);
      } finally { await client.query("rollback"); client.release(); }
    }
  });

  it('validates generated media tenant/project/brand/kind and preserves truthful resolution after revocation',async()=>{
    async function asset({tenant='tenant_a',project='project_a',brand='brand_a',status='active',kind='image',source='generated'}={}){
      const id=randomUUID(),job='job_'+randomUUID();
      await pool.query(`insert into public.generation_jobs(job_id,tenant_id,project_id,brand_id,execution_class,auth_user_id,request_correlation_id,idempotency_key,allowed_scopes) values($1,$2,$3,$4,$5,$6,$1,$1,'["generation:execute"]')`,[job,tenant,project,brand,kind+'.normal',tenant==='tenant_b'?AUTH_B:AUTH_A]);
      await pool.query(`insert into public.media_assets(asset_id,tenant_id,project_id,generation_job_id,generation_id,source_kind,media_kind,storage_bucket,storage_key,mime_type,status,allowed_uses) values($1,$2,$3,$4,$4,$5,$6,'test-assets',$7,$8,$9,$10)`,[id,tenant,project,job,source,kind,`assets/${'a'.repeat(64)}/${'b'.repeat(64)}/${kind}/${id}.${kind==='image'?'png':'mp4'}`,kind==='image'?'image/png':'video/mp4',status,['campaign.preview','campaign.publish']]);return id;
    }
    const s=await scenario(repository);
    for(const id of [await asset({tenant:'tenant_b',project:'project_b',brand:'brand_b'}),await asset({brand:null}),await asset({status:'revoked'}),await asset({kind:'video'}),await asset({source:'reference'})])await s.unchanged(()=>s.add('image',{...regressionContent,asset_refs:[{asset_id:id,role:'primary'}]}));
    const id=await asset(),t=await s.add('image',{...regressionContent,asset_refs:[{asset_id:id,role:'primary'}]}),a=await s.approve(t),attempt=await s.begin(a);
    const revision=(await s.variant(t)).revisions.get(t.revision_id);assert.equal(revision.generation_links[0].asset_id,id);assert.equal(revision.generation_links[0].generation_brand_snapshot_id,null);
    await pool.query("update public.media_assets set status='revoked' where asset_id=$1",[id]);
    await s.cmd('confirm_manual_publication',{...attempt,published_at:NOW,attested_published:true});assert.equal((await s.variant(t)).workflow,'published');
  });

  it("recovers only the exact committed generation receipt across repository instances", async () => {
    const create = await repository.executeCommand(context, command("create_campaign", 0,
      {brand_id:"brand_a",name:"Receipt Recovery",goal:"Launch",display_timezone:"Europe/London"},
      undefined, "recovery_create_" + randomUUID()));
    const item = await repository.executeCommand(context, command("create_content_item", 1,
      {name:"Post",format:"text",platform:"instagram",placement:"feed",destination_label:"BizGenie",
       initial_content:{title:null,body:"Initial draft.",caption:null,alt_text:null,asset_refs:[]}},
      create.campaign_id, "recovery_item_" + randomUUID()));
    const variantId = item.created_ids.variant_ids[0];
    const key = "generation_recovery_" + randomUUID();
    const saved = await repository.executeCommand(context, command("save_revision", 2,
      {variant_id:variantId,content:{title:null,body:"Committed generation.",caption:null,alt_text:null,asset_refs:[]},
       change_reason:"Generated draft for founder review"}, create.campaign_id, key));
    const fresh = new PostgresCampaignRepository({pool});
    const query = {campaignId:create.campaign_id,variantId,idempotencyKey:key,expectedCampaignVersion:2};
    assert.deepEqual(await fresh.findCommittedGenerationReceipt(context,query),saved);
    assert.equal(await fresh.findCommittedGenerationReceipt(context,{...query,idempotencyKey:"wrong"}),null);
    assert.equal(await fresh.findCommittedGenerationReceipt(context,{...query,expectedCampaignVersion:1}),null);
    assert.equal(await fresh.findCommittedGenerationReceipt(context,{...query,campaignId:randomUUID()}),null);
    assert.equal(await fresh.findCommittedGenerationReceipt(context,{...query,variantId:randomUUID()}),null);
    await assert.rejects(fresh.findCommittedGenerationReceipt({...context,actor:{kind:"customer",auth_user_id:AUTH_B}},query),CampaignResourceError);
  });

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
