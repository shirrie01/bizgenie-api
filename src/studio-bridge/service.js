'use strict';
// Staging-only trusted-server bridge. Customer auth stays distinct from the server's IAM identity.
const express=require('express');
const {pipeline}=require('node:stream/promises');const {Readable,Transform}=require('node:stream');
const {AuthenticationRequiredError}=require('../authorization');
const CheckoutBridgeSchema=require('../billing/stripe/service').CheckoutRequestSchema.extend({tenant_id:require('../billing/schema').identifier}).strict();
const UUID='[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const routes=[
 ['POST','/billing/stripe/checkout'],
 ['GET|HEAD','/customer/workspace(?:/brand-brain|/onboarding)?'],
 ['POST','/customer/workspace/(?:bootstrap|select|brands)'],['PUT','/customer/workspace/(?:brand-brain|onboarding)'],
 ['GET|HEAD','/customer/(?:calendar|assets|creative-jobs|social/(?:connections|dispatches|calendar)|billing/(?:subscription|plans|credit-preview))'],
 ['GET|HEAD','/customer/(?:generation-quotes/[a-f0-9-]+|creative-jobs/[A-Za-z0-9_:%-]+)'],
 ['POST','/customer/generation-quotes(?:/[a-f0-9-]+/(?:confirm|cancel))?'],['POST','/customer/creative-jobs/[A-Za-z0-9_:%-]+/(?:attach|cancel)'],
 ['POST','/customer/campaign-recommendations'],
 ['GET|HEAD|POST','/customer/campaigns'],['GET|HEAD','/customer/campaigns/discovery'],
 ['GET|HEAD|PATCH','/customer/campaigns/'+UUID],['POST','/customer/campaigns/'+UUID+'/(?:archive|restore|content-items)'],
 ['GET|HEAD','/customer/campaigns/'+UUID+'/(?:calendar|measurements|publication-history)'],
 ['GET|HEAD','/customer/campaigns/'+UUID+'/variants/'+UUID+'/creative-preview'],
 ['GET|HEAD','/customer/campaigns/'+UUID+'/variants/'+UUID+'/revisions/'+UUID+'/assets/'+UUID+'/preview'],
 ['POST','/customer/campaigns/'+UUID+'/variants/'+UUID+'/(?:review|preview-renders|preview-acknowledgements|approval|schedule|reschedule|unschedule|measurements)'],
 ['GET|HEAD|DELETE','/customer/assets/'+UUID],['GET|HEAD','/customer/assets/'+UUID+'/preview'],['POST','/customer/assets/(?:uploads|'+UUID+'/complete|'+UUID+'/revoke)'],['PUT','/customer/assets/uploads/'+UUID+'/bytes'],
 ['POST','/customer/social/(?:oauth-intents|oauth-complete|connections/'+UUID+'/(?:refresh|disconnect)|dispatches|dispatches/'+UUID+'/cancel)']
].map(([methods,path])=>({methods:new Set(methods.split('|')),path:new RegExp('^'+path+'$')}));
// Deterministic persisted draft/review/calendar only: never providers, credits or dispatch.
function isDraftWorkflowWrite(method,path){
 if(method==='PUT')return ['/customer/workspace/brand-brain','/customer/workspace/onboarding'].includes(path);
 if(method!=='POST')return false;
 if(['/customer/campaign-recommendations','/customer/campaigns'].includes(path))return true;
 return new RegExp('^/customer/campaigns/'+UUID+'/content-items$').test(path)||new RegExp('^/customer/campaigns/'+UUID+'/variants/'+UUID+'/(?:review|preview-renders|preview-acknowledgements|approval|schedule|reschedule|unschedule)$').test(path);
}
const IDENTITY=/^\/customer\/workspace(?:\/(?:bootstrap|select|brands))?$/;
const PRIVATE_HEADERS=['x-serverless-authorization','x-admin-key','x-api-key','proxy-authorization'];
function config(input){
 const c={maxRequests:60,maxIdentities:10000,maxConcurrent:8,timeoutMs:30000,...input};
 if(c.environment!=='staging'||!/^bizgenie-api-staging-[0-9]{5}-[a-z0-9]{3}$/.test(c.revision||'')||!c.reviewRef||!/^[a-f0-9]{40}$/.test(c.sourceSha||''))throw Error('Reviewed staging target required');
 const u=new URL(c.upstream),a=new URL(c.audience);
 if(!/^https:\/\/[a-z0-9-]+---bizgenie-api-staging-[a-z0-9-]+\.a\.run\.app$/.test(u.origin)||u.href!==u.origin+'/'||!/^https:\/\/bizgenie-api-staging-[a-z0-9-]+\.a\.run\.app$/.test(a.origin)||a.href!==a.origin+'/'||!u.hostname.endsWith('---'+a.hostname)||!['https://staging-app.getbizgenie.com','https://bizgenie-studio-staging.pages.dev'].includes(c.origin))throw Error('Pinned staging URLs and Studio origin required');
 for(const [key,lo,hi] of [['maxRequests',1,600],['maxIdentities',1,10000],['maxConcurrent',1,32],['timeoutMs',100,30000]])if(!Number.isInteger(c[key])||c[key]<lo||c[key]>hi)throw Error('Bounded bridge limits required');
 return {...c,upstream:u.origin,audience:a.origin};
}
function route(method,path){return routes.some(r=>r.methods.has(method)&&r.path.test(path));}
function bounded(promise,signal){return new Promise((resolve,reject)=>{const abort=()=>reject(Error('Request aborted'));if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
function createStudioBridge({target,tokenVerifier,iamTokenProvider,fetchImpl=globalThis.fetch,now=()=>Date.now()}){
 const c=config(target);if(!tokenVerifier?.verifyIdentityAccessToken||!tokenVerifier.verifyAccessToken||typeof iamTokenProvider!=='function')throw Error('Existing verified identity providers required');
 const app=express(),windows=new Map();let active=0;app.disable('x-powered-by');
 function failure(res,status,code){return res.status(status).json({error:{code,message:'Studio API request is unavailable'}});}
 app.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Authorization');res.vary('Origin');
  if(req.headers.origin&&req.headers.origin!==c.origin)return failure(res,403,'ORIGIN_FORBIDDEN');
  if(PRIVATE_HEADERS.some(k=>req.headers[k]!==undefined))return failure(res,400,'SERVER_HEADERS_FORBIDDEN');
  const raw=req.originalUrl.split('?')[0];if((!/^\/customer\//.test(raw)&&raw!=='/billing/stripe/checkout')||/\.\.|\\|\/\/|%(?!3[aA])/i.test(raw))return failure(res,404,'RESOURCE_NOT_AVAILABLE');
  const method=req.method==='OPTIONS'?req.header('access-control-request-method'):req.method;
  if(!route(method,raw))return failure(res,404,'RESOURCE_NOT_AVAILABLE');
  res.set('Access-Control-Allow-Origin',c.origin);res.set('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges');
  if(req.method==='OPTIONS'){
   if(req.headers.origin!==c.origin)return failure(res,403,'ORIGIN_FORBIDDEN');
   const requested=(req.header('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
   if(requested.some(x=>!['authorization','content-type','range'].includes(x)))return failure(res,403,'HEADERS_FORBIDDEN');
   res.set('Access-Control-Allow-Headers','authorization,content-type,range');res.set('Access-Control-Allow-Methods',method);return res.status(204).end();
  }
  if(!['GET','HEAD'].includes(req.method)&&c.allowWrites!==true&&!(c.allowWorkspaceBootstrap===true&&req.method==='POST'&&req.originalUrl==='/customer/workspace/bootstrap')&&!(c.allowDraftWorkflow===true&&req.originalUrl===raw&&isDraftWorkflowWrite(req.method,raw)))return failure(res,403,'STAGING_WRITES_DISABLED');
  if(raw==='/billing/stripe/checkout'&&c.allowStripeCheckout!==true)return failure(res,403,'STRIPE_CHECKOUT_DISABLED');
  if(/\/generation-quotes\/[^/]+\/confirm$/.test(raw)&&c.allowGenerationConfirmation!==true)return failure(res,403,'GENERATION_CONFIRMATION_DISABLED');
  if(/\/social\//.test(raw)&&req.method!=='GET'&&req.method!=='HEAD'&&c.allowSocialWrites!==true)return failure(res,403,'SOCIAL_WRITES_DISABLED');
  return next();
 });
 app.use((req,res,next)=>{if(active>=c.maxConcurrent)return failure(res,429,'BRIDGE_RATE_LIMITED');active++;const controller=new AbortController();res.locals.controller=controller;const timer=setTimeout(()=>{controller.abort();if(!res.headersSent)failure(res,504,'STUDIO_BRIDGE_TIMEOUT');else res.destroy();},c.timeoutMs);res.once('close',()=>{clearTimeout(timer);controller.abort();active--;});next();});
 app.use(async(req,res,next)=>{
  try{const match=/^Bearer ([^\s]+)$/.exec(req.header('authorization')||'');if(!match)throw new AuthenticationRequiredError();
   const actor=await bounded(IDENTITY.test(req.path)?tokenVerifier.verifyIdentityAccessToken(match[1]):tokenVerifier.verifyAccessToken(match[1]),res.locals.controller.signal);
   if(actor?.kind!=='customer'||!actor.auth_user_id)throw new AuthenticationRequiredError();res.locals.actor=actor;res.locals.customerToken=match[1];
   const at=now();for(const [id,w]of windows)if(at>=w.until)windows.delete(id);let w=windows.get(actor.auth_user_id);
   if(!w){if(windows.size>=c.maxIdentities)return failure(res,429,'BRIDGE_RATE_LIMITED');w={until:at+60000,used:0};windows.set(actor.auth_user_id,w);}
   if(++w.used>c.maxRequests)return failure(res,429,'BRIDGE_RATE_LIMITED');
   return next();
  }catch{if(!res.headersSent)return failure(res,401,'AUTHENTICATION_REQUIRED');}
 });
 const draftBody=express.raw({type:()=>true,limit:'16kb'}),bootstrapBody=express.raw({type:()=>true,limit:'2kb'}),jsonBody=express.raw({type:()=>true,limit:'100kb'}),checkoutBody=express.raw({type:()=>true,limit:'32kb'}),quoteBody=express.raw({type:()=>true,limit:'16kb'}),uploadBody=express.raw({type:()=>true,limit:'32mb'});app.use((req,res,next)=>(req.method==='POST'&&req.path==='/customer/workspace/bootstrap'?bootstrapBody:c.allowDraftWorkflow===true&&isDraftWorkflowWrite(req.method,req.path)?draftBody:req.method==='PUT'&&/\/assets\/uploads\//.test(req.path)?uploadBody:req.path==='/billing/stripe/checkout'?checkoutBody:req.path.startsWith('/customer/generation-quotes')?quoteBody:jsonBody)(req,res,next));
 app.use(async(req,res)=>{
  const controller=res.locals.controller;let upstream;
  const cancel=()=>controller.abort();req.once('aborted',cancel);res.once('close',cancel);
  try{
   let body=req.body;const isBytes=/\/assets\/uploads\//.test(req.path)&&req.method==='PUT';
   if(!isBytes&&body?.length){if(body.length>(req.path.startsWith('/customer/generation-quotes')?16384:102400))return failure(res,413,'BRIDGE_REQUEST_TOO_LARGE');if(!/^application\/json(?:;|$)/i.test(req.header('content-type')||''))return failure(res,415,'JSON_REQUIRED');try{body=JSON.parse(body.toString('utf8'));}catch{return failure(res,400,'VALIDATION_ERROR');}if(!body||typeof body!=='object'||Array.isArray(body))return failure(res,400,'VALIDATION_ERROR');}
   if(req.path==='/billing/stripe/checkout'&&!CheckoutBridgeSchema.safeParse(body).success)return failure(res,400,'STRIPE_BILLING_VALIDATION_ERROR');
   const scope=res.locals.actor.trusted_scope;
   if(!IDENTITY.test(req.path))for(const key of ['tenant_id','project_id','brand_id']){
    const values=[req.query[key],isBytes?undefined:body?.[key]].filter(v=>v!==undefined);
    if(values.some(v=>typeof v!=='string'||!scope||v!==scope[key]))return failure(res,404,'RESOURCE_NOT_AVAILABLE');
   }
   const credential=await bounded(iamTokenProvider({audience:c.audience}),controller.signal);
   if(typeof credential!=='string'||!credential||/[\r\n]/.test(credential))throw Error();
   const headers={Authorization:'Bearer '+res.locals.customerToken,'X-Serverless-Authorization':'Bearer '+credential};
   for(const key of ['content-type','range'])if(req.headers[key])headers[key]=req.headers[key];
   const input=body&&Buffer.isBuffer(body)?body:body?Buffer.from(JSON.stringify(body)):undefined;
   upstream=await bounded(fetchImpl(c.upstream+req.originalUrl,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:input,signal:controller.signal,redirect:'error',credentials:'omit'}),controller.signal);
   if(upstream.status>=300&&upstream.status<400)throw Error();
   const mime=(upstream.headers.get('content-type')||'').split(';')[0];if(upstream.body&&!['application/json','image/jpeg','image/png','image/webp','video/mp4'].includes(mime))throw Error();
   for(const key of ['content-type','content-length','content-range','accept-ranges','x-content-type-options','content-security-policy','content-disposition'])if(upstream.headers.get(key))res.set(key,upstream.headers.get(key));
   res.status(upstream.status);if(req.method==='HEAD'||!upstream.body)return res.end();
   const cap=/^image\//.test(upstream.headers.get('content-type')||'')?32*1024*1024:/^video\//.test(upstream.headers.get('content-type')||'')?8*1024*1024:1024*1024;
   const declared=upstream.headers.get('content-length');if(declared&&(!/^\d+$/.test(declared)||Number(declared)>cap))throw Error();let bytes=0;
   const bound=new Transform({transform(chunk,enc,done){bytes+=chunk.length;done(bytes>cap?Error():null,chunk);},flush(done){done(declared&&bytes!==Number(declared)?Error():null);}});
   await pipeline(Readable.fromWeb(upstream.body),bound,res,{signal:controller.signal});
  }catch{await upstream?.body?.cancel().catch(()=>{});if(res.writableEnded)return;if(res.headersSent)res.destroy();else{for(const key of ['content-length','content-type','content-range','content-disposition','content-security-policy'])res.removeHeader(key);failure(res,502,'PRIVATE_API_UNAVAILABLE');}}
  finally{req.off('aborted',cancel);res.off('close',cancel);controller.abort();}
 });
 app.use((e,req,res,next)=>{if(res.headersSent)return res.destroy();failure(res,e.type==='entity.too.large'?413:400,e.type==='entity.too.large'?'BRIDGE_REQUEST_TOO_LARGE':'VALIDATION_ERROR');});
 return app;
}
module.exports={createStudioBridge,validateBridgeTarget:config};
