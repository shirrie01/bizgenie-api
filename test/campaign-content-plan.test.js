'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {buildContentPlan,PREVIEW_TUPLES}=require('../src/campaigns/contentPlan');
const fonzo=require('./fixtures/fonzo-acceptance');
const campaign={campaign_id:'33333333-3333-4333-8333-333333333333',name:'Fonzo launch week',goal:fonzo.goal,display_timezone:'Europe/London'};
const plan=(over={})=>buildContentPlan({campaign,brandBrain:fonzo.brandBrain,startDate:fonzo.startDate,...over});

test('Fonzo plan has exactly seven posts, five images, three videos; copy is an editable template draft, not a text generation',()=>{
 const p=plan();assert.equal(p.contract_version,'content-plan.v1');
 assert.deepEqual(p.totals,{posts:7,content_items:8,images:5,videos:3,text_generations:0,copy:'template_draft_editable'});
 assert.deepEqual(p.credit_requirements.by_execution_class,{'text.standard':0,'image.normal':5,'video.normal':3});
 const days=p.items.filter(i=>i.is_post).map(i=>i.day);assert.deepEqual(days,[1,2,3,4,5,6,7]);
 assert.equal(p.items.find(i=>!i.is_post).schedule,null,'key visual is an asset, not a scheduled post');
 const provisional=Object.entries(p.credit_requirements.by_execution_class).reduce((t,[k,n])=>t+n*fonzo.provisionalPrices[k],0);assert.equal(provisional,fonzo.expected.provisionalCredits);
});
test('every destination has an active preview profile; Instagram feed video is never planned',()=>{
 for(const i of plan().items){const {format,platform,placement}=i.content_item;assert.ok(PREVIEW_TUPLES[format].includes(`${platform}.${placement}`),`${platform}.${placement}.${format}`);}
 assert.equal(plan().items.some(i=>i.content_item.platform==='instagram'&&i.content_item.format==='video'),false);
 assert.ok(plan().items.every(i=>i.content_item.name.length<=200&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(i.content_item.placement)));
});
test('plan is deterministic, offline and covers the seven-day calendar with correct UTC slots',()=>{
 assert.deepEqual(plan(),plan());
 const first=plan().items.find(i=>i.day===1).schedule;assert.deepEqual(first,{timezone:'Europe/London',local_datetime:'2026-12-07T09:00:00.000',utc_offset_minutes:0,scheduled_for:'2026-12-07T09:00:00.000Z'});
 const summer=buildContentPlan({campaign,brandBrain:fonzo.brandBrain,startDate:'2027-06-07'}).items.find(i=>i.day===1).schedule;assert.equal(summer.utc_offset_minutes,60);assert.equal(summer.scheduled_for,'2027-06-07T08:00:00.000Z');
 const times=plan().items.filter(i=>i.is_post).map(i=>i.schedule.scheduled_for);assert.deepEqual([...times].sort(),times);
});
test('copy briefs use only supplied facts and always carry the no-invented-claims fence',()=>{
 const text=JSON.stringify(plan());
 for(const i of plan().items)for(const s of i.generation_steps){assert.match(s.execution_brief,/Never state or imply: testimonials, ratings, certifications/);assert.match(s.execution_brief,/Approved facts you may state: Fonzo is a sugar-free soft drink; Fonzo is sold in 330ml cans\./);assert.ok(s.execution_brief.length<=4000);assert.notEqual(s.execution_class,'text.standard','text.standard cannot target an image/video variant');}
 for(const i of plan().items){assert.equal(i.initial_content.asset_refs.length,0);assert.ok(i.initial_content.body.length<=32000);assert.match(i.initial_content.body,/Fonzo/);assert.match(i.initial_content.body,/Enquire about stocking Fonzo\.$/);}
 assert.doesNotMatch(text,/\b(award|organic|vitamin|calories? per|£\d|%|Tesco|Asda|Sainsbury|Morrisons|Waitrose)\b/i);
 const neutral=buildContentPlan({campaign,brandBrain:{name:'Plain Co'},startDate:fonzo.startDate});
 assert.match(neutral.items[0].generation_steps[0].execution_brief,/No approved product facts are supplied/);
 assert.ok(neutral.assumptions_to_confirm.some(a=>/No approved product claims/.test(a)));assert.ok(neutral.items.every(i=>i.cta.source==='default_needs_confirmation'));
 assert.ok(plan().items.every(i=>i.cta.source==='brand_brain'&&i.cta.label==='Enquire about stocking Fonzo'));
});
test('plan states placeholders, assumptions and a measurement plan without inventing results',()=>{
 const p=plan();assert.ok(p.placeholders.length>=1);assert.ok(p.assumptions_to_confirm.some(a=>/Enquiry destination/.test(a)));assert.ok(p.assumptions_to_confirm.some(a=>/visual identity/.test(a)));
 assert.deepEqual(p.measurement_plan.metrics.map(m=>m.metric),['impressions','clicks','enquiries','leads','conversions']);
 assert.ok(p.items.filter(i=>i.is_post).every(i=>i.measurement.utm_campaign==='fonzo-launch-week-wk1'&&/^day\d-(image|video)$/.test(i.measurement.utm_content)));
 assert.ok(p.items.filter(i=>i.content_item.format==='video').every(i=>i.execution_mode_options.join()==='ai,hybrid'));
});
test('invalid inputs fail closed',()=>{
 for(const bad of [{campaign:null},{brandBrain:null},{brandBrain:{}},{startDate:'2026-13-45'},{startDate:'tomorrow'},{campaign:{...campaign,display_timezone:'Not/AZone'}}])assert.throws(()=>plan(bad));
});

// HTTP: the read-only route behind the real campaign router.
const {createApp}=require('../index');const {InMemoryAuthorizationRepository}=require('../src/authorization');const {InMemoryCampaignRepository}=require('../src/campaigns');const {scenario,NOW}=require('./helpers/campaign-regressions');
const {randomUUID}=require('node:crypto');
const user='11111111-1111-4111-8111-111111111111',scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'};
async function fixture(brain=fonzo.brandBrain){
 const repo=new InMemoryCampaignRepository({now:()=>new Date(NOW),authorize:async()=>true,validatePreview:async()=>true,captureBrandSnapshot:async()=>({brand_snapshot_id:randomUUID(),...scope,snapshot:{name:'Fonzo'},snapshot_hash:'a'.repeat(64)})});
 const s=await scenario(repo);
 const auth=new InMemoryAuthorizationRepository({customerProfiles:[{auth_user_id:user}],tenants:[{tenant_id:scope.tenant_id,created_by:user}],memberships:[{tenant_id:scope.tenant_id,auth_user_id:user,role:'owner'}],projects:[{tenant_id:scope.tenant_id,project_id:scope.project_id}],brands:[{project_id:scope.project_id,brand_id:scope.brand_id,status:'approved'}]});
 let reads=0;const brandBrainRepository={getByProjectAndBrand:async(p,b)=>{reads++;assert.equal(p,scope.project_id);assert.equal(b,scope.brand_id);return brain;}};
 const app=createApp({campaignRepository:repo,authorizationRepository:auth,brandBrainRepository,customerTokenVerifier:{verifyAccessToken:async t=>{if(t!=='owner')throw Error('x');return {kind:'customer',auth_user_id:user,trusted_scope:scope};}},logger:{info(){},warn(){},error(){}}});
 return {app,s,get reads(){return reads;},repo};
}
test('GET content-plan is authenticated, read-only, strict and returns the plan for the saved campaign',async()=>{
 const f=await fixture(),url=`/customer/campaigns/${f.s.id}/content-plan`,q={tenant_id:'tenant_a',project_id:'project_a',start_date:fonzo.startDate};
 assert.equal((await request(f.app).get(url).query(q)).status,401);
 const before=structuredClone(f.repo.state.campaigns.get(f.s.id));
 const r=await request(f.app).get(url).query(q).set('authorization','Bearer owner');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.plan.campaign_id,f.s.id);assert.equal(r.body.plan.totals.posts,7);assert.equal(f.reads,1);
 assert.deepEqual(f.repo.state.campaigns.get(f.s.id),before,'read-only: no campaign mutation');
 for(const bad of [{...q,start_date:'bad'},{...q,extra:'1'},{tenant_id:'tenant_a',project_id:'project_a'}])assert.equal((await request(f.app).get(url).query(bad).set('authorization','Bearer owner')).status,400);
 assert.equal((await request(f.app).get(url).query({...q,project_id:'foreign'}).set('authorization','Bearer owner')).status>=400,true);
 assert.equal((await request(f.app).post(url).set('authorization','Bearer owner').send({})).status,404);
 const missing=await request(f.app).get(`/customer/campaigns/${randomUUID()}/content-plan`).query(q).set('authorization','Bearer owner');assert.equal(missing.status,404);
});
test('Studio bridge forwards the read-only plan route but no write variant of it',async()=>{
 const {createStudioBridge,founder,target}=require('./helpers/founder-bridge');let calls=[];
 const verify=async()=>({kind:'customer',auth_user_id:founder,trusted_scope:{tenant_id:'t',project_id:'p',brand_id:'b'}});
 const app=createStudioBridge({target,tokenVerifier:{verifyAccessToken:verify,verifyIdentityAccessToken:verify},iamTokenProvider:async()=>'iam',fetchImpl:async(u,i)=>{calls.push(i.method);return Response.json({plan:{}});}});
 const id='33333333-3333-4333-8333-333333333333',url=`/customer/campaigns/${id}/content-plan?tenant_id=t&project_id=p&start_date=2026-12-07`;
 assert.equal((await request(app).get(url).set('authorization','Bearer x')).status,200);assert.deepEqual(calls,['GET']);
 for(const m of ['post','put','delete'])assert.ok([403,404].includes((await request(app)[m](url.split('?')[0]).set('authorization','Bearer x').send({})).status));assert.equal(calls.length,1);
});
