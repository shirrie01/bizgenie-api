const express=require('express');const {z}=require('zod');const {identifier}=require('../schema');const {AuthenticationRequiredError,AuthorizationDeniedError}=require('../../authorization');
function createDraftInvoiceRouter({authorizeTenantRequest,repository,stripe,enabled=false}){
 const router=express.Router();router.get('/',async(req,res)=>{try{
  const q=z.object({tenant_id:identifier,limit:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().regex(/^in_[A-Za-z0-9]+$/).optional()}).strict().safeParse(req.query);if(!q.success)return res.status(400).json({error:{code:'BILLING_VALIDATION_ERROR',message:'Request validation failed'}});
  const auth=await authorizeTenantRequest(req,{action:'billing:checkout'});if(auth.actor?.kind!=='customer'||auth.membership_role!=='owner'||auth.action!=='billing:checkout'||auth.tenant_id!==q.data.tenant_id)throw new AuthorizationDeniedError();
  if(!enabled||!stripe)throw Error('disabled');const customer=await repository.getStripeCustomerByTenant(auth.tenant_id);if(!customer||customer.livemode!==false)throw Error('unsupported mapping');
  const result=await stripe.invoices.list({customer:customer.stripe_customer_id,limit:q.data.limit,...(q.data.cursor?{starting_after:q.data.cursor}:{})});
  if(!Array.isArray(result.data)||result.data.length>q.data.limit||typeof result.has_more!=='boolean'||result.has_more&&!result.data.length)throw Error('invalid invoice page');
  const invoices=result.data.map(i=>{
   const owner=typeof i.customer==='string'?i.customer:i.customer?.id;
   if(owner!==customer.stripe_customer_id||i.livemode!==false||!/^in_[A-Za-z0-9]+$/.test(i.id)||!Number.isSafeInteger(i.created)||i.created<=0||!Number.isSafeInteger(i.total)||!/^[a-zA-Z]{3}$/.test(i.currency)||!['paid','open','void','uncollectible','draft'].includes(i.status))throw Error('invalid invoice');
   let url=null;if(i.hosted_invoice_url){const parsed=new URL(i.hosted_invoice_url);if(parsed.protocol!=='https:'||parsed.hostname!=='invoice.stripe.com'||parsed.username||parsed.password||parsed.port)throw Error('unsafe invoice link');url=parsed.href;}
   return {invoice_id:i.id,number:i.number??null,issued_at:new Date(i.created*1000).toISOString(),amount_minor:i.total,currency:i.currency.toUpperCase(),status:i.status,hosted_invoice_url:url,receipt_url:null};
  });
  const current=await authorizeTenantRequest(req,{action:'billing:checkout'});if(current.actor?.kind!=='customer'||current.membership_role!=='owner'||current.tenant_id!==auth.tenant_id||current.actor.auth_user_id!==auth.actor.auth_user_id)throw new AuthorizationDeniedError();
  return res.json({contract_version:'billing-invoices.v1',invoices,next_cursor:result.has_more?result.data.at(-1).id:null});
 }catch(error){if(error instanceof AuthenticationRequiredError)return res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Customer authentication is required'}});if(error instanceof AuthorizationDeniedError)return res.status(404).json({error:{code:'RESOURCE_NOT_AVAILABLE',message:'The requested resource is not available'}});return res.status(503).json({error:{code:'BILLING_INVOICES_UNAVAILABLE',message:'Invoices are temporarily unavailable'}});}});return router;
}
module.exports={createDraftInvoiceRouter};
