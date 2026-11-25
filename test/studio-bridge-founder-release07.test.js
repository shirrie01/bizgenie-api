const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target}=require('./helpers/founder-bridge');
const R07=require('../src/studio-bridge/founderRelease07');
const scope={tenant_id:'tenant_fonzo',project_id:'project_fonzo',brand_id:'brand_fonzo'};
const fairway={tenant_id:'tenant_fairway',project_id:'project_fairway',brand_id:'brand_fairway'};
const id='44444444-4444-4444-8444-444444444444';
const wsPin={tenant_id:'tenant_fairway',business_name:'Fonzo'};
const wsBody={...wsPin};
const initBody={...scope,filename:'classic-cola.png',content_type:'image/png',bytes:1024,rights_confirmed:true,idempotency_key:'fonzo.classic.v1'};
const q=`tenant_id=${scope.tenant_id}&project_id=${scope.project_id}&brand_id=${scope.brand_id}`;
function kit({mode,patch={},actors={},trusted=scope}={}){
 let iam=0;const seen=[];
 const base={kind:'customer',auth_user_id:founder,trusted_scope:trusted};
 const verify=async token=>{if(actors[token])return actors[token];if(token==='founder')return base;if(token==='other')return {...base,auth_user_id:other};throw Error('synthetic invalid auth');};
 const options=mode==='workspace'?{allowFounderOnboarding:false,allowFounderAdditionalWorkspace:true,founderAdditionalWorkspace:wsPin}:{allowFounderAssetIntake:true,founderAssetIntake:scope};
 const app=createStudioBridge({target:{...target,...options,...patch},tokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},iamTokenProvider:async()=>{iam++;return'synthetic.iam';},fetchImpl:async(...args)=>{seen.push(args);return Response.json({status:'synthetic.only'});}});
 return {app,seen,counts:()=>[iam,seen.length]};
}
const send=(k,method,url,body,token='founder',headers={})=>{let r=request(k.app)[method](url);if(token)r=r.set('authorization','Bearer '+token);for(const [h,v] of Object.entries(headers))r=r.set(h,v);return body===undefined?r:r.send(body);};
const put=(k,url,bytes,type='image/png',token='founder')=>send(k,'put',url,bytes,token,{'content-type':type});

// ---- Part A: additional workspace ------------------------------------------------------------------------------------------------
test('additional workspace: exact route, exact pinned body, founder only, one upstream call',async()=>{
 const k=kit({mode:'workspace'});
 const r=await send(k,'post','/customer/workspace/brands',wsBody);
 assert.equal(r.status,200);assert.deepEqual(k.counts(),[1,1]);
 assert.equal(new URL(k.seen[0][0]).pathname,'/customer/workspace/brands');assert.equal(k.seen[0][1].method,'POST');
});
test('additional workspace: the upstream operation is not idempotent, so a second attempt in the same process is refused before IAM',async()=>{
 const k=kit({mode:'workspace'});
 assert.equal((await send(k,'post','/customer/workspace/brands',wsBody)).status,200);
 const again=await send(k,'post','/customer/workspace/brands',wsBody);
 assert.equal(again.status,409);assert.equal(again.body.error.code,'FOUNDER_WORKSPACE_ALREADY_ATTEMPTED');assert.deepEqual(k.counts(),[1,1]);
});
test('additional workspace: concurrent identical requests produce at most one upstream call',async()=>{
 const k=kit({mode:'workspace'});
 const all=await Promise.all([1,2,3,4].map(()=>send(k,'post','/customer/workspace/brands',wsBody)));
 assert.equal(all.filter(r=>r.status===200).length,1);assert.equal(all.filter(r=>r.status===409).length,3);assert.deepEqual(k.counts(),[1,1]);
});
test('additional workspace: any different body, tenant, name, extra field or whitespace is refused with no IAM and no upstream',async()=>{
 const bad=[{...wsBody,business_name:'Fairway'},{...wsBody,business_name:' Fonzo'},{...wsBody,tenant_id:'tenant_other'},{...wsBody,extra:1},{...wsBody,website_or_social_profile:'https://example.invalid'},{tenant_id:wsPin.tenant_id},{business_name:'Fonzo'},{},[],'x',{...wsBody,business_name:['Fonzo']}];
 for(const body of bad){const k=kit({mode:'workspace'});const r=await send(k,'post','/customer/workspace/brands',body);assert.ok([400,404,415].includes(r.status),JSON.stringify(body)+' '+r.status);assert.deepEqual(k.counts(),[0,0],JSON.stringify(body));}
});
test('additional workspace: non-founder and anonymous are refused, a refused request does not consume the one attempt',async()=>{
 const k=kit({mode:'workspace'});
 assert.equal((await send(k,'post','/customer/workspace/brands',wsBody,'other')).status,403);
 assert.equal((await send(k,'post','/customer/workspace/brands',wsBody,null)).status,401);
 assert.equal((await send(k,'post','/customer/workspace/brands',{...wsBody,business_name:'Nope'})).status,404);
 assert.deepEqual(k.counts(),[0,0]);
 assert.equal((await send(k,'post','/customer/workspace/brands',wsBody)).status,200);
});
test('additional workspace: nothing else is admitted by this permission',async()=>{
 const k=kit({mode:'workspace'});
 for(const [m,u,b] of [['post','/customer/workspace/bootstrap',{}],['post','/customer/workspace/select',scope],['post','/customer/workspace/brands?x=1',wsBody],['post','/customer/workspace/brands/',wsBody],['put','/customer/workspace/brands',wsBody],['put','/customer/workspace/onboarding',{}],['put','/customer/workspace/brand-brain',{}],['post','/customer/campaigns',{}],['post','/customer/campaign-recommendations',{}],['post','/customer/assets/uploads',initBody],['post','/customer/social/oauth-intents',scope],['post','/customer/generation-quotes',{}],['post','/billing/stripe/checkout',{}]]){
  const r=await send(k,m,u,b);assert.ok([403,404].includes(r.status),m+' '+u+' '+r.status);
 }
 assert.deepEqual(k.counts(),[0,0]);
});
test('additional workspace: default OFF in the accepted profile and with an explicit false',async()=>{
 for(const patch of [{},{allowFounderAdditionalWorkspace:false}]){const k=kit({mode:'intake',patch:{allowFounderAssetIntake:false,founderAssetIntake:undefined,...patch}});const r=await send(k,'post','/customer/workspace/brands',wsBody);assert.equal(r.status,403);assert.deepEqual(k.counts(),[0,0]);}
});
test('additional workspace: configuration is isolated and strict',()=>{
 const make=patch=>()=>kit({mode:'workspace',patch});
 assert.doesNotThrow(make({}));
 for(const patch of [{allowFounderOnboarding:true},{allowFounderRecommendations:true},{allowFounderCampaignRoot:true},{allowFounderDraftWorkflow:true},{allowFounderCopyEditing:true},{allowFounderSocialConnections:true},{allowFounderVideoAttachment:true},{allowFounderAssetIntake:true,founderAssetIntake:scope},{allowWrites:true},{allowWorkspaceBootstrap:true},{allowDraftWorkflow:true},{allowGenerationConfirmation:true},{allowSocialWrites:true},{allowStripeCheckout:true},{founderAuthUserId:undefined},{founderAuthUserId:'not-a-uuid'},{allowFounderAdditionalWorkspace:'true'},{founderAdditionalWorkspace:undefined},{founderAdditionalWorkspace:{...wsPin,extra:1}},{founderAdditionalWorkspace:{tenant_id:'t',business_name:' Fonzo'}},{founderAdditionalWorkspace:{tenant_id:'',business_name:'Fonzo'}}])assert.throws(make(patch),/./,JSON.stringify(patch));
 assert.throws(()=>kit({mode:'intake',patch:{founderAdditionalWorkspace:wsPin}}),/./);
});
test('additional workspace: entrypoint parsing is strict, rejects stale pins and never reads other settings',()=>{
 assert.deepEqual(R07.fromEnv({}),{allowFounderAdditionalWorkspace:false,allowFounderAssetIntake:false});
 assert.throws(()=>R07.fromEnv({BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE:'1'}));
 assert.throws(()=>R07.fromEnv({BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID:'t'}));
 assert.throws(()=>R07.fromEnv({BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE:'false',BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME:'Fonzo'}));
 assert.throws(()=>R07.fromEnv({BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID:'t'}));
 const ok=R07.fromEnv({BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE:'true',BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID:'t',BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME:'Fonzo'});
 assert.deepEqual(ok.founderAdditionalWorkspace,{tenant_id:'t',business_name:'Fonzo'});
});

// ---- Part B: asset intake --------------------------------------------------------------------------------------------------------
test('intake: init, bytes and complete are forwarded exactly once each for the pinned scope; reads are founder-only',async()=>{
 const k=kit({mode:'intake'});
 assert.equal((await send(k,'post','/customer/assets/uploads',initBody)).status,200);
 assert.equal((await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.from([137,80,78,71,13,10,26,10,1,2,3]))).status,200);
 assert.equal((await send(k,'post',`/customer/assets/${id}/complete`,scope)).status,200);
 assert.equal((await send(k,'get',`/customer/assets/${id}/preview?${q}`)).status,200);
 assert.equal((await send(k,'get',`/customer/assets?${q}&limit=5`)).status,200);
 assert.deepEqual(k.counts(),[5,5]);
 assert.deepEqual(k.seen.map(([u,o])=>o.method+' '+new URL(u).pathname),['POST /customer/assets/uploads',`PUT /customer/assets/uploads/${id}/bytes`,`POST /customer/assets/${id}/complete`,`GET /customer/assets/${id}/preview`,'GET /customer/assets']);
});
test('intake: rights confirmation is mandatory and must be literal true',async()=>{
 for(const rights of [false,undefined,'true',1,null]){const k=kit({mode:'intake'});const body={...initBody,rights_confirmed:rights};if(rights===undefined)delete body.rights_confirmed;assert.equal((await send(k,'post','/customer/assets/uploads',body)).status,404);assert.deepEqual(k.counts(),[0,0]);}
});
test('intake: file type, size, name, scope and unknown fields are validated before IAM',async()=>{
 const bad=[{content_type:'image/gif'},{content_type:'image/svg+xml'},{content_type:'application/pdf'},{content_type:'text/html'},{bytes:0},{bytes:33554433},{bytes:1.5},{bytes:'10'},{filename:'a/b.png'},{filename:'a\\b.png'},{filename:''},{filename:'x'.repeat(201)},{idempotency_key:undefined},{idempotency_key:'has space'},{tenant_id:fairway.tenant_id},{project_id:fairway.project_id},{brand_id:fairway.brand_id},{sha256:'a'.repeat(64)},{allowed_uses:['campaign.publish']},{rights_policy_version:'x'}];
 for(const patch of bad){const k=kit({mode:'intake'});const body={...initBody,...patch};for(const key of Object.keys(body))if(body[key]===undefined)delete body[key];const r=await send(k,'post','/customer/assets/uploads',body);assert.ok([404].includes(r.status),JSON.stringify(patch)+' '+r.status);assert.deepEqual(k.counts(),[0,0],JSON.stringify(patch));}
});
test('intake: the three declared image types and mp4 pass; the 32 MiB boundary is inclusive',async()=>{
 for(const [content_type,bytes] of [['image/png',1],['image/jpeg',1000],['image/webp',33554432],['video/mp4',33554432]]){const k=kit({mode:'intake'});assert.equal((await send(k,'post','/customer/assets/uploads',{...initBody,content_type,bytes})).status,200);}
});
test('intake: byte upload needs the exact pinned query, a declared type and a bounded body',async()=>{
 const png=Buffer.from([137,80,78,71,13,10,26,10]);
 const cases=[[`/customer/assets/uploads/${id}/bytes`,'image/png'],[`/customer/assets/uploads/${id}/bytes?tenant_id=${scope.tenant_id}`,'image/png'],[`/customer/assets/uploads/${id}/bytes?${q}&x=1`,'image/png'],[`/customer/assets/uploads/${id}/bytes?${q}&${q}`,'image/png'],[`/customer/assets/uploads/${id}/bytes?tenant_id=${fairway.tenant_id}&project_id=${scope.project_id}&brand_id=${scope.brand_id}`,'image/png'],[`/customer/assets/uploads/${id}/bytes?${q}`,'application/octet-stream'],[`/customer/assets/uploads/${id}/bytes?${q}`,'image/png; charset=utf-8'],[`/customer/assets/uploads/${id}/bytes?${q}`,'image/gif'],[`/customer/assets/uploads/not-a-uuid/bytes?${q}`,'image/png']];
 for(const [u,type] of cases){const k=kit({mode:'intake'});const r=await put(k,u,png,type);assert.ok([403,404].includes(r.status),u+' '+type+' '+r.status);assert.deepEqual(k.counts(),[0,0],u+' '+type);}
 const k=kit({mode:'intake'});const empty=await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.alloc(0));assert.ok([400,404].includes(empty.status));assert.deepEqual(k.counts(),[0,0]);
});
test('intake: a body of exactly 32 MiB is forwarded (the limit is inclusive)',async()=>{
 const k=kit({mode:'intake'});const r=await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.alloc(33554432,1));
 assert.equal(r.status,200);assert.deepEqual(k.counts(),[1,1]);
});
test('intake: a body over 32 MiB is rejected by the bridge before IAM',async()=>{
 const k=kit({mode:'intake'});const r=await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.alloc(33554433,1));
 assert.ok([400,404,413].includes(r.status),String(r.status));assert.deepEqual(k.counts(),[0,0]);
});
test('intake: only the founder, only the pinned scope, for every admitted and read route',async()=>{
 const k=kit({mode:'intake'});
 const calls=[['post','/customer/assets/uploads',initBody],['post',`/customer/assets/${id}/complete`,scope],['get',`/customer/assets/${id}/preview?${q}`],['get',`/customer/assets?${q}`],['get',`/customer/assets/${id}?${q}`]];
 for(const [m,u,b] of calls)assert.equal((await send(k,m,u,b,'other')).status,403,u);
 assert.equal((await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.from([1]),'image/png','other')).status,403);
 for(const [m,u,b] of calls)assert.equal((await send(k,m,u,b,null)).status,401,u);
 assert.deepEqual(k.counts(),[0,0]);
 // The founder session scoped to Fairway cannot reach the Fonzo intake at all.
 const fw=kit({mode:'intake',trusted:fairway});
 for(const [m,u,b] of calls)assert.equal((await send(fw,m,u,b)).status,404,u);
 assert.deepEqual(fw.counts(),[0,0]);
});
test('intake: reads without or with a foreign scope are refused',async()=>{
 const k=kit({mode:'intake'});
 for(const u of [`/customer/assets/${id}/preview`,`/customer/assets?tenant_id=${scope.tenant_id}`,`/customer/assets/${id}/preview?tenant_id=${fairway.tenant_id}&project_id=${fairway.project_id}&brand_id=${fairway.brand_id}`,`/customer/assets/${id}/preview?${q}&token=x`]){const r=await send(k,'get',u);assert.equal(r.status,404,u);}
 assert.deepEqual(k.counts(),[0,0]);
});
test('intake: revoke, delete, bootstrap, workspace creation and every other write remain denied; extra complete fields refused',async()=>{
 const k=kit({mode:'intake',patch:{allowFounderOnboarding:false}});
 for(const [m,u,b] of [['post',`/customer/assets/${id}/revoke`,scope],['delete',`/customer/assets/${id}?${q}`],['put',`/customer/assets/${id}`,scope],['post','/customer/assets/uploads?x=1',initBody],['post','/customer/workspace/brands',{tenant_id:'t',business_name:'Fonzo'}],['post','/customer/workspace/bootstrap',{}],['post','/customer/campaigns',{}],['post','/customer/generation-quotes',{}],['post','/customer/social/dispatches',{}],['post','/billing/stripe/checkout',{}]]){const r=await send(k,m,u,b);assert.ok([403,404].includes(r.status),m+' '+u+' '+r.status);}
 assert.equal((await send(k,'post',`/customer/assets/${id}/complete`,{...scope,sha256:'a'.repeat(64)})).status,404);
 assert.equal((await send(k,'post',`/customer/assets/${id}/complete?x=1`,scope)).status,403);
 assert.deepEqual(k.counts(),[0,0]);
});
test('intake: default OFF in the accepted profile and with an explicit false; reads then keep their existing behaviour',async()=>{
 for(const patch of [{},{allowFounderAssetIntake:false}]){const k=kit({mode:'workspace',patch:{allowFounderAdditionalWorkspace:false,founderAdditionalWorkspace:undefined,allowFounderOnboarding:true,...patch}});assert.equal((await send(k,'post','/customer/assets/uploads',initBody)).status,403);assert.equal((await put(k,`/customer/assets/uploads/${id}/bytes?${q}`,Buffer.from([1]))).status,403);assert.equal((await send(k,'post',`/customer/assets/${id}/complete`,scope)).status,403);assert.deepEqual(k.counts(),[0,0]);}
});
test('intake: configuration is isolated from video and broad writes and consistent with the draft and root pins',()=>{
 const make=patch=>()=>kit({mode:'intake',patch});
 assert.doesNotThrow(make({}));
 assert.doesNotThrow(make({allowFounderDraftWorkflow:true,founderDraftScope:{...scope,campaign_id:'55555555-5555-4555-8555-555555555555'}}));
 for(const patch of [{allowFounderDraftWorkflow:true,founderDraftScope:{...fairway,campaign_id:'55555555-5555-4555-8555-555555555555'}},{allowFounderAssetIntake:'true'},{founderAssetIntake:undefined},{founderAssetIntake:{...scope,extra:1}},{founderAssetIntake:{tenant_id:'t'}},{founderAuthUserId:undefined},{allowWrites:true},{allowWorkspaceBootstrap:true},{allowDraftWorkflow:true},{allowGenerationConfirmation:true},{allowSocialWrites:true},{allowStripeCheckout:true},{allowFounderVideoAttachment:true},{allowFounderAdditionalWorkspace:true,founderAdditionalWorkspace:wsPin,allowFounderOnboarding:false}])assert.throws(make(patch),/./,JSON.stringify(patch));
 assert.throws(()=>kit({mode:'workspace',patch:{founderAssetIntake:scope}}),/./);
});
