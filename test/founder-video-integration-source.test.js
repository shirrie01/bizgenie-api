const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),fs=require('node:fs');
const {apiVideoConfig,bridgeVideoConfig}=require('../src/provider-spend/founderVideoConfig');
const {createFounderSpendPool,createFounderVideoRuntime}=require('../src/provider-spend/founderVideoRuntime');
const {createPremiumComposition}=require('../src/activation/premiumComposition');
const {SUBMIT,RECONCILE,MODEL}=require('../src/provider-spend/founderVideo');
const {founder,target}=require('./helpers/founder-bridge');
const {apiEnv,bridgeEnv,mockPools,estimate,binding,now}=require('./helpers/founder-video-runtime');
test('API and bridge profiles are default OFF and fail closed on incomplete or contradictory settings',()=>{
 assert.equal(apiVideoConfig({}),null);assert.equal(bridgeVideoConfig({}),null);assert.deepEqual(apiVideoConfig(apiEnv()).founder,binding);assert.deepEqual(bridgeVideoConfig(bridgeEnv()),binding);
 for(const [k,v]of [['GOOGLE_CLOUD_PROJECT','production-project'],['GCLOUD_PROJECT','production-project'],['FOUNDER_VIDEO_ACCEPTANCE_ENABLED','yes'],['BIZGENIE_ENVIRONMENT','production'],['VIDEO_GENERATION_ENABLED','false'],['QUOTED_GENERATION_ENABLED','false'],['MEDIA_STORAGE_ENABLED','false'],['VIDEO_INSPECTION_ISOLATION','local'],['VIDEO_PROVIDER_OUTPUT_STORAGE_URI',''],['FOUNDER_VIDEO_AUTH_USER_ID',''],['FOUNDER_VIDEO_APPROVAL_REF','UNKNOWN'],['VIDEO_DURATION_SECONDS','8'],['STRIPE_BILLING_ENABLED','true'],['SOCIAL_PUBLISHING_ENABLED','true'],['IMAGE_GENERATION_ENABLED','true']])assert.throws(()=>apiVideoConfig({...apiEnv(),[k]:v}),k);
 assert.throws(()=>apiVideoConfig({...apiEnv(),FOUNDER_VIDEO_ACCEPTANCE_ENABLED:'false'}));
 for(const [k,v]of [['BG_BRIDGE_ALLOW_FOUNDER_VIDEO','TRUE'],['BG_BRIDGE_FOUNDER_VIDEO_CAMPAIGN_ID','bad'],['BG_BRIDGE_FOUNDER_VIDEO_APPROVAL_REF','UNRESOLVED'],['BIZGENIE_ENVIRONMENT','production']])assert.throws(()=>bridgeVideoConfig({...bridgeEnv(),[k]:v}));
});
test('existing bridge entrypoint wires parsed profile; missing identity denies before IAM',async()=>{
 const {fromEnv}=require('../scripts/staging/studio-bridge');const app=fromEnv(bridgeEnv());
 assert.equal((await request(app).post('/customer/generation-quotes').send({})).status,401);
 for(const k of ['BG_BRIDGE_ALLOW_WRITES','BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION','BG_BRIDGE_ALLOW_SOCIAL_WRITES','BG_BRIDGE_ALLOW_STRIPE_CHECKOUT'])assert.throws(()=>fromEnv({...bridgeEnv(),[k]:'true'}));
});
test('spend pool source uses same database endpoint and explicit least-privilege role, without credential output',()=>{
 let options;const env={...apiEnv(),BRAND_BRAIN_DATABASE_URL:'postgres://app:synthetic@localhost/db',PROVIDER_SPEND_DATABASE_URL:'postgres://spend:synthetic@localhost/db'};
 createFounderSpendPool({env,Pool:class{constructor(v){options=v;}}});assert.equal(options.options,'-c role=bizgenie_provider_spend_runtime');assert.equal(options.max,2);
 for(const url of [undefined,'postgres://x:synthetic@elsewhere/db','postgres://x:synthetic@localhost/other','not-a-url'])assert.throws(()=>createFounderSpendPool({env:{...env,PROVIDER_SPEND_DATABASE_URL:url}}),{code:'FOUNDER_VIDEO_SPEND_POOL_REQUIRED'});
});
test('runtime validates actual effective role and policy/cohort using read-only mocked queries; default has no I/O',async()=>{
 assert.equal(await createFounderVideoRuntime({}),null);
 await assert.rejects(createFounderVideoRuntime({config:apiVideoConfig(apiEnv()),applicationPool:{query:async()=>{throw Error('sensitive-connection-string');}},spendPool:{}}),e=>e.code==='FOUNDER_VIDEO_RUNTIME_UNAVAILABLE'&&!e.message.includes('sensitive'));
 const pools=mockPools(),r=await createFounderVideoRuntime({config:apiVideoConfig(apiEnv()),...pools});assert.deepEqual(r.quoteOptions.founderVideo,binding);assert.deepEqual(r.bridgeOptions.founderVideo,binding);
 assert.equal((await r.operationsForRow())[SUBMIT].estimateVersion,'submit.v1');assert.ok(!pools.sql.some(q=>/^\s*(insert|update|delete|create|alter|truncate)/i.test(q)));
 for(const over of [{role:{role:'postgres'}},{role:{rolbypassrls:true}},{role:{has_memberships:true}},{role:{database_name:'wrong'}},{policy:{version:'not-approved'}},{tenant:'other'}])await assert.rejects(createFounderVideoRuntime({config:apiVideoConfig(apiEnv()),...mockPools(over)}));
 const unsafe=mockPools();unsafe.policy.estimates[RECONCILE]=estimate(100,'request','status.v1');await assert.rejects(createFounderVideoRuntime({config:apiVideoConfig(apiEnv()),...unsafe}),{code:'FOUNDER_VIDEO_CAP_EXHAUSTED'});
});
test('premium API composition connects founder quote guard to fenced worker transport and refuses missing dependencies',async()=>{
 const env=apiEnv(),pools=mockPools();
 const args={env,pool:pools.applicationPool,founderVideoSpendPool:pools.spendPool,billing:{billingRepository:{pool:pools.applicationPool}},brandBrainRepository:{},videoGenerationRepository:{},media:{videoEnabled:true,imageEnabled:false,mediaEnabled:true,videoProvider:{},videoAssetStore:{},videoReferenceAssetLoader:{},mediaAssetRepository:{}},logger:{log(){}}};
 const premium=await createPremiumComposition(args);assert.deepEqual(premium.generationQuoteService.founderVideo,binding);assert.equal(premium.generationWorker.quotes,premium.generationQuoteService);assert.equal(typeof premium.generationWorker.providerScope,'function');assert.equal(premium.generationWorker.statusPollMinIntervalMs,25000);assert.deepEqual(Object.keys(premium.generationQuoteService.profiles),['video.normal']);
 for(const change of [{founderVideoSpendPool:null},{providerSpend:{}},{env:{...env,FOUNDER_VIDEO_TENANT_ID:undefined}},{media:{...args.media,imageEnabled:true}}])await assert.rejects(createPremiumComposition({...args,...change}));
});
test('API startup rejects incomplete founder opt-in before database creation or secret lookup',async()=>{
 const {createProductionApp}=require('../index');await assert.rejects(createProductionApp({env:{FOUNDER_VIDEO_ACCEPTANCE_ENABLED:'true'}}),{code:'FOUNDER_VIDEO_CONFIGURATION_INVALID'});
});
