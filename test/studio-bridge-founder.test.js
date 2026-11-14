const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createStudioBridge,founder,other,target,writes}=require('./helpers/founder-bridge');
const scope={tenant_id:'t',project_id:'p',brand_id:'b'};
function kit(over={},response){
 const calls=[],iam=[];
 const verify=async t=>{if(!['founder','other'].includes(t))throw Error('invalid');return {kind:'customer',auth_user_id:t==='founder'?founder:other,trusted_scope:scope};};
 const app=createStudioBridge({target:{...target,...over},tokenVerifier:{verifyIdentityAccessToken:verify,verifyAccessToken:verify},iamTokenProvider:async()=>{iam.push(1);return 'synthetic_iam';},fetchImpl:async(url,init)=>{calls.push({url,init});return response?.()||Response.json({status:'ready'});}});
 return {app,calls,iam};
}
const call=(k,m,p,t='founder',body={})=>{let r=request(k.app)[m.toLowerCase()](p);if(t)r=r.set('authorization','Bearer '+t);return r.send(body);};
test('founder permission absent/off is denied and malformed/unsafe configuration cannot start',async()=>{
 for(const v of [undefined,false]){const k=kit({allowFounderOnboarding:v,founderAuthUserId:undefined});for(const [m,p]of writes)assert.equal((await call(k,m,p)).status,403);assert.equal(k.calls.length,0);}
 for(const bad of [{allowFounderOnboarding:'true'},{allowFounderOnboarding:1},{founderAuthUserId:undefined},{founderAuthUserId:''},{founderAuthUserId:other+' '},{founderAuthUserId:founder+'\n'},{founderAuthUserId:123},{founderAuthUserId:'founder@example.test'},{environment:'production'},{environment:'preview'},{environment:undefined},...['allowWrites','allowWorkspaceBootstrap','allowDraftWorkflow','allowGenerationConfirmation','allowSocialWrites','allowStripeCheckout'].map(k=>({[k]:true}))])assert.throws(()=>kit(bad));
 const {fromEnv}=require('../scripts/staging/studio-bridge');for(const v of ['TRUE','1',' true','yes',''])assert.throws(()=>fromEnv({BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:v}));
});
test('verified founder alone reaches the exact routes; identity spoofing never reaches IAM',async()=>{
 const k=kit();for(const [m,p]of writes){assert.equal((await call(k,m,p)).status,200);for(const t of ['other','expired','invalid',null]){const r=await call(k,m,p,t,{auth_user_id:founder});assert.equal(r.status,t==='other'?403:401);}}
 assert.equal(k.calls.length,3);assert.equal(k.iam.length,3);
 const forged=await request(k.app).post(writes[0][1]).set('authorization','Bearer other').set('x-user-id',founder).set('x-founder-id',founder).send({});assert.equal(forged.status,403);assert.equal(k.calls.length,3);
});
test('only exact methods/URLs admit writes, and all other allowlisted write categories stay closed',async()=>{
 const k=kit();for(const [m,p]of writes){for(const suffix of ['?auth_user_id='+founder,'/','/extra','%2f','%3f','//'])assert.ok([403,404].includes((await call(k,m,p+suffix)).status));for(const wrong of ['POST','PUT','PATCH','DELETE'].filter(x=>x!==m))assert.ok([403,404].includes((await call(k,wrong,p)).status));}
 const u='11111111-1111-4111-8111-111111111111';
 const denied=[['POST','/billing/stripe/checkout'],['POST','/customer/workspace/select'],['POST','/customer/workspace/brands'],['POST','/customer/generation-quotes'],['POST','/customer/campaign-recommendations'],['POST','/customer/campaigns'],['PATCH','/customer/campaigns/'+u],['DELETE','/customer/assets/'+u],['POST','/customer/assets/uploads'],['PUT','/customer/assets/uploads/'+u+'/bytes']];
 for(const action of ['confirm','cancel'])denied.push(['POST','/customer/generation-quotes/'+u+'/'+action]);
 for(const action of ['attach','cancel'])denied.push(['POST','/customer/creative-jobs/quoted:fixture/'+action]);
 for(const action of ['archive','restore','content-items'])denied.push(['POST','/customer/campaigns/'+u+'/'+action]);
 for(const action of ['review','preview-renders','preview-acknowledgements','approval','schedule','reschedule','unschedule','measurements'])denied.push(['POST','/customer/campaigns/'+u+'/variants/'+u+'/'+action]);
 for(const action of ['complete','revoke'])denied.push(['POST','/customer/assets/'+u+'/'+action]);
 for(const path of ['oauth-intents','oauth-complete','connections/'+u+'/refresh','connections/'+u+'/disconnect','dispatches','dispatches/'+u+'/cancel'])denied.push(['POST','/customer/social/'+path]);
 assert.equal(denied.length,33);
 for(const [m,p]of denied){const r=await call(k,m,p);assert.equal(r.status,403,p);assert.equal(r.body.error.code,'STAGING_WRITES_DISABLED');}assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);
});
test('existing origin, preflight, read, scope, input and response protections remain intact',async()=>{
 const k=kit();assert.equal((await request(k.app).options(writes[0][1]).set('origin',target.origin).set('access-control-request-method','POST').set('access-control-request-headers','authorization,content-type')).status,204);
 assert.equal((await request(k.app).get('/customer/workspace').set('authorization','Bearer other')).status,200);
 assert.equal((await request(k.app).head('/customer/workspace').set('authorization','Bearer other')).status,200);
 assert.equal((await request(k.app).post(writes[0][1]).set('origin','https://foreign.test').send({})).status,403);
 for(const [m,p]of writes){assert.equal((await call(k,m,p,'founder',{tenant_id:'foreign'})).status,p.endsWith('bootstrap')?200:404);assert.equal((await call(k,m,p,'founder',{text:'x'.repeat(p.endsWith('bootstrap')?2048:102400)})).status,413);assert.equal((await request(k.app)[m.toLowerCase()](p).set('authorization','Bearer founder').set('content-type','application/json').send('{broken')).status,400);}
 for(const status of [403,409,422,503]){const x=kit({},()=>Response.json({error:{code:'SYNTHETIC_API_DENIAL'}},{status}));const r=await call(x,'PUT',writes[1][1]);assert.equal(r.status,status);assert.equal(r.body.error.code,'SYNTHETIC_API_DENIAL');}
 const rate=kit({maxRequests:1});assert.equal((await call(rate,...writes[0])).status,200);assert.equal((await call(rate,...writes[0])).status,429);
});
test('server entrypoint wires explicit environment permission; default remains closed',async()=>{
 const {fromEnv}=require('../scripts/staging/studio-bridge');
 const env={BIZGENIE_ENVIRONMENT:'staging',SUPABASE_URL:'https://zrczojyxebwjgpymbmgu.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',BG_BRIDGE_TARGET_URL:target.upstream,BG_BRIDGE_AUDIENCE:target.audience,BG_BRIDGE_REVISION:target.revision,BG_BRIDGE_SOURCE_SHA:target.sourceSha,BG_BRIDGE_REVIEW_REF:target.reviewRef,BG_BRIDGE_STUDIO_ORIGIN:target.origin};
 for(const v of [undefined,'false','true']){const app=fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:v,...(v==='true'?{BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder}:{})});const r=await request(app).post('/customer/workspace/bootstrap').send({});assert.equal(r.status,v==='true'?401:403);}
 assert.throws(()=>fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true'}));
 assert.throws(()=>fromEnv({...env,BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING:'true',BG_BRIDGE_FOUNDER_AUTH_USER_ID:founder,BG_BRIDGE_ALLOW_WRITES:'true'}));
});
for(const [method,path] of writes)test(`verified non-founder ${method} ${path} consumes the identity rate allowance before denial`,async()=>{
 const k=kit({maxRequests:1});
 const first=await call(k,method,path,'other');assert.equal(first.status,403);assert.equal(first.body.error.code,'STAGING_WRITES_DISABLED');
 const excess=await call(k,method,path,'other');assert.equal(excess.status,429);assert.equal(excess.body.error.code,'BRIDGE_RATE_LIMITED');
 assert.equal((await call(k,'GET','/customer/workspace','other')).status,429,'writes and reads share the same identity budget');
 assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);
 // Denied identity cannot exhaust the founder identity's independent allowance.
 assert.equal((await call(k,method,path,'founder')).status,200);
 const founderExcess=await call(k,method,path,'founder');assert.equal(founderExcess.status,429);assert.equal(founderExcess.body.error.code,'BRIDGE_RATE_LIMITED');
 assert.equal(k.iam.length,1);assert.equal(k.calls.length,1);
});
test('unauthenticated and unrelated denied writes do not acquire or exhaust a verified identity budget',async()=>{
 const k=kit({maxRequests:1});
 for(const [method,path]of writes)for(const token of [null,'expired'])assert.equal((await call(k,method,path,token)).status,401);
 for(let i=0;i<2;i++){const denied=await call(k,'POST','/customer/workspace/select','founder');assert.equal(denied.status,403);assert.equal(denied.body.error.code,'STAGING_WRITES_DISABLED');}
 assert.equal(k.iam.length,0);assert.equal(k.calls.length,0);
 assert.equal((await call(k,...writes[0],'founder')).status,200);
 assert.equal((await call(k,...writes[0],'founder')).status,429);
 assert.equal(k.iam.length,1);assert.equal(k.calls.length,1);
});
