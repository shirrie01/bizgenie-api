const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
const repoPath = path.join(__dirname, '..');
const {InMemoryCampaignRepository, PostgresCampaignRepository} = require(path.join(repoPath, 'src/campaigns'));
const {types} = require(path.join(repoPath, 'node_modules/pg'));
const actor = {kind:'customer',auth_user_id:'11111111-1111-4111-8111-111111111111'};
const ctx = {actor, tenant_id:'tenant_a',project_id:'project_a',membership_role:'owner',policy_version:'campaign-owner.v1'};
const content = {title:null,body:'Reviewed text',caption:null,alt_text:null,asset_refs:[]};
async function fixture({badPreview=false}={}) {
  let now = new Date('2026-09-03T10:00:00.000Z');
  const snapshotId = randomUUID();
  const r = new InMemoryCampaignRepository({now:()=>now, authorize:async()=>true,
    validatePreview:async()=>true,
    captureBrandSnapshot:async()=>({brand_snapshot_id:snapshotId,tenant_id:ctx.tenant_id,project_id:ctx.project_id,brand_id:'brand_a',snapshot:{name:'A'},snapshot_hash:'a'.repeat(64)}),
    resolvePreviewReceipt:async(_,p)=>({variant_id:p.variant_id,revision_id:p.revision_id,revision_content_hash:badPreview?'0'.repeat(64):r.state.campaigns.get(id).items.values().next().value.variants.get(p.variant_id).revisions.get(p.revision_id).content_hash,platform:'instagram',placement:'feed',format:'text',render_receipt_id:p.render_receipt_id,profile_id:'synthetic.preview',profile_version:1,profile_hash:'c'.repeat(64),renderer_version:'fixture.v1',render_input_hash:'d'.repeat(64),preview_digest:'e'.repeat(64),rendered_at:now.toISOString()})});
  let id;
  async function cmd(type,payload) {
    const result = await r.executeCommand(ctx,{contract_version:'campaign-spine.v1',idempotency_key:randomUUID(),expected_campaign_version:id?r.state.campaigns.get(id).version:0,command_type:type,tenant_id:ctx.tenant_id,project_id:ctx.project_id,...(id?{campaign_id:id}:{}),payload});
    id ||= result.campaign_id; return result;
  }
  await cmd('create_campaign',{brand_id:'brand_a',name:'Review fixture',goal:'Review',display_timezone:'UTC'});
  const made = await cmd('create_content_item',{name:'Post',format:'text',platform:'instagram',placement:'feed',destination_label:'A',initial_content:content});
  const variantId = made.created_ids.variant_ids[0], revisionId = made.created_ids.revision_ids[0];
  const variant = ()=>r.state.campaigns.get(id).items.values().next().value.variants.get(variantId);
  async function approve() {
    await cmd('submit_review',{variant_id:variantId,revision_id:revisionId});
    const p=await cmd('acknowledge_preview',{variant_id:variantId,revision_id:revisionId,render_receipt_id:randomUUID(),acknowledged:true});
    return cmd('approve',{variant_id:variantId,revision_id:revisionId,preview_id:p.created_ids.preview_ids[0],approved:true});
  }
  async function begin() {await approve();return cmd('begin_manual_publication',{variant_id:variantId,revision_id:revisionId,approval_id:variant().active_approval_id});}
  async function publish() {const a=await begin();await cmd('confirm_manual_publication',{variant_id:variantId,attempt_id:a.created_ids.attempt_ids[0],published_at:now.toISOString(),attested_published:true});}
  return {r,cmd,approve,begin,publish,variant,variantId,revisionId,id,setNow:value=>{now=new Date(value);}};
}
test('Published is terminal: saving a revision is rejected',async()=>{
  const f=await fixture();await f.publish();
  await assert.rejects(()=>f.cmd('save_revision',{variant_id:f.variantId,content:{...content,body:'Changed'},change_reason:'Must not reopen'}));
});
test('Revocation returns to Review under the locked transition matrix',async()=>{
  const f=await fixture();await f.approve();
  await f.cmd('revoke_approval',{variant_id:f.variantId,approval_id:f.variant().active_approval_id,reason:'Review again'});
  assert.equal(f.variant().workflow,'review');
});
test('Unknown command must not invoke an internal transaction method',async()=>{
  const f=await fixture();await assert.rejects(()=>f.cmd('result',{}));
});
test('Missing media is rejected even in a draft',async()=>{
  const f=await fixture();await assert.rejects(()=>f.cmd('save_revision',{variant_id:f.variantId,content:{...content,asset_refs:[{asset_id:randomUUID(),role:'supporting'}]},change_reason:'Unknown asset'}));
});
test('Mismatched preview content hash must not produce approval',async()=>{
  const f=await fixture({badPreview:true});await assert.rejects(()=>f.approve());
});
test('Projection verification detects a changed current field',async()=>{
  const f=await fixture();f.r.state.campaigns.get(f.id).name='Not in event history';
  assert.equal((await f.r.verifyCampaignProjection(ctx,f.id)).valid,false);
});
test('Publication corrections reject unsafe URL and future time',async()=>{
  const f=await fixture();await f.publish();await assert.rejects(()=>f.cmd('correct_publication',{variant_id:f.variantId,publication_id:f.variant().publication_id,published_at:'2099-01-01T00:00:00.000Z',publication_url:'http://example.test/post?synthetic=1',external_reference:null,note:null,reason:'Invalid metadata'}));
});
test('Postgres read seam supplies the same derived stage as memory (stubbed transport)',async()=>{
  const f=await fixture();await f.approve();
  const client={query:async()=>({rows:[]}),release(){}};const pg=new PostgresCampaignRepository({pool:{connect:async()=>client}});
  pg._authorize=async()=>{};pg._loadCampaign=async()=>structuredClone(f.r.state.campaigns.get(f.id));
  assert.equal((await pg.getCampaign(ctx,f.id)).status,'approved');
});
test('Postgres timestamptz values still enforce publication lower bound (actual pg parser; no database)',async()=>{
  const f=await fixture();const a=await f.begin();
  f.r.state.campaigns.get(f.id).attempts.get(a.created_ids.attempt_ids[0]).started_at=types.getTypeParser(1184)('2026-09-03 10:00:00+00');
  await assert.rejects(()=>f.cmd('confirm_manual_publication',{variant_id:f.variantId,attempt_id:a.created_ids.attempt_ids[0],published_at:'2026-09-03T09:00:00.000Z',attested_published:true}));
});
test('Invalid metadata types are rejected by the command seam',async()=>{
  const f=await fixture();await assert.rejects(()=>f.cmd('update_campaign_details',{name:{unexpected:'object'},display_timezone:'not-a-zone'}));
});
