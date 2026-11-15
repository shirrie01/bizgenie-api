// Source safety boundary only: these event types have no approved automatic credit/refund policy.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {StripeSubscriptionService}=require('../src/billing/stripe/service');
test('unapproved refund/dispute events cannot claim events or create financial effects',async()=>{
 let effects=0;
 const forbidden=async()=>{effects++;throw Error('No automatic financial policy authorised');};
 const service=new StripeSubscriptionService({stripe:{},repository:{beginStripeEvent:forbidden},billingService:{grantMonthlyCredits:forbidden,refund:forbidden,adjustCredits:forbidden},config:{mode:'test',plans:{}}});
 for(const type of ['charge.refunded','refund.updated','charge.dispute.created','charge.dispute.closed']){
  const result=await service.processVerifiedEvent({id:'evt_synthetic_'+type.replaceAll('.','_'),type,livemode:false,created:1,data:{object:{id:'synthetic',customer:'cus_synthetic'}}});
  assert.deepEqual(result,{handled:false,replay:false});
 }
 assert.equal(effects,0);
});
