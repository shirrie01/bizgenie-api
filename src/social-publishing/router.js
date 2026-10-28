const express=require('express');const {ZodError}=require('zod');const {extractBearerToken}=require('../authentication');const {AuthenticationRequiredError}=require('../authorization');const {QuoteError}=require('../generation-quotes/service');const {Scope}=require('./service');
function createSocialRouter({service=null,tokenVerifier}){const r=express.Router();r.use(require('../authentication/privateResponse').privateResponse);const run=fn=>async(req,res)=>{try{const actor=await tokenVerifier.verifyAccessToken(extractBearerToken(req.header('authorization')));if(!service)throw new QuoteError('SOCIAL_NOT_CONFIGURED',503);return res.json(await fn(actor,req));}catch(e){return res.status(e instanceof AuthenticationRequiredError?401:e instanceof ZodError?400:e instanceof QuoteError?e.status:503).json({error:{code:e instanceof AuthenticationRequiredError?'AUTHENTICATION_REQUIRED':e instanceof ZodError?'VALIDATION_ERROR':e instanceof QuoteError?e.code:'SOCIAL_UNAVAILABLE',message:'Social connection or publication is unavailable'}});}};
 const split=input=>{const {tenant_id,project_id,brand_id,...payload}=input;return {scope:Scope.parse({tenant_id,project_id,brand_id}),payload};};
 r.get('/connections',run((a,q)=>{const {scope,payload}=split(q.query);return service.listConnections(a,scope,{limit:payload.limit?Number(payload.limit):25,cursor:payload.cursor||null});}));
 r.post('/oauth-intents',run((a,q)=>{const {scope,payload}=split(q.body);return service.oauthIntent(a,scope,payload);}));
 r.post('/oauth-complete',run((a,q)=>{const {scope,payload}=split(q.body);return service.connect(a,scope,payload);}));
 r.post('/connections/:id/disconnect',run((a,q)=>service.disconnect(a,q.params.id,Scope.parse(q.body))));
 r.get('/calendar',run((a,q)=>{const {scope,payload}=split(q.query);return service.calendar(a,scope,payload);}));
 r.get('/dispatches',run((a,q)=>{const {scope,payload}=split(q.query);return service.list(a,scope,{limit:payload.limit?Number(payload.limit):25,cursor:payload.cursor||null});}));
 r.post('/dispatches',run((a,q)=>{const {scope,payload}=split(q.body);return service.enqueue(a,scope,payload);}));
 r.post('/dispatches/:id/cancel',run((a,q)=>service.cancel(a,q.params.id,Scope.parse(q.body))));
 return r;}
module.exports={createSocialRouter};
