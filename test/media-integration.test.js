const assert=require("node:assert/strict");
const {test}=require("node:test");
const request=require("supertest");
const {randomUUID}=require("node:crypto");
const {integrationFixture}=require("./helpers/media-integration");
function metadata(f,patch={}){return request(f.app).get(f.metadataPath).set("authorization","Bearer a").query({...f.scope,revision_id:f.target.revision_id,expected_campaign_version:2,...patch});}
function bytes(f,{token="a",query={},headers={},path=f.deliveryPath}={}){const r=request(f.app).get(path).query({...f.scope,expected_campaign_version:2,...query});if(token)r.set("authorization",`Bearer ${token}`);for(const[k,v]of Object.entries(headers))r.set(k,v);return r;}
for(const kind of ["image","video"])test(`recovered ${kind} reference -> persisted metadata -> authenticated bytes -> explicit approval`,async()=>{
  const f=await integrationFixture({kind});assert.equal(f.state.providerCalls,1);
  const before=await f.s.get();const m=await metadata(f);assert.equal(m.status,200);
  assert.equal(m.body.preview.media[0].asset_id,f.assetId);assert.equal(m.body.preview.media[0].source_kind,"generated");assert.equal(m.body.preview.media[0].url,null);
  assert.equal(m.body.preview.platform_preview.status,"unrendered");
  const r=await bytes(f,{headers:kind==="video"?{Range:"bytes=0-7"}:{}});assert.equal(r.status,kind==="video"?206:200);
  const download=f.state.storage.find(x=>new URL(x.url).searchParams.has("generation"));assert.ok(download);const u=new URL(download.url);assert.equal(u.searchParams.get("generation"),u.searchParams.get("ifGenerationMatch"));
  assert.deepEqual(await f.s.get(),before);assert.equal(f.registry.receipts.size,0);assert.equal(f.state.providerCalls,1);
  await f.s.cmd("submit_review",f.target);
  await assert.rejects(()=>f.s.cmd("approve",{...f.target,preview_id:randomUUID(),approved:true}),e=>e.code==="PREVIEW_REQUIRED");
  const receipt=await f.registry.renderPreview(f.context,await f.s.get(),{...f.target,idempotency_key:"explicit_render"});
  const ack=await f.s.cmd("acknowledge_preview",{...f.target,render_receipt_id:receipt.render_receipt_id,acknowledged:true});
  await f.s.cmd("approve",{...f.target,preview_id:ack.created_ids.preview_ids[0],approved:true});
  assert.equal((await metadata(f,{expected_campaign_version:(await f.s.get()).version})).body.preview.approval_status,"approved");
  assert.equal((await bytes(f)).status,409);
});
test("metadata never authorises revoked media: rights are rechecked before the subsequent byte read",async()=>{
  const f=await integrationFixture();assert.equal((await metadata(f)).status,200);
  const asset=f.mediaRepository.assets.get(f.assetId);asset.allowed_uses=[];f.state.storage=[];
  assert.equal((await bytes(f)).status,404);assert.equal(f.state.storage.length,0);
  assert.equal((await metadata(f)).body.preview.media[0].reason,"ASSET_NOT_AVAILABLE");
});
test("brand/generation lineage changes invalidate both metadata and delivery without storage IO",async()=>{
  const f=await integrationFixture();f.state.jobBrand="brand_b";
  assert.equal((await metadata(f)).body.preview.media[0].reason,"ASSET_NOT_AVAILABLE");assert.equal((await bytes(f)).status,404);assert.equal(f.state.storage.length,0);
});
test("foreign browser identity and expired revision cannot turn metadata IDs into storage authority",async()=>{
  const f=await integrationFixture();assert.equal((await bytes(f,{token:"b"})).status,404);
  assert.equal((await bytes(f,{path:f.deliveryPath.replace(f.target.revision_id,randomUUID())})).status,409);
  assert.equal((await bytes(f,{path:f.deliveryPath.replace(f.assetId,f.referenceId)})).status,404);assert.equal(f.state.storage.length,0);
});
test("generation-pinned read fails closed if the object is replaced after stat",async()=>{
  const f=await integrationFixture();f.state.onStat=object=>{object.generation=String(Number(object.generation)+1);};
  assert.equal((await bytes(f)).status,503);
  assert.equal(f.state.storage.filter(x=>new URL(x.url).searchParams.has("generation")).length,1);
});
test("in-flight revocation allows only the already-authorised bounded request; the next request is denied",async()=>{
  const f=await integrationFixture();f.state.onStat=()=>{f.mediaRepository.assets.get(f.assetId).status="revoked";};
  assert.equal((await bytes(f)).status,200);const calls=f.state.storage.length;
  assert.equal((await bytes(f)).status,404);assert.equal(f.state.storage.length,calls);
});
test("repeated authorised reads are not an aggregate egress budget or a generation debit",async()=>{
  const f=await integrationFixture();const before=await f.s.get();
  for(let i=0;i<3;i++)assert.equal((await bytes(f)).status,200);
  assert.equal(f.state.storage.filter(x=>new URL(x.url).searchParams.has("generation")).length,3);
  assert.equal(f.state.providerCalls,1);assert.deepEqual(await f.s.get(),before);
});
