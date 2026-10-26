const express=require('express');const {ZodError}=require('zod');const {Scope}=require('../social-publishing/service');const {extractBearerToken}=require('../authentication');const {AuthenticationRequiredError}=require('../authorization');const {QuoteError}=require('../generation-quotes/service');
function createCreativeIntelligenceRouter({service=null,growth=null,tokenVerifier}){
 const r=express.Router();r.use(require('../authentication/privateResponse').privateResponse);
 const split=input=>{const {tenant_id,project_id,brand_id,...payload}=input||{};return {scope:Scope.parse({tenant_id,project_id,brand_id}),payload};};
 const run=fn=>async(req,res)=>{try{const actor=await tokenVerifier.verifyAccessToken(extractBearerToken(req.header('authorization')));if(!service)throw new QuoteError('CREATIVE_INTELLIGENCE_UNAVAILABLE',503);const b=split(req.method==='GET'?req.query:req.body);return res.json(await fn(actor,b,req));}catch(e){res.status(e instanceof AuthenticationRequiredError?401:e instanceof ZodError?400:e instanceof QuoteError?e.status:503).json({error:{code:e instanceof AuthenticationRequiredError?'AUTHENTICATION_REQUIRED':e instanceof ZodError?'VALIDATION_ERROR':e instanceof QuoteError?e.code:'CREATIVE_INTELLIGENCE_UNAVAILABLE',message:'Creative intelligence is unavailable'}});}};
 r.get('/growth',async(req,res)=>{try{const a=await tokenVerifier.verifyAccessToken(extractBearerToken(req.header('authorization')));if(!growth)throw new QuoteError('GROWTH_UNAVAILABLE',503);res.json(await growth.read(a,req.query));}catch(e){res.status(e instanceof AuthenticationRequiredError?401:e instanceof QuoteError?e.status:503).json({error:{code:e instanceof AuthenticationRequiredError?'AUTHENTICATION_REQUIRED':e instanceof QuoteError?e.code:'GROWTH_UNAVAILABLE',message:'Growth overview unavailable'}});}});
 r.get('/content-dna',run((a,b)=>service.dna(a,b.scope,b.payload)));
 r.get('/experiments',run((a,b)=>service.list(a,b.scope,b.payload)));
 r.post('/experiments',run((a,b)=>service.save(a,b.scope,b.payload)));
 r.post('/experiments/:id/evaluate',run((a,b,q)=>{if(Object.keys(b.payload).length)throw new QuoteError('VALIDATION_ERROR',400);return service.evaluate(a,b.scope,q.params.id);}));
 r.post('/evaluations/:id/recommendation',run((a,b,q)=>{if(Object.keys(b.payload).length)throw new QuoteError('VALIDATION_ERROR',400);return service.recommend(a,b.scope,q.params.id);}));
 return r;
}
module.exports={createCreativeIntelligenceRouter};
