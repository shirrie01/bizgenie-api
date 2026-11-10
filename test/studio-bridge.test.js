const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge}=require('../src/studio-bridge/service');
const target={environment:'staging',revision:'bizgenie-api-staging-00030-pob',sourceSha:'a'.repeat(40),reviewRef:'synthetic_review',upstream:'https://accept---bizgenie-api-staging-abc-ew.a.run.app',audience:'https://bizgenie-api-staging-abc-ew.a.run.app',origin:'https://staging-app.getbizgenie.com',allowWrites:true};
function kit(over={}){const state={},calls=[],iamCalls=[],scope={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'},tokenVerifier={async verifyIdentityAccessToken(t){if(t!=='valid'&&t!=='fresh')throw Error('synthetic_secret');return {kind:'customer',auth_user_id:'synthetic_owner'};},async verifyAccessToken(t){const a=await this.verifyIdentityAccessToken(t);return {...a,trusted_scope:scope};}};
 const app=createStudioBridge({target:{...target,...over},tokenVerifier,iamTokenProvider:async x=>{iamCalls.push(x);return 'synthetic_private_iam';},fetchImpl:async(url,init)=>{calls.push({url,init});state.onCall?.();if(state.wait)await state.wait;if(state.error)throw state.error;if(state.response)return state.response;return Response.json({status:'ready'},{headers:{'content-type':'application/json'}});}});
 return {app,calls,iamCalls,scope,state};}
test('bridge keeps IAM/customer identities separate, bounds route/target and preserves API response',async()=>{const k=kit(),r=await request(k.app).get('/customer/workspace').set('authorization','Bearer valid').set('origin',target.origin).set('cookie','ordinary-browser-cookie');assert.equal(r.status,200);assert.equal(k.calls[0].init.headers.Authorization,'Bearer valid');assert.equal(k.calls[0].init.headers['X-Serverless-Authorization'],'Bearer synthetic_private_iam');assert.equal(k.calls[0].init.headers.cookie,undefined);assert.equal(k.calls[0].init.redirect,'error');assert.doesNotMatch(JSON.stringify(r.body),/synthetic_private_iam/);assert.match(r.headers['cache-control'],/no-store/);});
test('bridge refuses production, untagged or arbitrary targets and invalid configuration before listening',()=>{for(const over of [{environment:'production'},{revision:'bizgenie-apii-00126-vaw'},{upstream:'https://example.test'},{upstream:target.audience},{upstream:'https://tag---bizgenie-api-staging-wrongbizgenie-api-staging-abc-ew.a.run.app'},{audience:'https://bizgenie-apii-abc-ew.a.run.app'},{maxConcurrent:100},{origin:'https://attacker.example'}])assert.throws(()=>kit(over));});
test('invalid/expired sessions, foreign origins, privileged headers and wrong scope never reach IAM/upstream',async()=>{for(const mode of ['missing','expired','origin','header','tenant','project','brand']){const k=kit();let r=request(k.app).get('/customer/campaigns/11111111-1111-4111-8111-111111111111?'+new URLSearchParams({...k.scope,...(['tenant','project','brand'].includes(mode)?{[mode+'_id']:'foreign'}:{})}));if(mode!=='missing')r=r.set('authorization','Bearer '+(mode==='expired'?'expired':'valid'));if(mode==='origin')r=r.set('origin','https://attacker.example');if(mode==='header')r=r.set('x-serverless-authorization','Bearer forged');const result=await r;assert.ok([400,401,403,404].includes(result.status),mode);assert.equal(k.iamCalls.length,0,mode);assert.equal(k.calls.length,0,mode);assert.doesNotMatch(JSON.stringify(result.body),/synthetic_secret/);}});
test('bridge preflight is exact and cannot authorize arbitrary paths or privileged browser headers',async()=>{const k=kit();const p=h=>request(k.app).options('/customer/assets/11111111-1111-4111-8111-111111111111').set('origin',target.origin).set('access-control-request-method','DELETE').set('access-control-request-headers',h);assert.equal((await p('authorization')).status,204);assert.equal((await p('authorization,x-serverless-authorization')).status,403);for(const path of ['/_admin/ping','/customer/generate-video/a','/customer/social/oauth/callback/tiktok','/customer/%2e%2e/_admin'])assert.equal((await request(k.app).get(path).set('authorization','Bearer valid')).status,404);assert.equal(k.calls.length,0);});
test('read-only default, generation and social write gates remain closed and JSON/upload limits apply',async()=>{const ro=kit({allowWrites:false});assert.equal((await request(ro.app).post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({})).status,403);const k=kit();assert.equal((await request(k.app).post('/customer/generation-quotes/1111/confirm').set('authorization','Bearer valid').send({})).status,403);assert.equal((await request(k.app).post('/customer/social/oauth-intents').set('authorization','Bearer valid').send(k.scope)).status,403);assert.equal((await request(k.app).put('/customer/workspace/brand-brain').set('authorization','Bearer valid').send({description:'x'.repeat(110000)})).status,413);assert.equal(k.calls.length,0);});
test('verified fresh identity can reach existing bootstrap without manufactured trusted scope',async()=>{const k=kit();const r=await request(k.app).post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({business_name:'Fictional workshop'});assert.equal(r.status,200);assert.equal(k.calls.length,1);assert.equal(JSON.parse(k.calls[0].init.body).business_name,'Fictional workshop');});
test('bridge applies per-identity rate bounds without new infrastructure',async()=>{const k=kit({maxRequests:1});assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer valid')).status,200);assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer valid')).status,429);assert.equal(k.calls.length,1);});
test('upstream failures, redirects, HTML and oversized responses fail safely without credential diagnostics',async()=>{
 for(const mode of ['error','redirect','html','size']){const k=kit();if(mode==='error')k.state.error=Error('synthetic_private_iam');if(mode==='redirect')k.state.response=new Response(null,{status:302,headers:{location:'https://production.example'}});if(mode==='html')k.state.response=new Response('<script>secret</script>',{headers:{'content-type':'text/html'}});if(mode==='size')k.state.response=new Response('{}',{headers:{'content-type':'application/json','content-length':'1048577'}});const r=await request(k.app).get('/customer/workspace').set('authorization','Bearer valid');assert.equal(r.status,502,mode);assert.equal(r.body.error.code,'PRIVATE_API_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r.body),/synthetic_private|production.example|script/);}
});
test('concurrency and request deadline bound even an unresponsive upstream',async()=>{
 const k=kit({maxConcurrent:1,timeoutMs:100});let entered;const ready=new Promise(r=>entered=r);k.state.onCall=entered;k.state.wait=new Promise(()=>{});
 const first=request(k.app).get('/customer/workspace').set('authorization','Bearer valid').then(r=>r);await ready;
 assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer valid')).status,429);
 const timed=await first;assert.equal(timed.status,504);assert.equal(timed.body.error.code,'STUDIO_BRIDGE_TIMEOUT');assert.equal(k.calls.length,1);
});
test('default server IAM adapter accepts only the reviewed staging principal and audience, never browser credentials',async()=>{
 const {createExistingInvokerProvider}=require('../scripts/staging/studio-bridge');
 for(const mode of ['staging','production','wrong_audience']){const payload={email:mode==='production'?'production@example.test':'bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com',aud:mode==='wrong_audience'?'production':target.audience,exp:Math.floor(Date.now()/1000)+3600},token='e30.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.synthetic';
  class FakeVertex {constructor(){this.googleAuth={getIdTokenClient:async audience=>{assert.equal(audience,target.audience);return {getRequestHeaders:async()=>({authorization:'Bearer '+token})};}};}}
  const provider=createExistingInvokerProvider({project:'bizgenie-backend',audience:target.audience,VertexAI:FakeVertex});if(mode==='staging')assert.equal(await provider(),token);else await assert.rejects(provider());
 }
});
test('raw upload bytes and range headers are forwarded without JSON wrapping or browser cookies',async()=>{
 const k=kit(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);const r=await request(k.app).put('/customer/assets/uploads/11111111-1111-4111-8111-111111111111/bytes?'+new URLSearchParams(k.scope)).set('authorization','Bearer valid').set('content-type','image/png').set('cookie','ignored').send(bytes);assert.equal(r.status,200);assert.deepEqual(k.calls[0].init.body,bytes);assert.equal(k.calls[0].init.headers['content-type'],'image/png');assert.equal(k.calls[0].init.headers.cookie,undefined);
 const range=kit();await request(range.app).get('/customer/campaigns/11111111-1111-4111-8111-111111111111/variants/11111111-1111-4111-8111-111111111111/revisions/11111111-1111-4111-8111-111111111111/assets/11111111-1111-4111-8111-111111111111/preview?'+new URLSearchParams(range.scope)).set('authorization','Bearer valid').set('range','bytes=0-7');assert.equal(range.calls[0].init.headers.range,'bytes=0-7');
});

test('confirmed Pages staging origin has exact GET/bootstrap preflights with authentication preserved',async()=>{
 const origin='https://bizgenie-studio-staging.pages.dev',k=kit({origin});
 for(const [path,method] of [['/customer/workspace','GET'],['/customer/workspace/bootstrap','POST']]){
  const r=await request(k.app).options(path).set('origin',origin).set('access-control-request-method',method).set('access-control-request-headers','authorization,content-type');
  assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],origin);assert.equal(r.headers['access-control-allow-methods'],method);assert.equal(k.iamCalls.length,0);
 }
 const unauth=await request(k.app).get('/customer/workspace').set('origin',origin);
 assert.equal(unauth.status,401);assert.equal(unauth.headers['access-control-allow-origin'],origin);assert.equal(k.iamCalls.length,0);
 const valid=await request(k.app).get('/customer/workspace').set('origin',origin).set('authorization','Bearer valid');
 assert.equal(valid.status,200);assert.equal(valid.headers['access-control-allow-origin'],origin);assert.equal(k.calls[0].init.headers.Authorization,'Bearer valid');
 for(const foreign of ['https://preview.bizgenie-studio-staging.pages.dev','https://bizgenie-studio-staging.pages.dev.attacker.test','https://staging-app.getbizgenie.com']){
  assert.equal((await request(k.app).options('/customer/workspace').set('origin',foreign).set('access-control-request-method','GET')).status,403);
 }
 assert.throws(()=>kit({origin:'*'}));assert.throws(()=>kit({origin:'https://arbitrary.pages.dev'}));
});
test('Pages origin selection does not change staging-only target or bootstrap write gates',async()=>{
 const origin='https://bizgenie-studio-staging.pages.dev';assert.throws(()=>kit({origin,environment:'production'}));
 const k=kit({origin,allowWrites:false});const r=await request(k.app).post('/customer/workspace/bootstrap').set('origin',origin).set('authorization','Bearer fresh').send({business_name:'Synthetic test business'});
 assert.equal(r.status,403);assert.equal(r.body.error.code,'STAGING_WRITES_DISABLED');assert.equal(k.calls.length,0);
});

test('server entrypoint selects only an explicitly approved exact staging origin from environment',()=>{
 const {fromEnv}=require('../scripts/staging/studio-bridge');
 const env={BIZGENIE_ENVIRONMENT:'staging',SUPABASE_URL:'https://zrczojyxebwjgpymbmgu.supabase.co',SUPABASE_PUBLISHABLE_KEY:'synthetic_public_key',BG_BRIDGE_TARGET_URL:target.upstream,BG_BRIDGE_AUDIENCE:target.audience,BG_BRIDGE_REVISION:target.revision,BG_BRIDGE_SOURCE_SHA:target.sourceSha,BG_BRIDGE_REVIEW_REF:'synthetic_review'};
 assert.equal(typeof fromEnv({...env,BG_BRIDGE_STUDIO_ORIGIN:'https://bizgenie-studio-staging.pages.dev'}),'function');
 assert.equal(typeof fromEnv(env),'function');
 assert.throws(()=>fromEnv({...env,BG_BRIDGE_STUDIO_ORIGIN:'https://arbitrary.pages.dev'}));
});
test('workspace-only flag permits exact authenticated bootstrap POST with a 2 KiB byte cap',async()=>{
 const k=kit({allowWrites:false,allowWorkspaceBootstrap:true,allowGenerationConfirmation:false,allowSocialWrites:false,allowStripeCheckout:false});
 const path='/customer/workspace/bootstrap';
 assert.equal((await request(k.app).post(path).send({business_name:'Fixture'})).status,401);
 const start=JSON.stringify({business_name:'Synthetic property firm'}),exact=start+' '.repeat(2048-Buffer.byteLength(start));
 assert.equal((await request(k.app).post(path).set('authorization','Bearer fresh').set('content-type','application/json').send(exact)).status,200);
 assert.equal(JSON.parse(k.calls[0].init.body).business_name,'Synthetic property firm');assert.equal(k.calls[0].init.headers.Authorization,'Bearer fresh');
 for(const bytes of [exact+' ',JSON.stringify({business_name:'é'.repeat(1024)})])assert.equal((await request(k.app).post(path).set('authorization','Bearer fresh').set('content-type','application/json').send(bytes)).status,413);
 assert.equal(k.calls.length,1);assert.equal(k.iamCalls.length,1);
 for(const suffix of ['?other=1','/','/extra'])assert.ok([403,404].includes((await request(k.app).post(path+suffix).set('authorization','Bearer fresh').send({})).status));
 for(const method of ['put','patch','delete'])assert.equal((await request(k.app)[method](path).set('authorization','Bearer fresh').send({})).status,404);
 assert.equal(k.calls.length,1);
});
test('workspace-only flag leaves every other allowlisted write blocked before IAM',async()=>{
 const k=kit({allowWrites:false,allowWorkspaceBootstrap:true,allowGenerationConfirmation:false,allowSocialWrites:false,allowStripeCheckout:false}),u='11111111-1111-4111-8111-111111111111';
 const writes=[['POST','/billing/stripe/checkout'],['POST','/customer/workspace/select'],['POST','/customer/workspace/brands'],['PUT','/customer/workspace/brand-brain'],['PUT','/customer/workspace/onboarding'],['POST','/customer/generation-quotes'],['POST','/customer/campaign-recommendations'],['POST','/customer/campaigns'],['PATCH','/customer/campaigns/'+u],['DELETE','/customer/assets/'+u],['POST','/customer/assets/uploads'],['PUT','/customer/assets/uploads/'+u+'/bytes']];
 for(const action of ['confirm','cancel'])writes.push(['POST','/customer/generation-quotes/'+u+'/'+action]);
 for(const action of ['attach','cancel'])writes.push(['POST','/customer/creative-jobs/quoted:fixture/'+action]);
 for(const action of ['archive','restore','content-items'])writes.push(['POST','/customer/campaigns/'+u+'/'+action]);
 for(const action of ['review','preview-renders','preview-acknowledgements','approval','schedule','reschedule','unschedule','measurements'])writes.push(['POST','/customer/campaigns/'+u+'/variants/'+u+'/'+action]);
 for(const action of ['complete','revoke'])writes.push(['POST','/customer/assets/'+u+'/'+action]);
 for(const path of ['oauth-intents','oauth-complete','connections/'+u+'/refresh','connections/'+u+'/disconnect','dispatches','dispatches/'+u+'/cancel'])writes.push(['POST','/customer/social/'+path]);
 for(const [method,path] of writes){const r=await request(k.app)[method.toLowerCase()](path).set('authorization','Bearer valid').send({});assert.equal(r.status,403,method+' '+path);assert.equal(r.body.error.code,'STAGING_WRITES_DISABLED',path);}
 assert.equal(writes.length,35);assert.equal(k.calls.length,0);assert.equal(k.iamCalls.length,0);
});
test('workspace-only exception preserves GET HEAD and unauthenticated OPTIONS; default remains closed',async()=>{
 const k=kit({allowWrites:false,allowWorkspaceBootstrap:true});
 const p=await request(k.app).options('/customer/workspace/bootstrap').set('origin',target.origin).set('access-control-request-method','POST').set('access-control-request-headers','authorization,content-type');assert.equal(p.status,204);assert.equal(k.iamCalls.length,0);
 for(const method of ['get','head'])assert.equal((await request(k.app)[method]('/customer/workspace').set('authorization','Bearer valid')).status,200);
 const off=kit({allowWrites:false});assert.equal((await request(off.app).post('/customer/workspace/bootstrap').set('authorization','Bearer fresh').send({})).status,403);assert.equal(off.iamCalls.length,0);
});
test('draft workflow admits only12 exact deterministic writes and preserves request identities',async()=>{
 const k=kit({allowWrites:false,allowDraftWorkflow:true}),u='11111111-1111-4111-8111-111111111111';
 const allowed=[['PUT','/customer/workspace/brand-brain'],['PUT','/customer/workspace/onboarding'],['POST','/customer/campaign-recommendations'],['POST','/customer/campaigns'],['POST','/customer/campaigns/'+u+'/content-items']];
 for(const action of ['review','preview-renders','preview-acknowledgements','approval','schedule','reschedule','unschedule'])allowed.push(['POST','/customer/campaigns/'+u+'/variants/'+u+'/'+action]);
 for(const [method,path]of allowed){const r=await request(k.app)[method.toLowerCase()](path).set('authorization','Bearer valid').send({...k.scope,idempotency_key:'same_intent',expected_campaign_version:7});assert.equal(r.status,200,path);const body=JSON.parse(k.calls.at(-1).init.body);assert.equal(body.idempotency_key,'same_intent');assert.equal(body.expected_campaign_version,7);}
 assert.equal(allowed.length,12);
});
test('draft workflow never admits bootstrap providers credits uploads billing analytics or dispatch writes',async()=>{
 const k=kit({allowWrites:false,allowDraftWorkflow:true,allowWorkspaceBootstrap:false,allowGenerationConfirmation:false,allowSocialWrites:false,allowStripeCheckout:false}),u='11111111-1111-4111-8111-111111111111';
 const denied=[['POST','/billing/stripe/checkout'],['POST','/customer/workspace/bootstrap'],['POST','/customer/workspace/select'],['POST','/customer/workspace/brands'],['POST','/customer/generation-quotes'],['PATCH','/customer/campaigns/'+u],['DELETE','/customer/assets/'+u],['POST','/customer/assets/uploads'],['POST','/customer/assets/'+u+'/complete'],['POST','/customer/assets/'+u+'/revoke'],['PUT','/customer/assets/uploads/'+u+'/bytes'],['POST','/customer/campaigns/'+u+'/variants/'+u+'/measurements']];
 for(const action of ['confirm','cancel'])denied.push(['POST','/customer/generation-quotes/'+u+'/'+action]);
 for(const action of ['attach','cancel'])denied.push(['POST','/customer/creative-jobs/quoted:fixture/'+action]);
 for(const action of ['archive','restore'])denied.push(['POST','/customer/campaigns/'+u+'/'+action]);
 for(const path of ['oauth-intents','oauth-complete','connections/'+u+'/refresh','connections/'+u+'/disconnect','dispatches','dispatches/'+u+'/cancel'])denied.push(['POST','/customer/social/'+path]);
 for(const [method,path]of denied){const r=await request(k.app)[method.toLowerCase()](path).set('authorization','Bearer valid').send({});assert.equal(r.status,403,path);assert.equal(r.body.error.code,'STAGING_WRITES_DISABLED');}
 assert.equal(denied.length,24);assert.equal(k.calls.length,0);assert.equal(k.iamCalls.length,0);
});
test('draft workflow fails closed for absent flag foreign scope expired auth path suffix and large body',async()=>{
 const path='/customer/campaign-recommendations';const off=kit({allowWrites:false});assert.equal((await request(off.app).post(path).set('authorization','Bearer valid').send({})).status,403);
 const k=kit({allowWrites:false,allowDraftWorkflow:true});
 assert.equal((await request(k.app).post(path).set('authorization','Bearer expired').send({})).status,401);
 assert.equal((await request(k.app).post(path).set('authorization','Bearer valid').send({...k.scope,tenant_id:'foreign'})).status,404);
 assert.equal((await request(k.app).post(path+'?x=1').set('authorization','Bearer valid').send({})).status,403);
 assert.equal((await request(k.app).put('/customer/workspace/brand-brain').set('authorization','Bearer valid').send({description:'x'.repeat(17000)})).status,413);
 for(const p of ['/customer/generate-image','/customer/generate-video','/_admin/ping'])assert.equal((await request(k.app).post(p).set('authorization','Bearer valid').send({})).status,404);
 assert.equal(k.calls.length,0);assert.equal(k.iamCalls.length,0);
});
