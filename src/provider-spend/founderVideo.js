// Inactive until explicitly dependency-injected by a separately reviewed staging composition.
const {createHash}=require('node:crypto');
const {MonthlyProviderSpend,SpendError}=require('./index');
const {approvedEstimate}=require('./estimateAuthority');
const MODEL='veo-3.1-fast-generate-001';
const SUBMIT=`vertex.video.${MODEL}.submit.4.720p.false`;
const RECONCILE=`vertex.video.${MODEL}.reconcile.status.status.false`;
const PREFIX='founder-video-acceptance-01:';
const MAX_STATUS_OBSERVATIONS=4;
const identityKeys=['auth_user_id','tenant_id','project_id','brand_id'];
const keys=[...identityKeys,'campaign_id','variant_id'];
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,32);
function binding(value){
 if(!value||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!valid(value[k]))||!['auth_user_id','campaign_id','variant_id'].every(k=>uuid(value[k])))throw new SpendError('FOUNDER_VIDEO_BINDING_REQUIRED');
 return Object.freeze(Object.fromEntries(keys.map(k=>[k,value[k]])));
}
function identityMatches(b,j){return !!j&&identityKeys.every(k=>j[k]===b[k]);}
function matches(b,j){return identityMatches(b,j)&&['campaign_id','variant_id'].every(k=>(j.request?.[k]??j[k])===b[k]);}
function video(j){return j.execution_class==='video.normal'&&j.profile?.provider_model===MODEL&&j.profile?.duration_seconds===4&&j.profile?.aspect_ratio==='9:16'&&j.request?.execution_mode==='ai'&&Array.isArray(j.request.supplied_assets)&&j.request.supplied_assets.length===0;}
function assertQuote(b,actor,q){
 if(actor?.kind!=='customer'||actor.auth_user_id!==b.auth_user_id||!matches(b,q)||!uuid(q.quote_id)||!video({...q,execution_class:q.request?.execution_class})||Number(q.credit_cost)!==5||q.job_id&&q.job_id!==`quoted:${q.quote_id}`)throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
}
function scopePrefix(b){return PREFIX+hash([b.auth_user_id,b.tenant_id])+':';}
function operationId(b,input){return scopePrefix(b)+input.job.quote_id+':'+hash([input.operation,input.operation===SUBMIT?'submit':input.job.observation_id]);}
class FounderVideoSpend extends MonthlyProviderSpend{
 constructor({founder,...options}={}){super(options);this.founder=binding(founder);}
 validateInput(input){
  const j=input?.job,b=this.founder;
  if(!matches(b,j)||!uuid(j.quote_id)||j.job_id!==`quoted:${j.quote_id}`||!video(j)||![SUBMIT,RECONCILE].includes(input.operation)||input.tenantId!==b.tenant_id||input.operation===RECONCILE&&(!uuid(j.claim_token)||!Number.isSafeInteger(j.fence)||j.fence<1||typeof j.observation_id!=='string'||!Number.isFinite(Date.parse(j.observation_id))))throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
 }
 async executePaid(input,dispatch){
  this.validateInput(input);
  // Observation identity comes from the locked worker row, never a customer request/retry ID.
  const paid={...input,id:operationId(this.founder,input)};
  const result=await super.executePaid(paid,dispatch);
  if(result?.ok===true)await this.transaction(async client=>{
   const row=(await client.query('select state from public.provider_spend_reservations where id=$1 for update',[paid.id])).rows[0];
   if(row?.state!=='uncertain')throw new SpendError('FOUNDER_VIDEO_OBSERVATION_HELD');
   await client.query("update public.provider_spend_reservations set evidence_ref='founder.video.http_response' where id=$1",[paid.id]);
  });
  return result;
 }
 async validateReservation(client,input,p){
  this.validateInput(input);
  const b=this.founder,j=input.job;
  if(input.id!==operationId(b,input))throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
  const e=p.estimates[input.operation],a=e?.authority;
  if(!e||e.version!==input.estimateVersion||!approvedEstimate(e,p.db_now)||!valid(a?.pricing_source_ref)||!valid(a?.pricing_version)||a?.pricing_unit!==(input.operation===SUBMIT?'second':'request')||!Number.isFinite(Date.parse(a?.pricing_valid_until))||Date.parse(a.pricing_valid_until)<=p.db_now.getTime())throw new SpendError('FOUNDER_VIDEO_PRICE_UNVERIFIED');
  // Same global transaction lock as the unchanged £100 monthly cap. Never release lifetime exposure.
  const prefix=scopePrefix(b);
  const rows=(await client.query('select id,tenant_id,operation,bound_minor,state,evidence_ref from public.provider_spend_reservations where left(id,$1)=$2',[prefix.length,prefix])).rows;
  if(rows.some(r=>!r.id.startsWith(prefix+j.quote_id+':')||r.tenant_id!==b.tenant_id))throw new SpendError('FOUNDER_VIDEO_ALREADY_BOUND');
  const prior=rows.find(r=>r.id===input.id),statuses=rows.filter(r=>r.operation===RECONCILE);
  // A fresh status observation requires a prior submit and all previous observations to have
  // received an unambiguous HTTP response. Monthly state stays uncertain for billing purposes.
  if(input.operation===RECONCILE){
   const submit=rows.find(r=>r.operation===SUBMIT);
   if(!submit)throw new SpendError('FOUNDER_VIDEO_SUBMIT_REQUIRED');
   if(!prior&&submit.evidence_ref!=='founder.video.http_response')throw new SpendError('FOUNDER_VIDEO_OBSERVATION_HELD');
   if(!prior&&statuses.some(r=>r.state==='dispatching'||r.evidence_ref!=='founder.video.http_response'))throw new SpendError('FOUNDER_VIDEO_OBSERVATION_HELD');
   if(!prior&&statuses.length>=MAX_STATUS_OBSERVATIONS)throw new SpendError('FOUNDER_VIDEO_POLL_LIMIT');
  }
  if(rows.reduce((sum,r)=>sum+BigInt(r.bound_minor),0n)+(prior?0n:BigInt(e.upper_bound_minor))>500n)throw new SpendError('FOUNDER_VIDEO_CAP_EXHAUSTED');
 }
}
module.exports={FounderVideoSpend,binding,matches,identityMatches,assertQuote,scopePrefix,SUBMIT,RECONCILE,MODEL,MAX_STATUS_OBSERVATIONS};
