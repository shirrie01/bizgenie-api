const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MonthlyProviderSpend } = require('../src/provider-spend');
test('real-provider boundary is default deny; free/mock callbacks remain independent',async()=>{
  let calls=0; const fake=()=>{calls++;return 'mock';};
  await assert.rejects(new MonthlyProviderSpend().executePaid({id:'a',tenantId:'tenant',operation:'image',estimateVersion:'v1'},fake),{code:'PROVIDER_SPEND_DISABLED'});
  await assert.rejects(new MonthlyProviderSpend({enabled:'true'}).executePaid({id:'a',tenantId:'tenant',operation:'image',estimateVersion:'v1'},fake),{code:'PROVIDER_SPEND_DISABLED'});
  assert.equal(calls,0);assert.equal(fake(),'mock');
});
test('unknown currency and malformed estimates are denied before opening a database connection',async()=>{
  let calls=0; const pool={connect(){calls++;throw Error('credential-details');}};
  const s=new MonthlyProviderSpend({pool,enabled:true});
  await assert.rejects(s.reserve({id:'job',tenantId:'tenant',operation:'image',estimateVersion:'v1',currency:'USD'}),{code:'PROVIDER_SPEND_INVALID_REQUEST'});
  assert.equal(calls,0);
});
test('unavailable ledger is sanitized and cannot invoke provider',async()=>{
  let calls=0;const s=new MonthlyProviderSpend({enabled:true,pool:{connect(){throw Error('private-connection');}}});
  await assert.rejects(s.executePaid({id:'job',tenantId:'tenant',operation:'image',estimateVersion:'v1'},()=>calls++),e=>e.code==='PROVIDER_SPEND_UNAVAILABLE'&&!e.message.includes('private'));
  assert.equal(calls,0);
});
