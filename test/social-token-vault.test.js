const {it}=require('node:test');const assert=require('node:assert/strict');const {SocialTokenVault}=require('../src/social-connectors/tokenVault');
const binding={tenant_id:'tenant',project_id:'project',brand_id:'brand',platform:'tiktok',account_id:'account'};
const credentials={accessToken:'synthetic_access_not_a_real_token',refreshToken:'synthetic_refresh',expiresAt:'2026-11-01T12:00:00Z'};
it('vault is unavailable without a driver and returns only opaque references when explicitly configured',async()=>{
 const absent=new SocialTokenVault();await assert.rejects(absent.store(binding,credentials),{code:'SOCIAL_TOKEN_VAULT_UNAVAILABLE'});
 let at=new Date('2026-10-31T12:00:00Z');const rows=new Map(),driver={create:async r=>{rows.set(r.reference,structuredClone(r));return r.reference;},read:async({reference,binding:b})=>{const row=rows.get(reference);return row&&JSON.stringify(row.binding)===JSON.stringify(b)?row:null;},revoke:async({reference,binding:b})=>{const row=rows.get(reference);if(row&&JSON.stringify(row.binding)===JSON.stringify(b))row.revoked=true;}};
 const vault=new SocialTokenVault({driver,now:()=>at}),ref=await vault.store(binding,credentials);assert.match(ref,/^[a-f0-9-]{36}$/);assert.doesNotMatch(ref,/synthetic/);
 assert.equal(await vault.use(ref,binding,s=>s.accessToken===credentials.accessToken),true);await assert.rejects(vault.use(ref,binding,()=>{throw Error(credentials.accessToken);}),e=>e.code==='SOCIAL_PROVIDER_OPERATION_UNAVAILABLE'&&!e.message.includes(credentials.accessToken));
 for(const field of ['tenant_id','project_id','brand_id','platform','account_id'])await assert.rejects(vault.use(ref,{...binding,[field]:field==='platform'?'facebook':'foreign'},()=>assert.fail('Foreign credentials reached caller')),{code:'SOCIAL_TOKEN_UNAVAILABLE'});
 at=new Date('2026-11-02T12:00:00Z');await assert.rejects(vault.use(ref,binding,()=>assert.fail('Expired token used')),{code:'SOCIAL_TOKEN_UNAVAILABLE'});at=new Date('2026-10-31T12:00:00Z');await vault.revoke(ref,binding);await vault.revoke(ref,binding);await assert.rejects(vault.use(ref,binding,()=>assert.fail('Revoked token used')),{code:'SOCIAL_TOKEN_UNAVAILABLE'});
});
it('vault fails closed on driver failures without propagating credential-bearing diagnostics',async()=>{
 const error=Error(credentials.accessToken),vault=new SocialTokenVault({driver:{create:async()=>{throw error;},read:async()=>{throw error;},revoke:async()=>{throw error;}}});
 for(const op of [()=>vault.store(binding,{...credentials,expiresAt:'2099-01-01T00:00:00Z'}),()=>vault.use('11111111-1111-4111-8111-111111111111',binding,()=>{}),()=>vault.revoke('11111111-1111-4111-8111-111111111111',binding)])await assert.rejects(op(),e=>e.code==='SOCIAL_TOKEN_VAULT_UNAVAILABLE'&&!e.message.includes(credentials.accessToken));
});
