// Inactive until explicitly dependency-injected by a separately reviewed staging composition.
const {createHash}=require('node:crypto');
const {MonthlyProviderSpend,SpendError}=require('./index');
const {approvedEstimate}=require('./estimateAuthority');
const MODEL='veo-3.1-fast-generate-001';
const SUBMIT=`vertex.video.${MODEL}.submit.4.720p.false`;
const RECONCILE=`vertex.video.${MODEL}.reconcile.status.status.false`;
const PREFIX='founder-video-acceptance-01:';
const keys=['auth_user_id','tenant_id','project_id','brand_id','quote_id'];
const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);
function binding(value){
 if(!value||keys.some(k=>!valid(value[k]))||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.auth_user_id)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.quote_id))throw new SpendError('FOUNDER_VIDEO_BINDING_REQUIRED');
 return Object.freeze(Object.fromEntries(keys.map(k=>[k,value[k]])));
}
function matches(b,j){return j&&keys.every(k=>j[k]===b[k]);}
function video(j){return j.execution_class==='video.normal'&&j.profile?.provider_model===MODEL&&j.profile?.duration_seconds===4&&j.profile?.aspect_ratio==='9:16'&&j.request?.execution_mode==='ai'&&Array.isArray(j.request.supplied_assets)&&j.request.supplied_assets.length===0;}
function assertQuote(b,actor,q){
 if(actor?.kind!=='customer'||actor.auth_user_id!==b.auth_user_id||!matches(b,q)||!video({...q,execution_class:q.request?.execution_class})||Number(q.credit_cost)!==5||q.job_id&&q.job_id!==`quoted:${b.quote_id}`)throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
}
class FounderVideoSpend extends MonthlyProviderSpend{
 constructor({founder,...options}={}){super(options);this.founder=binding(founder);}
 async executePaid(input,dispatch){
  const j=input?.job,b=this.founder;
  if(!matches(b,j)||j.job_id!==`quoted:${b.quote_id}`||!video(j)||![SUBMIT,RECONCILE].includes(input.operation)||input.tenantId!==b.tenant_id)throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
  // Stable even if a caller invents a retry/request ID; one submit permit, one status permit.
  const id=PREFIX+b.quote_id+':'+createHash('sha256').update(input.operation).digest('hex');
  return super.executePaid({...input,id},dispatch);
 }
 async validateReservation(client,input,p){
  const b=this.founder,j=input.job;
  if(!matches(b,j)||j.job_id!==`quoted:${b.quote_id}`||!video(j)||![SUBMIT,RECONCILE].includes(input.operation)||input.tenantId!==b.tenant_id||input.id!==PREFIX+b.quote_id+':'+createHash('sha256').update(input.operation).digest('hex'))throw new SpendError('FOUNDER_VIDEO_FORBIDDEN');
  const e=p.estimates[input.operation],a=e?.authority;
  // Pricing unit is explicit, sourced and time-limited; never infer dollars/count = dollars/second.
  if(!e||e.version!==input.estimateVersion||!approvedEstimate(e,p.db_now)||!valid(a?.pricing_source_ref)||!valid(a?.pricing_version)||!['second','request'].includes(a?.pricing_unit)||a.pricing_unit!==(input.operation===SUBMIT?'second':'request')||!Number.isFinite(Date.parse(a?.pricing_valid_until))||Date.parse(a.pricing_valid_until)<=p.db_now.getTime())throw new SpendError('FOUNDER_VIDEO_PRICE_UNVERIFIED');
  // Existing global advisory lock serializes this with all £100 monthly reservations.
  // Lifetime namespace, including cancelled/settled/uncertain rows: no refund or month reset.
  const rows=(await client.query('select id,tenant_id,bound_minor from public.provider_spend_reservations where left(id,$1)=$2',[PREFIX.length,PREFIX])).rows;
  if(rows.some(r=>!r.id.startsWith(PREFIX+b.quote_id+':')||r.tenant_id!==b.tenant_id))throw new SpendError('FOUNDER_VIDEO_ALREADY_BOUND');
  const prior=rows.find(r=>r.id===input.id);
  if(rows.reduce((sum,r)=>sum+BigInt(r.bound_minor),0n)+(prior?0n:BigInt(e.upper_bound_minor))>500n)throw new SpendError('FOUNDER_VIDEO_CAP_EXHAUSTED');
 }
}
module.exports={FounderVideoSpend,binding,matches,assertQuote,SUBMIT,RECONCILE,MODEL};
