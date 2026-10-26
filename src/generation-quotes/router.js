const express=require('express');const {extractBearerToken}=require('../authentication');const {AuthenticationRequiredError}=require('../authorization');const {QuoteError}=require('./service');const {InsufficientCreditsError}=require('../billing/errors');
function createGenerationQuoteRouter({service=null,tokenVerifier}){const router=express.Router();router.use(express.json({limit:'16kb'}));
 const route=operation=>async(req,res)=>{try{const actor=await tokenVerifier.verifyAccessToken(extractBearerToken(req.header('authorization')));if(!service)throw new QuoteError('GENERATION_BILLING_UNAVAILABLE',503);const result=await operation(actor,req);return res.status(req.method==='GET'?200:req.path.endsWith('/confirm')?202:req.path.endsWith('/cancel')?200:201).json(result);}catch(error){const status=error instanceof AuthenticationRequiredError?401:error instanceof QuoteError?error.status:error instanceof InsufficientCreditsError?402:503;return res.status(status).json({error:{code:status===401?'AUTHENTICATION_REQUIRED':error instanceof InsufficientCreditsError?'GENERATION_CREDITS_UNAVAILABLE':error instanceof QuoteError?error.code:'GENERATION_BILLING_UNAVAILABLE',message:'Generation quote or execution is not available'}});}};
 router.post('/',route((actor,req)=>service.quote(actor,req.body)));
 router.get('/:quoteId',route((actor,req)=>service.status(actor,req.params.quoteId)));
 router.post('/:quoteId/confirm',route((actor,req)=>service.confirm(actor,req.params.quoteId,req.body)));
 router.post('/:quoteId/cancel',route((actor,req)=>service.cancel(actor,req.params.quoteId)));
 return router;}
module.exports={createGenerationQuoteRouter};
