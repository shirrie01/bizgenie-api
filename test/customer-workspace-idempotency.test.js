const {test}=require('node:test'),assert=require('node:assert/strict');
const {CustomerWorkspaceService}=require('../src/customer-workspace/service');
const {InMemoryCustomerWorkspaceRepository,idempotentWorkspaceIds}=require('../src/customer-workspace/repository');
const {parseCreateAdditionalWorkspaceRequest}=require('../src/customer-workspace/schema');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function kit(){
 const repository=new InMemoryCustomerWorkspaceRepository(),calls=[];
 const service=new CustomerWorkspaceService({repository,brandBrainRepository:{},scopeProvisioner:{provisionTrustedScope:async i=>{calls.push(i);return {requires_session_refresh:true};}}});
 return {repository,service,calls};
}
async function boot(k){return k.service.bootstrapWorkspace({actor:{kind:'customer',auth_user_id:owner},request:{business_name:'Fairway'}});}
const create=(k,patch={},actor=owner)=>k.service.createAdditionalWorkspace({actor:{kind:'customer',auth_user_id:actor},request:{business_name:'Fonzo',...patch}});
test('request schema: the key is optional, bounded and identifier-shaped; unknown fields stay refused',()=>{
 assert.deepEqual(parseCreateAdditionalWorkspaceRequest({tenant_id:'t',business_name:'Fonzo',idempotency_key:'fonzo.workspace.v1'}).idempotency_key,'fonzo.workspace.v1');
 assert.equal(parseCreateAdditionalWorkspaceRequest({tenant_id:'t'}).idempotency_key,undefined);
 for(const bad of ['',' k','a b','x'.repeat(201),'a/b',7,null])assert.throws(()=>parseCreateAdditionalWorkspaceRequest({tenant_id:'t',idempotency_key:bad}));
 assert.throws(()=>parseCreateAdditionalWorkspaceRequest({tenant_id:'t',idempotency_key:'k',extra:1}));
});
test('ids are a pure function of owner, tenant and key',()=>{
 const a=idempotentWorkspaceIds({auth_user_id:owner,tenant_id:'t',idempotency_key:'k'});
 assert.deepEqual(a,idempotentWorkspaceIds({auth_user_id:owner,tenant_id:'t',idempotency_key:'k'}));
 for(const patch of [{auth_user_id:other},{tenant_id:'u'},{idempotency_key:'j'}])assert.notEqual(idempotentWorkspaceIds({auth_user_id:owner,tenant_id:'t',idempotency_key:'k',...patch}).project_id,a.project_id);
 assert.match(a.project_id,/^project_[a-f0-9]{32}$/);assert.match(a.brand_id,/^brand_[a-f0-9]{32}$/);
});
test('a keyed replay returns the same workspace and creates nothing; the scope is provisioned again for lost-response recovery',async()=>{
 const k=kit(),home=await boot(k),first=await create(k,{tenant_id:home.workspace.tenant_id,idempotency_key:'fonzo.workspace.v1'});
 const again=await create(k,{tenant_id:home.workspace.tenant_id,idempotency_key:'fonzo.workspace.v1'});
 assert.deepEqual(again.workspace,first.workspace);
 assert.equal((await k.service.getWorkspace({actor:{kind:'customer',auth_user_id:owner}})).workspaces.length,2);
 assert.equal(k.calls.filter(c=>c.trusted_scope.project_id===first.workspace.project_id).length,2);
});
test('same key with a different name conflicts; other owners and non-owners are refused; no key keeps one new workspace per call',async()=>{
 const k=kit(),home=await boot(k),t=home.workspace.tenant_id;
 await create(k,{tenant_id:t,idempotency_key:'k.1'});
 await assert.rejects(create(k,{tenant_id:t,idempotency_key:'k.1',business_name:'Other'}),e=>e.details.some(d=>d.code==='idempotency_conflict'));
 await assert.rejects(create(k,{tenant_id:t,idempotency_key:'k.1'},other),e=>e.details.some(d=>d.code==='unauthorized'));
 const a=await create(k,{tenant_id:t}),b=await create(k,{tenant_id:t});
 assert.notEqual(a.workspace.project_id,b.workspace.project_id);
 assert.equal((await k.service.getWorkspace({actor:{kind:'customer',auth_user_id:owner}})).workspaces.length,4);
});
