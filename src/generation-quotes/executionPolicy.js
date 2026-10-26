const {AsyncLocalStorage}=require('node:async_hooks');const {extractBearerToken}=require('../authentication');const {QuoteError}=require('./service');
class GenerationExecutionPolicy{
 constructor({mode='legacy',quoteService=null}={}){if(!['legacy','quoted_v1'].includes(mode))throw new TypeError('Unknown generation execution policy');if(mode==='quoted_v1'&&!quoteService)throw new TypeError('Durable quote service required');this.mode=mode;this.quotes=quoteService;this.context=new AsyncLocalStorage();}
 guard(operation,jobOf=null){if(this.mode==='legacy')return operation;const policy=this;return async function(...args){const claim=policy.context.getStore();if(!claim?.active||claim.used||jobOf&&jobOf(args[0])!==claim.job_id)throw new QuoteError('DURABLE_EXECUTION_REQUIRED',503);claim.used=true;return operation.apply(this,args);};}
 provider(provider,method){if(this.mode==='legacy')return provider;const wrapped=Object.create(provider);if(Number.isInteger(provider.maxAttempts))wrapped.maxAttempts=1;wrapped[method]=this.guard(function(input){return provider[method].call(wrapped,input);},input=>input?.metadata?.generation_job_id);return wrapped;}
 async runClaim(claim,operation){if(this.mode==='legacy')return operation();return this.quotes.billing.withTransaction(async client=>{
  const r=await client.query("select claim_token,fence from public.generation_execution_claims where job_id=$1 and state='calling' for share",[claim.job_id]);
  if(r.rowCount!==1||r.rows[0].claim_token!==claim.token||Number(r.rows[0].fence)!==claim.fence)throw new QuoteError('EXECUTION_FENCE_STALE');
  // Hold the fence lock over the one external submit boundary. Recovery/finalization cannot race it.
  const capability={...claim,active:true,used:false};try{return await this.context.run(capability,operation);}finally{capability.active=false;}
 });}
 legacyBoundary({tokenVerifier,requireAdmin}){return async(req,res,next)=>{
  if(this.mode==='legacy')return next();
  const admin=['/generate-script','/generate-image','/generate-video'].some(p=>req.path===p||req.path.startsWith(p+'/'));
  const customer=/^\/customer\/generate-(script|image|video)(\/|$)/.test(req.path)||/^\/customer\/campaigns\/[^/]+\/variants\/[^/]+\/generate\/?$/.test(req.path);
  if(!admin&&!customer)return next();
  const deny=()=>res.status(428).json({error:{code:'DURABLE_CONFIRMATION_REQUIRED',message:'Use a durable generation quote and explicit confirmation'}});
  if(admin)return requireAdmin(req,res,deny);
  try{await tokenVerifier.verifyAccessToken(extractBearerToken(req.header('authorization')));return deny();}
  catch{return res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Customer authentication is required'}});}
 };}
}
module.exports={GenerationExecutionPolicy};
