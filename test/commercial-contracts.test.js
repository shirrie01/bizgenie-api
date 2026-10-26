const assert=require('node:assert/strict');
const {it}=require('node:test');
const express=require('express');const request=require('supertest');
const {CommercialCatalog}=require('../src/billing/commercialCatalog');
const {createCustomerBillingRouter}=require('../src/billing/customerRouter');
const {AuthenticationRequiredError,AuthorizationDeniedError}=require('../src/authorization');
// Entirely synthetic contract fixtures, not approved BizGenie prices/allowances.
const now=()=>new Date('2026-10-26T12:00:00Z');
const policy={policy_id:'synthetic-policy',plan_code:'standard',policy_version:1,status:'active',included_monthly_credits:3,bolt_on_eligible:false,effective_from:'2026-10-01T00:00:00Z',effective_to:null,execution_costs:{'text.generate':2}};
const plan={plan_code:'standard',plan_version:1,amount_minor:123,currency:'GBP',billing_cadence:'month',tax:{presentation:'exclusive',jurisdiction:'TEST',wording:'Synthetic fixture only'},credit_grant_cadence:'month',included_credits:3,policy_id:policy.policy_id,entitlement_codes:['synthetic.access'],effective_from:policy.effective_from,effective_to:null,terms:{version:'synthetic.v1',url:'https://example.test/terms',cancellation_url:'https://example.test/cancel',refund_url:'https://example.test/refund'},approval:{decision:'SYNTHETIC-NOT-APPROVED',source:'https://example.test/evidence',approved_at:policy.effective_from},stripe:{mode:'test',price_id:'price_synthetic'}};
function catalog(p=plan,pol=policy){return new CommercialCatalog({plans:[p],policies:[pol],mode:'test',now});}
it('catalogue requires complete server-owned commercial data and an exact policy/mode mapping',()=>{
 const c=catalog();const out=c.read();assert.equal(out.plans[0].amount_minor,123);assert.equal(out.plans[0].stripe,undefined);out.plans[0].amount_minor=999;assert.equal(c.read().plans[0].amount_minor,123);
 assert.deepEqual(c.stripeMapping('standard'),{priceId:'price_synthetic',policyId:policy.policy_id,planVersion:1});
 for(const bad of [{...plan,amount_minor:-1},{...plan,terms:undefined},{...plan,approval:undefined},{...plan,stripe:{...plan.stripe,mode:'live'}},{...plan,included_credits:100},{...plan,unknown:true}])assert.throws(()=>catalog(bad));
 assert.throws(()=>catalog({...plan,effective_to:'2026-10-02T00:00:00Z'}).read());
 assert.throws(()=>catalog(plan,{...policy,effective_to:'2026-10-02T00:00:00Z'}).read());
 assert.throws(()=>new CommercialCatalog({plans:[plan,{...plan,stripe:{...plan.stripe,price_id:'price_second'}}],policies:[policy],mode:'test',now}).read());
});
function app({available=5,configured=true}={}) {
 let writes=0;const repository={
 getActiveEntitlement:async()=>({tenant_id:'tenant_a',plan_code:'standard',policy_id:policy.policy_id,entitlement_id:'entitlement_a'}),
 getCommercialPolicy:async()=>policy,readBalance:async()=>({available_balance:available}),
 createReservation(){writes++;throw Error('Must not reserve');},appendLedger(){writes++;throw Error('Must not debit');}};
 const api=express();api.use('/customer/billing',createCustomerBillingRouter({repository,commercialCatalog:configured?catalog():null,now,
 tokenVerifier:{verifyAccessToken:async token=>{if(token!=='ok')throw new AuthenticationRequiredError();return {kind:'customer',auth_user_id:'owner'};}},
 authorizationService:{authorizeTenant:async({tenantId})=>{if(tenantId!=='tenant_a')throw new AuthorizationDeniedError();return {tenant_id:tenantId};},authorizeProjectBrand:async({tenantId,projectId,brandId,action})=>{assert.equal(action,'generation:create');if(tenantId!=='tenant_a'||projectId!=='project_a'||brandId!=='brand_a')throw new AuthorizationDeniedError();return {tenant_id:tenantId,project_id:projectId,brand_id:brandId};}},logger:{}}));
 return {api,writes:()=>writes};
}
it('plans endpoint fails closed without canon and authorizes before disclosure',async()=>{
 const {api}=app();assert.equal((await request(api).get('/customer/billing/plans?tenant_id=tenant_a')).status,401);
 assert.equal((await request(api).get('/customer/billing/plans?tenant_id=foreign').set('authorization','Bearer ok')).status,404);
 assert.equal((await request(api).get('/customer/billing/plans?tenant_id=tenant_a').set('authorization','Bearer ok')).status,200);
 const response=await request(app({configured:false}).api).get('/customer/billing/plans?tenant_id=tenant_a').set('authorization','Bearer ok');assert.equal(response.status,503);assert.equal(response.body.error.code,'COMMERCIAL_CATALOG_UNAVAILABLE');
});
it('cost preview reads the existing policy/balance, enforces scope, and cannot reserve, debit or execute',async()=>{
 const {api,writes}=app();const q={tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a',execution_class:'text.generate',spend_cap:2};
 const get=extra=>request(api).get('/customer/billing/credit-preview').query({...q,...extra}).set('authorization','Bearer ok');
 const response=await get({});assert.equal(response.status,200);assert.equal(response.body.credit_cost,2);assert.equal(response.body.reserved,false);assert.equal(response.body.execution_authorized,false);assert.equal(response.body.confirmation_supported,false);assert.equal(response.body.affordability,'within_limit');
 assert.equal((await get({spend_cap:1})).body.affordability,'spend_cap_exceeded');assert.equal((await get({brand_id:'foreign'})).status,404);assert.equal((await get({credit_cost:0})).status,400);assert.equal((await get({execution_class:'unknown.operation'})).status,503);
 const poor=await request(app({available:0}).api).get('/customer/billing/credit-preview').query(q).set('authorization','Bearer ok');assert.equal(poor.body.affordability,'insufficient_credits');assert.equal(writes(),0);
 const results=await Promise.all(Array.from({length:10},()=>get({})));assert.ok(results.every(r=>r.body.credit_cost===2));assert.equal(writes(),0);
});
