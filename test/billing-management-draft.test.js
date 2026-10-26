const assert=require('node:assert/strict');const {it}=require('node:test');const request=require('supertest');const express=require('express');
const {createDraftBillingManagementRouter}=require('../src/billing/stripe/managementDraft');
function fixture({role='owner',enabled=true,revoked=false,foreign=false,live=false,url='https://billing.stripe.com/p/session'}={}){
 let calls=0,auths=0;const sessions=[];const auth={actor:{kind:'customer',auth_user_id:'owner'},tenant_id:'tenant_a',membership_role:role,action:'billing:checkout'};
 const opts={enabled,configurationId:'bpc_synthetic',returnUrl:'https://example.test/billing',authorizeTenantRequest:async()=>({...auth,membership_role:revoked&&auths++?'member':role}),
 repository:{getStripeCustomerByTenant:async()=>({stripe_customer_id:'cus_a',livemode:live}),getActiveEntitlement:async()=>({stripe_subscription_ref:'sub_a'})},
 stripe:{subscriptions:{retrieve:async()=>({id:'sub_a',customer:foreign?'cus_foreign':'cus_a',livemode:false,items:{data:[{id:'si_a'}]}})},billingPortal:{sessions:{create:async(p,o)=>{calls++;sessions.push({p,o});return {url};}}}},
 catalog:{mode:'test',stripeMapping:()=>({priceId:'price_test',policyId:'synthetic'})}};
 const app=express();app.use('/management',createDraftBillingManagementRouter(opts));return {app,calls:()=>calls,sessions};
}
it('draft owner portal/change/cancel sends fixed hosted flows and never confirms entitlement or writes a ledger',async()=>{
 const f=fixture();for(const op of ['portal-session','subscription/change','subscription/cancel']){const r=await request(f.app).post('/management/'+op).send({request_id:'same',...(op.endsWith('change')?{plan_code:'pro'}:{})});assert.equal(r.status,201);assert.equal(r.body.entitlement_confirmed,false);}
 assert.equal(f.calls(),3);assert.equal(f.sessions[1].p.flow_data.type,'subscription_update_confirm');assert.equal(f.sessions[2].p.flow_data.type,'subscription_cancel');
 const again=await request(f.app).post('/management/portal-session').send({request_id:'same'});assert.equal(again.status,201);assert.equal(f.sessions[0].o.idempotencyKey,f.sessions[3].o.idempotencyKey);
});
it('members, mid-request revocation, disabled composition, live and foreign customers fail before session creation',async()=>{
 for(const [opts,status] of [[{role:'member'},404],[{revoked:true},404],[{enabled:false},503],[{live:true},404],[{foreign:true},409]]){const f=fixture(opts);const r=await request(f.app).post('/management/subscription/cancel').send({request_id:'test'});assert.equal(r.status,status);assert.equal(f.calls(),0);}
});
it('client price/return URL injection fails; an unsafe provider response is never returned',async()=>{
 const f=fixture();for(const extra of [{price_id:'price_bad'},{return_url:'https://evil.test'}]){const r=await request(f.app).post('/management/portal-session').send({request_id:'test',...extra});assert.equal(r.status,400);}assert.equal(f.calls(),0);
 const bad=await request(fixture({url:'https://evil.test/x'}).app).post('/management/portal-session').send({request_id:'test'});assert.equal(bad.status,409);assert.equal(bad.body.portal_url,undefined);
});
