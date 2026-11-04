// Reusable synthetic customer package. Only runs inside the existing disposable quote-proof fixture.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),request=require('supertest');
const {context}=require('./campaign-regressions');
const {localMediaKit}=require('./customer-media-local');
const {linkedinFixture}=require('./linkedin-local');
const {PostgresGenerationQuoteService}=require('../../src/generation-quotes/service');
const {FencedGenerationWorker}=require('../../src/generation-quotes/worker');
const {PostgresPreviewRegistry}=require('../../src/campaigns');
const {PostgresBrandBrainRepository}=require('../../src/brand-brain');
const {PostgresCustomerWorkspaceRepository}=require('../../src/customer-workspace');
const {PostgresWorkspaceOnboardingRepository}=require('../../src/workspace-onboarding');
const {PostgresAuthorizationRepository,AuthenticationRequiredError}=require('../../src/authorization');
const {DurableMediaAssetStore}=require('../../src/media');
const {createApp}=require('../../index');
async function customerDataset({pool,billing,campaigns,now}){
 const connection=new URL(pool.options.connectionString);if(!['localhost','127.0.0.1','[::1]'].includes(connection.hostname))throw Error('Synthetic dataset refuses non-local PostgreSQL');
 const db=(await pool.query('select current_database() name')).rows[0].name;
 if(!/^quote_proof_[a-f0-9]{32}$/.test(db))throw Error('Synthetic dataset requires the existing disposable quote-proof DB; no shared seed path');
 const PNG=require('node:child_process').execFileSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=beige:s=640x640','-frames:v','1','-threads','1','-f','image2pipe','-c:v','png','pipe:1'],{maxBuffer:1024*1024});
 const beforeBalance=await billing.readBalance('tenant_a');
 const scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'},owner={...context.actor,trusted_scope:scope},foreignId=randomUUID(),memberId=randomUUID(),suffix=randomUUID().replaceAll('-','');
 const foreignScope={tenant_id:'launch_foreign_'+suffix,project_id:'launch_project_'+suffix,brand_id:'launch_brand_'+suffix};
 for(const id of [foreignId,memberId]){await pool.query('insert into auth.users(id) values($1)',[id]);await pool.query('insert into customer_profiles(auth_user_id) values($1)',[id]);}
 await pool.query('insert into tenants(tenant_id,name,created_by)values($1,$2,$3)',[foreignScope.tenant_id,'Fictional unrelated workshop',foreignId]);
 await pool.query('insert into tenant_memberships(tenant_id,auth_user_id,role) values($1,$2,$3),($4,$5,$6)',[foreignScope.tenant_id,foreignId,'owner',scope.tenant_id,memberId,'member']);
 await pool.query('insert into projects(project_id,tenant_id,name)values($1,$2,$3)',[foreignScope.project_id,foreignScope.tenant_id,'Fictional workspace']);
 await pool.query("insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at)values($1,$2,'Unrelated fictional brand',1,'approved',now(),now())",[foreignScope.brand_id,foreignScope.project_id]);
 const members={owner,member:{kind:'customer',auth_user_id:memberId,trusted_scope:scope},foreign:{kind:'customer',auth_user_id:foreignId,trusted_scope:foreignScope}};
 const registry=new PostgresPreviewRegistry({pool,now});campaigns.resolvePreviewReceipt=registry.resolvePreviewReceipt.bind(registry);campaigns.validatePreview=registry.validatePreview.bind(registry);
 const quotes=new PostgresGenerationQuoteService({billingRepository:billing,profiles:{'image.normal':{id:'synthetic.image',version:1,provider_model:'fixture-only',aspect_ratio:'1:1'}},now});
 const kit=localMediaKit({pool,billing,now}),store=new DurableMediaAssetStore({mediaKind:'image',repository:kit.assets,storage:kit.storage,now,requireImageValidation:true});
 const social=await linkedinFixture({pool,billing,campaigns,now,posting:false});await social.service.disconnect(owner,social.connection.connection_id,scope);
 const expired=await linkedinFixture({pool,billing,campaigns,now:()=>new Date(now().getTime()-7200000),posting:false});
 const tokenVerifier={async verifyAccessToken(token){if(!members[token])throw new AuthenticationRequiredError();return members[token];},async verifyIdentityAccessToken(token){return this.verifyAccessToken(token);}};
 const app=createApp({env:{},logger:{warn(){},error(){},info(){}},authorizationRepository:new PostgresAuthorizationRepository({pool}),
  brandBrainRepository:new PostgresBrandBrainRepository({pool}),customerWorkspaceRepository:new PostgresCustomerWorkspaceRepository({pool}),
  workspaceOnboardingRepository:new PostgresWorkspaceOnboardingRepository({pool}),customerTokenVerifier:tokenVerifier,campaignRepository:campaigns,
  previewRegistry:registry,generationQuoteService:quotes,billingRepository:billing,mediaPreviewStorage:kit.storage,socialPublishingService:social.service,
  corsConfig:{enabled:true,allowedOrigins:['https://staging-app.getbizgenie.com']}});
 const http=request(app),evidence=[];
 async function call(id,method,path,body,who='owner',expected=200){let r=http[method](path);if(who)r=r.set('authorization','Bearer '+who);if(body)r=r.send(body);const result=await r;assert.equal(result.status,expected,id+': '+JSON.stringify(result.body));if(result.status<300&&require('../../docs/contracts/BG_LAUNCH_012_CUSTOMER_API.json').endpoints.some(x=>x.id===id))require('./launch-contract-assertions')(id,result);if(result.status>=400)assert.equal(typeof result.body.error?.code,'string');evidence.push({id,status:result.status,expected});return result;}
 const brain=await call('brand_read','get','/customer/workspace/brand-brain');
 await call('brand_save','put','/customer/workspace/brand-brain',{name:'Cedar and Finch Studio',identity:{description:'We are a fictional workshop making hand-crafted furniture for local customers.'}});
 await call('onboarding','get','/customer/workspace/onboarding');
 await call('onboarding_save','put','/customer/workspace/onboarding',{idempotency_key:randomUUID(),expected_version:0,sector_key:'professional_services',sector_source:'customer',channels:['instagram','linkedin'],channels_source:'customer',current_step:2,draft:{description:'We are a fictional workshop making hand-crafted furniture for local customers.'},complete:true});
 let campaign=(await call('campaign_create','post','/customer/campaigns',{tenant_id:scope.tenant_id,project_id:scope.project_id,idempotency_key:randomUUID(),brand_id:scope.brand_id,name:'Fictional autumn collection',goal:'Local enquiries',display_timezone:'UTC'},'owner',201)).body.campaign;
 const item=await call('content_item','post','/customer/campaigns/'+campaign.campaign_id+'/content-items',{tenant_id:scope.tenant_id,project_id:scope.project_id,idempotency_key:randomUUID(),expected_campaign_version:campaign.version,name:'Workshop image',format:'image',platform:'instagram',placement:'feed',destination_label:'Fictional workshop',initial_content:{title:null,body:'Discover our fictional autumn collection.',caption:null,alt_text:'A synthetic fixture image.',asset_refs:[]}},'owner',201);campaign=item.body.campaign;
 const variantId=item.body.result.created_ids.variant_ids[0],quoteBody={tenant_id:scope.tenant_id,project_id:scope.project_id,campaign_id:campaign.campaign_id,variant_id:variantId,expected_campaign_version:campaign.version,execution_class:'image.normal',execution_mode:'ai',execution_brief:'A synthetic fixture image of our fictional workshop; no paid provider.',idempotency_key:randomUUID()};
 const {execution_brief:brief,...withoutBrief}=quoteBody;const missing=await call('brief_missing','post','/customer/generation-quotes',withoutBrief,'owner',422);assert.equal(missing.body.error.code,'CREATIVE_BRIEF_REQUIRED');
 const quote=(await call('generation_quote','post','/customer/generation-quotes',quoteBody,'owner',201)).body,confirmBody={idempotency_key:randomUUID(),max_credits:quote.credits,confirmed:true};
 const confirmed=(await call('generation_confirm','post','/customer/generation-quotes/'+quote.quote_id+'/confirm',confirmBody,'owner',202)).body;
 const replay=(await call('generation_confirm','post','/customer/generation-quotes/'+quote.quote_id+'/confirm',confirmBody,'owner',202)).body;assert.equal(replay.job_id,confirmed.job_id);assert.equal(replay.replay,true);
 let submits=0;const worker=new FencedGenerationWorker({quoteService:quotes,provider:{submit:async()=>{submits++;const saved=await store.save({data:PNG,mime_type:'image/png',width:640,height:640,lineage:{tenant_id:scope.tenant_id,project_id:scope.project_id,generation_job_id:confirmed.job_id,generation_id:'synthetic_'+randomUUID()}});return {status:'succeeded',result:{asset_id:saved.asset_id,provenance:{origin:'synthetic_test_fixture'}}};}}});
 const claim=await worker.claim(confirmed.job_id);await worker.run(claim);assert.equal(submits,1);
 const jobPath='/customer/creative-jobs/'+encodeURIComponent(confirmed.job_id),qs=new URLSearchParams(scope).toString();
 await call('creative_job','get',jobPath+'?'+qs);
 const attached=(await call('creative_attach','post',jobPath+'/attach',scope)).body;const association=attached.association;
 campaign=(await call('campaign_get','get','/customer/campaigns/'+campaign.campaign_id+'?'+new URLSearchParams({tenant_id:scope.tenant_id,project_id:scope.project_id}))).body.campaign;
 const prefix='/customer/campaigns/'+campaign.campaign_id+'/variants/'+variantId;
 async function cmd(id,payload){const r=await call(id,'post',prefix+'/'+id,{tenant_id:scope.tenant_id,project_id:scope.project_id,idempotency_key:randomUUID(),expected_campaign_version:campaign.version,...payload});campaign=r.body.campaign;return r.body;}
 await cmd('review',{revision_id:association.revision_id});
 const receipt=(await call('preview-renders','post',prefix+'/preview-renders',{tenant_id:scope.tenant_id,project_id:scope.project_id,idempotency_key:randomUUID(),revision_id:association.revision_id},'owner',201)).body.preview;
 const ack=await cmd('preview-acknowledgements',{revision_id:association.revision_id,render_receipt_id:receipt.render_receipt_id,acknowledged:true});
 const approved=await cmd('approval',{revision_id:association.revision_id,preview_id:ack.result.created_ids.preview_ids[0],approved:true});
 const due=new Date(now().getTime()+3600000);await cmd('schedule',{revision_id:association.revision_id,scheduled_for:due.toISOString(),timezone:'UTC',local_datetime:due.toISOString().slice(0,-1),utc_offset_minutes:0});
 return {app,http,call,evidence,scope,members,quotes,quote,confirmed,beforeBalance,association,campaign,variantId,PNG,kit,submits,
  descriptor:{contract_version:'bizgenie.synthetic-customer.v1',synthetic:true,tenant:scope.tenant_id,user:owner.auth_user_id,business:'Cedar and Finch Studio',campaign_id:campaign.campaign_id,variant_id:variantId,revision_id:association.revision_id,job_id:confirmed.job_id,quote_id:quote.quote_id,asset_id:attached.outputs[0].asset_id,review_state:'approved',workflow:'scheduled',review:{render_receipt_id:receipt.render_receipt_id,preview_id:ack.result.created_ids.preview_ids[0],approval_id:approved.result.created_ids.approval_ids[0]},calendar_at:due.toISOString(),disconnected_connection:social.connection.connection_id,reconnect_connection:expired.connection.connection_id,credit_balance:(await billing.readBalance(scope.tenant_id)).available_balance,usage_history:(await pool.query('select entry_type,amount,balance_delta,reserved_delta from credit_ledger where generation_id=$1 order by created_at,ledger_entry_id',[confirmed.job_id])).rows,pricing_authority:'synthetic fixture only; not commercial canon'}};
}
module.exports={customerDataset};
