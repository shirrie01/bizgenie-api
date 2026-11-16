const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),request=require('supertest'),{randomUUID}=require('node:crypto');
const {InMemoryCampaignRepository}=require('../src/campaigns');
const {createCustomerCampaignRouter}=require('../src/campaigns/router');
const {AuthenticationRequiredError,AuthorizationDeniedError}=require('../src/authorization');
const {scenario,context,previewReceipt}=require('./helpers/campaign-regressions');
async function fixture(){
 const repository=new InMemoryCampaignRepository({now:()=>new Date('2026-09-03T10:00:00Z'),authorize:async()=>true,validatePreview:async()=>true,resolvePreviewReceipt:previewReceipt,captureBrandSnapshot:async()=>({brand_snapshot_id:randomUUID(),tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a',snapshot:{name:'Synthetic'},snapshot_hash:'a'.repeat(64)})});
 const s=await scenario(repository),target=await s.add();
 const auth={authorizeProject:async({actor,tenantId,projectId})=>{if(actor.auth_user_id!==context.actor.auth_user_id||tenantId!=='tenant_a'||projectId!=='project_a')throw new AuthorizationDeniedError();return{...context,tenant_id:tenantId,project_id:projectId,actor};}};
 const app=express();app.use(express.json());app.use('/customer/campaigns',createCustomerCampaignRouter({repository,tokenVerifier:{verifyAccessToken:async t=>{if(t!=='owner')throw new AuthenticationRequiredError();return context.actor;}},authorizationService:auth,campaignGenerationService:{},measurementRegistry:{},logger:{warn(){},error(){}}}));
 const url=`/customer/campaigns/${s.id}/variants/${target.variant_id}/revisions`;
 const body=()=>({tenant_id:'tenant_a',project_id:'project_a',idempotency_key:randomUUID(),expected_campaign_version:repository.state.campaigns.get(s.id).version,revision_id:target.revision_id,content:{title:null,body:'Corrected copy\nCTA: Contact us',caption:null,alt_text:null}});
 return{s,target,repository,url,body,post:(v,t='owner')=>request(app).post(url).set('authorization','Bearer '+t).send(v)};
}
test('customer saves a new immutable revision, preserving prior copy and stable lost-response replay',async()=>{
 const f=await fixture(),body=f.body(),r=await f.post(body);assert.equal(r.status,200);const variant=r.body.campaign.items[0].variants[0];assert.notEqual(variant.current_revision_id,f.target.revision_id);assert.equal(variant.current_content.body,body.content.body);assert.equal(variant.workflow,'draft');
 const raw=await f.s.variant(f.target);assert.equal(raw.revisions.size,2);assert.equal(raw.revisions.get(f.target.revision_id).content.body,'Reviewed content');assert.equal(raw.revisions.get(variant.current_revision_id).parent_revision_id,f.target.revision_id);
 const replay=await f.post(body);assert.equal(replay.status,200);assert.equal(replay.body.campaign.version,r.body.campaign.version);assert.equal((await f.s.variant(f.target)).revisions.size,2);
});
test('stale campaign/revision, forged assets, malformed copy and foreign identity/scope reject atomically',async()=>{
 const f=await fixture(),body=f.body(),before=await f.s.get();
 for(const patch of [{tenant_id:'foreign'},{revision_id:randomUUID()},{expected_campaign_version:0},{content:{...body.content,asset_refs:[]}},{content:{...body.content,body:'x'.repeat(32001)}}]){const r=await f.post({...body,...patch});assert.ok([400,404,409].includes(r.status));assert.deepEqual(await f.s.get(),before);}
 assert.equal((await f.post(body,'invalid')).status,401);
 const first=await f.post(body);assert.equal(first.status,200);const after=await f.s.get();const stale=await f.post({...body,idempotency_key:randomUUID(),expected_campaign_version:after.version});assert.equal(stale.status,409);assert.deepEqual(await f.s.get(),after);
});
test('editing approved copy revokes its approval and requires a new review without losing history',async()=>{
 const f=await fixture();const approved=await f.s.approve(f.target);await f.s.schedule(approved);const prior=await f.s.variant(f.target),approval=prior.active_approval_id;assert.ok(approval);
 const r=await f.post(f.body());assert.equal(r.status,200);const current=await f.s.variant(f.target);assert.equal(current.workflow,'draft');assert.equal(current.active_approval_id,null);assert.equal(current.active_schedule_id,null);assert.equal((await f.s.get()).approvals.get(approval).decision,'approved');assert.equal(current.revisions.size,2);
});

test('copy-only edits retain existing asset identifiers and reject revoked media without mutating history',async()=>{
 const f=await fixture(),asset=randomUUID();let active=true;
 f.repository.resolveMedia=async()=>({asset_id:asset,tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a',status:active?'active':'revoked',source_kind:'generated',media_kind:'image',job_id:'original-job',manifest:{sha256:'a'.repeat(64)}});
 const t=await f.s.add('image',{title:null,body:'Image copy',caption:null,alt_text:null,asset_refs:[{asset_id:asset,role:'primary'}]});
 // The existing target's body cannot replace media; direct transaction regression tests immutable source refs.
 const before=await f.s.get();active=false;
 await assert.rejects(f.s.cmd('save_revision',{variant_id:t.variant_id,expected_revision_id:t.revision_id,content:{title:null,body:'Changed CTA',caption:null,alt_text:null,asset_refs:[{asset_id:asset,role:'primary'}]},change_reason:'Correction'}),{code:'RESOURCE_NOT_AVAILABLE'});
 assert.deepEqual(await f.s.get(),before);active=true;
 await f.s.cmd('save_revision',{variant_id:t.variant_id,expected_revision_id:t.revision_id,content:{title:null,body:'Changed CTA',caption:null,alt_text:null,asset_refs:[{asset_id:asset,role:'primary'}]},change_reason:'Correction'});
 const variant=await f.s.variant(t);assert.deepEqual(variant.revisions.get(variant.current_revision_id).content.asset_refs,[{asset_id:asset,role:'primary'}]);
});
