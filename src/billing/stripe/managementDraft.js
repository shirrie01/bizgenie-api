const express=require('express');
const {z}=require('zod');
const {createHash}=require('node:crypto');
const {identifier}=require('../schema');
const {AuthenticationRequiredError,AuthorizationDeniedError}=require('../../authorization');
const {StripeBillingConfigurationError,StripeBillingResourceUnavailableError,StripeBillingConflictError,sendStripeBillingError}=require('./errors');
const requestSchema=z.object({request_id:identifier}).strict();
// Intentionally unmounted and disabled. The draft adapter is exercised only with injected mock clients.
// Any production/test Stripe composition requires a separately reviewed activation and commercial-policy gate.
function createDraftBillingManagementRouter({authorizeTenantRequest,repository,stripe,catalog,configurationId,returnUrl,enabled=false}) {
 const router=express.Router();
 const safeReturn=z.string().url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;});
 async function session(req,res,next,operation){
  try {
   const auth=await authorizeTenantRequest(req,{action:'billing:checkout'});
   if(auth.actor?.kind!=='customer'||auth.membership_role!=='owner'||auth.action!=='billing:checkout')throw new AuthorizationDeniedError();
   const body=(operation==='change'?requestSchema.extend({plan_code:z.enum(['standard','pro'])}).strict():requestSchema).safeParse(req.body);
   if(!body.success)return res.status(400).json({error:{code:'STRIPE_BILLING_VALIDATION_ERROR',message:'Billing request validation failed'}});
   if(!enabled||!stripe||!repository||!/^bpc_[A-Za-z0-9]+$/.test(configurationId)||!safeReturn.safeParse(returnUrl).success)throw new StripeBillingConfigurationError();
   const customer=await repository.getStripeCustomerByTenant(auth.tenant_id);
   // This prototype deliberately refuses live customer mappings, even if accidentally composed.
   if(!customer||customer.livemode!==false||!/^cus_[A-Za-z0-9]+$/.test(customer.stripe_customer_id))throw new StripeBillingResourceUnavailableError();
   const params={customer:customer.stripe_customer_id,configuration:configurationId,return_url:returnUrl};
   if(operation!=='portal') {
    const entitlement=await repository.getActiveEntitlement(auth.tenant_id,new Date().toISOString());
    if(!entitlement?.stripe_subscription_ref)throw new StripeBillingResourceUnavailableError();
    const subscription=await stripe.subscriptions.retrieve(entitlement.stripe_subscription_ref);
    const customerId=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
    if(subscription.id!==entitlement.stripe_subscription_ref||subscription.livemode!==false||customerId!==customer.stripe_customer_id)throw new StripeBillingConflictError();
    if(operation==='cancel')params.flow_data={type:'subscription_cancel',subscription_cancel:{subscription:subscription.id}};
    else {
     if(!catalog||catalog.mode!=='test')throw new StripeBillingConfigurationError();const plan=catalog.stripeMapping(body.data.plan_code);
     const items=subscription.items?.data;if(items?.length!==1||!/^si_[A-Za-z0-9]+$/.test(items[0].id))throw new StripeBillingConflictError();
     params.flow_data={type:'subscription_update_confirm',subscription_update_confirm:{subscription:subscription.id,items:[{id:items[0].id,price:plan.priceId}]}};
    }
   }
   // Recheck authority after awaits and immediately before creating the hosted session.
   const current=await authorizeTenantRequest(req,{action:'billing:checkout'});
   if(current.actor?.kind!=='customer'||current.tenant_id!==auth.tenant_id||current.actor?.auth_user_id!==auth.actor.auth_user_id||current.membership_role!=='owner'||current.action!=='billing:checkout')throw new AuthorizationDeniedError();
   const key=createHash('sha256').update(JSON.stringify([auth.tenant_id,auth.actor.auth_user_id,operation,body.data.request_id])).digest('hex');
   const result=await stripe.billingPortal.sessions.create(params,{idempotencyKey:`bizgenie:management:test:${key}`});
   const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='billing.stripe.com'||url.port||url.username||url.password)throw new StripeBillingConflictError();
   return res.status(201).json({status:'confirmation_required',portal_url:url.href,entitlement_confirmed:false});
  }catch(error){if(sendStripeBillingError(error,res))return;if(error instanceof AuthenticationRequiredError)return res.status(401).json({error:{code:'AUTHENTICATION_REQUIRED',message:'Customer authentication is required'}});if(error instanceof AuthorizationDeniedError)return res.status(404).json({error:{code:'RESOURCE_NOT_AVAILABLE',message:'The requested resource is not available'}});return res.status(503).json({error:{code:'BILLING_MANAGEMENT_UNAVAILABLE',message:'Billing management is temporarily unavailable'}});}
 }
 router.use(express.json({limit:'8kb'}));
 router.post('/portal-session',(req,res,next)=>session(req,res,next,'portal'));
 router.post('/subscription/change',(req,res,next)=>session(req,res,next,'change'));
 router.post('/subscription/cancel',(req,res,next)=>session(req,res,next,'cancel'));
 // Invoices/receipts stay inside Stripe's authenticated hosted portal, not arbitrary caller URL fetches.
 return router;
}
module.exports={createDraftBillingManagementRouter};
