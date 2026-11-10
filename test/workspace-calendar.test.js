const assert=require('node:assert/strict');
const {it}=require('node:test');
const express=require('express');
const request=require('supertest');
const {parseQuery,page,memoryRows}=require('../src/campaigns/workspaceCalendar');
const {createCustomerWorkspaceCalendarRouter}=require('../src/campaigns/router');
const {AuthenticationRequiredError,AuthorizationDeniedError}=require('../src/authorization');
const base={tenant_id:'tenant_a',project_id:'project_a',from:'2026-09-01T00:00:00Z',to:'2026-09-30T00:00:00Z'};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function campaign(n,{at=null,archived=false,itemArchived=false,platform='instagram'}={}) {
 const v={variant_id:id(n),platform,placement:'feed',destination_label:'Public',workflow:at?'scheduled':'draft',active_schedule_id:at?id(n):null};
 return {campaign_id:id(n),name:'Campaign '+n,archived_at:archived?'2026-01-01':null,items:new Map([[id(n),{content_item_id:id(n),name:'Post',format:'text',archived_at:itemArchived?'2026-01-01':null,variants:new Map([[id(n),v]])}]]),schedules:new Map(at?[[id(n),{schedule_id:id(n),scheduled_for:at}]]:[]),publications:new Map(),corrections:new Map()};
}
it('validates explicit offset, real dates, bounded window, filters, pages and unknown fields',()=>{
 for(const extra of [{to:base.from},{from:'2026-02-30T00:00:00Z'},{to:'2027-01-01T00:00:00Z'},{limit:'101'},{limit:'0'},{platform:'bogus'},{workflow:'failed'},{from:'2026-09-01T00:00:00'},{unexpected:true},{cursor:'!!!!'}])assert.throws(()=>parseQuery({...base,...extra}));
 assert.equal(parseQuery({...base,limit:'5'}).limit,5);
});
it('orders occurrences before unscheduled, excludes archives/outside window and binds cursor to scope/filters',()=>{
 const campaigns=[campaign(3),campaign(2,{at:base.from}),campaign(1,{at:base.from}),campaign(4,{archived:true}),campaign(5,{itemArchived:true}),campaign(6,{at:base.to})];
 const q=parseQuery({...base,limit:1});const first=page(q,memoryRows(campaigns,q));assert.equal(first.entries[0].variant_id,id(1));
 const q2=parseQuery({...base,limit:1,cursor:first.next_cursor});const second=page(q2,memoryRows(campaigns,q2));assert.equal(second.entries[0].variant_id,id(2));
 const q3=parseQuery({...base,limit:1,cursor:second.next_cursor});const third=page(q3,memoryRows(campaigns,q3));assert.equal(third.unscheduled[0].variant_id,id(3));assert.equal(third.next_cursor,null);
 for(const change of [{project_id:'foreign'},{tenant_id:'foreign'},{platform:'instagram'},{to:'2026-09-29T00:00:00Z'}])assert.throws(()=>parseQuery({...base,...change,cursor:first.next_cursor}));
 assert.deepEqual(memoryRows(campaigns,parseQuery({...base,platform:'youtube'})),[]);
});
it('HTTP verifies token/project before reading, returns honest errors and never trusts a foreign scope',async()=>{
 let reads=0;const app=express();app.use('/customer/calendar',createCustomerWorkspaceCalendarRouter({
  repository:{listWorkspaceCalendar:async()=>{reads++;return {entries:[],unscheduled:[],next_cursor:null};}},
  tokenVerifier:{verifyAccessToken:async token=>{if(token!=='ok')throw new AuthenticationRequiredError();return {kind:'customer',auth_user_id:id(9)};}},
  authorizationService:{authorizeProject:async({tenantId,projectId,actor})=>{if(tenantId!=='tenant_a'||projectId!=='project_a')throw new AuthorizationDeniedError();return {actor,tenant_id:tenantId,project_id:projectId,membership_role:'member'};}},logger:{warn(){},error(){}}
 }));
 assert.equal((await request(app).get('/customer/calendar').query(base)).status,401);
 assert.equal((await request(app).get('/customer/calendar').query({...base,tenant_id:'foreign'}).set('Authorization','Bearer ok')).status,404);
 assert.equal(reads,0);
 assert.equal((await request(app).get('/customer/calendar').query(base).set('Authorization','Bearer ok')).status,200);assert.equal(reads,1);
 assert.equal((await request(app).get('/customer/calendar').query({...base,to:base.from}).set('Authorization','Bearer ok')).status,400);
});

// Exercise the actual selected-workspace authorization and app privacy middleware,
// rather than a stub that accepts a caller-supplied tenant/project.
function scopedCalendarFixture() {
 const {createApp}=require('../index');
 const {InMemoryAuthorizationRepository,createCustomerActorFromVerifiedIdentity}=require('../src/authorization');
 const user=id(99),reads=[];
 const authorizationRepository=new InMemoryAuthorizationRepository({
  customerProfiles:[{auth_user_id:user}],
  tenants:[{tenant_id:'tenant_a'},{tenant_id:'tenant_b'}],
  memberships:[{tenant_id:'tenant_a',auth_user_id:user,role:'member'},{tenant_id:'tenant_b',auth_user_id:user,role:'owner'}],
  projects:[{project_id:'project_a',tenant_id:'tenant_a'},{project_id:'project_a2',tenant_id:'tenant_a'},{project_id:'project_b',tenant_id:'tenant_b'}],
 });
 const app=createApp({authorizationRepository,
  customerTokenVerifier:{verifyAccessToken:async token=>{
   if(token!=='selected-a')throw new AuthenticationRequiredError();
   return createCustomerActorFromVerifiedIdentity({verifiedAuthUserId:user,verifiedScope:{tenant_id:'tenant_a',project_id:'project_a',brand_id:'brand_a'}});
  }},
  campaignRepository:{listWorkspaceCalendar:async(context,query)=>{
   reads.push({tenant_id:context.tenant_id,project_id:context.project_id});
   return {contract_version:'workspace-calendar.v1',entries:[],unscheduled:[],next_cursor:null};
  }},logger:{warn(){},error(){},info(){}}
 });
 return {app,reads,authorizationRepository,user};
}
function assertPrivate(response) {
 assert.equal(response.headers['cache-control'],'private, no-store');
 assert.match(response.headers.vary,/(?:^|,\s*)Authorization(?:,|$)/i);
}
it('real HTTP authorization binds calendar to selected tenant/project even with membership in both workspaces',async()=>{
 const {app,reads}=scopedCalendarFixture();
 const ok=await request(app).get('/customer/calendar').query(base).set('Authorization','Bearer selected-a');
 assert.equal(ok.status,200);assertPrivate(ok);
 assert.deepEqual(reads,[{tenant_id:'tenant_a',project_id:'project_a'}]);
 for(const scope of [{tenant_id:'tenant_b',project_id:'project_b'},{project_id:'project_a2'},{tenant_id:'foreign'}]) {
  const denied=await request(app).get('/customer/calendar').query({...base,...scope}).set('Authorization','Bearer selected-a');
  assert.equal(denied.status,404);assertPrivate(denied);
 }
 assert.equal(reads.length,1);
});
it('revoked calendar membership is denied on the next request without reading campaign data',async()=>{
 const {app,reads,authorizationRepository,user}=scopedCalendarFixture();
 assert.equal((await request(app).get('/customer/calendar').query(base).set('Authorization','Bearer selected-a')).status,200);
 authorizationRepository.memberships.delete(`tenant_a\u0000${user}`);
 const denied=await request(app).get('/customer/calendar').query(base).set('Authorization','Bearer selected-a');
 assert.equal(denied.status,404);assertPrivate(denied);assert.equal(reads.length,1);
});
it('calendar rejects absent/expired bearer and admin-only credentials with private error responses',async()=>{
 const {app,reads}=scopedCalendarFixture();
 for(const headers of [{},{Authorization:'Bearer expired'},{'x-admin-key':'not-a-customer-token'}]) {
  const denied=await request(app).get('/customer/calendar').query(base).set(headers);
  assert.equal(denied.status,401);assertPrivate(denied);
 }
 assert.equal(reads.length,0);
});
