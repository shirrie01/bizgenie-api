const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { InMemoryCampaignMeasurementRegistry } = require("../src/campaigns");

const USER="11111111-1111-4111-8111-111111111111";
const context={actor:{kind:"customer",auth_user_id:USER},tenant_id:"tenant_a",project_id:"project_a",membership_role:"owner",policy_version:"campaign-owner.v1"};
const binding={brand_id:"brand_a",campaign_id:"11111111-1111-4111-8111-111111111112",content_item_id:"11111111-1111-4111-8111-111111111113",variant_id:"11111111-1111-4111-8111-111111111114",publication_id:"11111111-1111-4111-8111-111111111115",workflow:"published",published_at:"2026-09-20T12:00:00.000Z"};

describe("campaign measurement evidence",()=>{
  it("records only truthful post-publication observations and replays idempotently",async()=>{
    let n=0; const registry=new InMemoryCampaignMeasurementRegistry({now:()=>new Date("2026-09-20T15:00:00.000Z"),idFactory:()=>`0000000${++n}-0000-4000-8000-000000000000`});
    const input={idempotency_key:"m1",metric:"views",value:1250,unit:"count",observed_at:"2026-09-20T14:00:00.000Z",note:"Read from the published post"};
    const first=await registry.record(context,binding,input);
    const replay=await registry.record(context,binding,input);
    assert.deepEqual(replay,first);
    assert.equal(first.evidence_kind,"customer_attestation");
    assert.equal((await registry.list(context,binding.campaign_id,binding.variant_id)).length,1);
    await assert.rejects(()=>registry.record(context,binding,{...input,value:1251}),e=>e.code==="IDEMPOTENCY_KEY_CONFLICT");
    await assert.rejects(()=>registry.record(context,binding,{...input,idempotency_key:"m2",observed_at:"2026-09-20T11:59:59.000Z"}),e=>e.code==="VALIDATION_ERROR");
    await assert.rejects(()=>registry.record(context,{...binding,workflow:"approved"},{...input,idempotency_key:"m3"}),e=>e.code==="VALIDATION_ERROR");
  });

  it("keeps tenant/project reads isolated",async()=>{
    const registry=new InMemoryCampaignMeasurementRegistry({now:()=>new Date("2026-09-20T15:00:00.000Z"),idFactory:()=>"00000001-0000-4000-8000-000000000000"});
    await registry.record(context,binding,{idempotency_key:"m1",metric:"leads",value:3,unit:"count",observed_at:"2026-09-20T14:00:00.000Z"});
    assert.equal((await registry.list({...context,tenant_id:"tenant_b"},binding.campaign_id)).length,0);
    assert.equal((await registry.list({...context,project_id:"project_b"},binding.campaign_id)).length,0);
  });
});
