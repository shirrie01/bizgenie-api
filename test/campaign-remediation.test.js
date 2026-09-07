const {describe,it}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {InMemoryCampaignRepository}=require('../src/campaigns');
const {regressionCases,scenario,previewReceipt,context,NOW}=require('./helpers/campaign-regressions');
function fixture(){return new InMemoryCampaignRepository({now:()=>new Date(NOW),authorize:async()=>true,resolvePreviewReceipt:previewReceipt,validatePreview:async()=>true,captureBrandSnapshot:async()=>({brand_snapshot_id:randomUUID(),tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a',snapshot:{name:'A'},snapshot_hash:'a'.repeat(64)})});}
describe('I-B remediation deterministic contract regressions',()=>{
  regressionCases(fixture);
  it('field and pointer corruption fail event reconstruction',async()=>{const r=fixture(),s=await scenario(r);await s.add();assert.equal((await r.verifyCampaignProjection(context,s.id)).valid,true);r.state.campaigns.get(s.id).name='Unrecorded';assert.equal((await r.verifyCampaignProjection(context,s.id)).valid,false);});
  it('concurrent new aggregates cannot overwrite each other',async()=>{const r=fixture();await Promise.all([scenario(r),scenario(r)]);assert.equal((await r.listCampaigns(context)).length,2);});
});
