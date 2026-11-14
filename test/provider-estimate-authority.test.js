const {test}=require('node:test');const assert=require('node:assert/strict');
const {requiredExposure,approvedEstimate}=require('../src/provider-spend/estimateAuthority');
const now=new Date('2026-11-13T12:00:00Z');
// Synthetic arithmetic only, not a provider quote or an approved FX rate.
const price=()=>({currency:'GBP',upper_bound_minor:100,authority:{native_currency:'USD',native_bound_minor:101,fees_gbp_minor:2,fx:{from:'USD',to:'GBP',numerator:3,denominator:4,source_ref:'synthetic.fx',version:'test.v1',valid_until:'2026-11-14T00:00:00Z'}}});
test('integer rational conversion rounds exposure up and includes explicit GBP fees',()=>{
 assert.equal(approvedEstimate(price(),new Date('invalid')),false);
 assert.equal(requiredExposure(price(),now),78n);assert.equal(approvedEstimate(price(),now),true);
 const p=price();p.upper_bound_minor=77;assert.equal(approvedEstimate(p,now),false);
});
test('missing/unsupported/stale FX or fees cannot be assumed free or identity',()=>{
 for(const mutate of [p=>delete p.authority,p=>delete p.authority.fx,p=>delete p.authority.fees_gbp_minor,p=>p.authority.native_currency='EUR',p=>p.authority.fx.to='USD',p=>p.authority.fx.numerator=0,p=>p.authority.fx.denominator=0,p=>p.authority.fx.numerator=0.5,p=>p.authority.fx.source_ref='',p=>p.authority.fx.valid_until=now.toISOString(),p=>p.authority.fx.valid_until='unknown']){
  const p=price();mutate(p);assert.equal(approvedEstimate(p,now),false);
 }
});
test('GBP direct quote requires explicit fees and explicit absence of FX, never an arbitrary conversion',()=>{
 const p={currency:'GBP',upper_bound_minor:50,authority:{native_currency:'GBP',native_bound_minor:49,fees_gbp_minor:1,fx:null}};
 assert.equal(requiredExposure(p,now),50n);assert.equal(approvedEstimate(p,now),true);
 delete p.authority.fx;assert.equal(approvedEstimate(p,now),false);
});
test('large safe-integer native bounds cannot overflow into a smaller GBP reservation',()=>{
 const p=price();p.authority.native_bound_minor=Number.MAX_SAFE_INTEGER;p.authority.fx.numerator=Number.MAX_SAFE_INTEGER;
 assert.equal(approvedEstimate(p,now),false);
});
