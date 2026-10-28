const assert=require('node:assert/strict');const {it}=require('node:test');const request=require('supertest');
const {createApp}=require('../index');const {InMemoryCampaignRepository,CampaignResourceError}=require('../src/campaigns');const {AuthorizationDeniedError,AuthenticationRequiredError}=require('../src/authorization');
const {scenario,previewReceipt,context,NOW}=require('./helpers/campaign-regressions');
async function fixture(){let role='owner';const repository=new InMemoryCampaignRepository({now:()=>new Date(NOW),authorize:async()=>role==='owner',resolvePreviewReceipt:previewReceipt,validatePreview:async()=>true,captureBrandSnapshot:async()=>({brand_snapshot_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tenant_id:context.tenant_id,project_id:context.project_id,brand_id:'brand_a',source_version:1,source_updated_at:NOW,source_schema_version:'brand-brain.v1',snapshot:{name:'Synthetic'},snapshot_hash:'a'.repeat(64),captured_at:NOW})});
const s=await scenario(repository),a=await s.approve(await s.add()),scheduled=await s.schedule(a);
const app=createApp({campaignRepository:repository,customerTokenVerifier:{verifyAccessToken:async t=>{if(t!=='ok')throw new AuthenticationRequiredError();return context.actor;}},authorizationService:{authorizeProject:async({tenantId,projectId,action})=>{if(role!=='owner'||tenantId!==context.tenant_id||projectId!==context.project_id)throw new AuthorizationDeniedError();return {...context,action};}},logger:{warn(){},error(){}}});
return {app,s,a,scheduled,role:r=>{role=r;}};}
it('unschedule uses existing durable command, stable caller schedule identity and idempotent replay',async()=>{
 const f=await fixture();const path=`/customer/campaigns/${f.s.id}/variants/${f.a.variant_id}/unschedule`;
 const body={tenant_id:context.tenant_id,project_id:context.project_id,idempotency_key:'unschedule-retry',expected_campaign_version:f.scheduled.campaign_version,schedule_id:f.scheduled.created_ids.schedule_ids[0]};
 const post=b=>request(f.app).post(path).set('authorization','Bearer ok').send(b);
 assert.equal((await post({...body,tenant_id:'foreign'})).status,404);f.role('member');assert.equal((await post(body)).status,404);f.role('owner');
 const first=await post(body);assert.equal(first.status,200);assert.equal(first.body.campaign.items[0].variants[0].workflow,'approved');
 const replay=await post(body);assert.equal(replay.status,200);assert.deepEqual(replay.body.result,first.body.result);
 assert.equal((await post({...body,idempotency_key:'new-stale'})).body.error.code,'VERSION_CONFLICT');
 f.role('revoked');assert.equal((await post(body)).status,404);f.role('owner');assert.equal((await f.s.get()).schedules.size,1);
});
