const {randomUUID}=require('node:crypto');const {QuoteError,digest}=require('./service');
class FencedGenerationWorker{
 constructor({quoteService,provider,fault=async()=>{}}){this.quotes=quoteService;this.billing=quoteService.billing;this.provider=provider;this.fault=fault;}
 async load(client,jobId){await this.quotes.preflight(client);const r=await client.query('select e.*,q.tenant_id,q.project_id,q.brand_id,q.auth_user_id,q.reservation_id,q.request,q.profile,q.credit_cost from public.generation_execution_claims e join public.generation_quotes q on q.quote_id=e.quote_id and q.job_id=e.job_id where e.job_id=$1 for update of e',[jobId]);if(r.rowCount!==1)throw new QuoteError('RESOURCE_NOT_AVAILABLE',404);return r.rows[0];}
 match(row,claim){if(row.claim_token!==claim.token||Number(row.fence)!==claim.fence)throw new QuoteError('EXECUTION_FENCE_STALE');}
 async claim(jobId,{recoverBeforeCall=false}={}){return this.billing.withTransaction(async client=>{
  const row=await this.load(client,jobId);if(row.state!=='queued'&&!(recoverBeforeCall&&row.state==='claimed'))throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);
  const actor={kind:'customer',auth_user_id:row.auth_user_id};await this.quotes.authorize(client,actor,row.tenant_id,row.project_id,row.brand_id);
  const token=randomUUID(),fence=Number(row.fence)+1;
  await client.query("update public.generation_execution_claims set state='claimed',claim_token=$2,fence=$3,claimed_at=$4,updated_at=$4 where job_id=$1",[jobId,token,fence,this.quotes.now()]);
  return {job_id:jobId,token,fence};
 });}
 async start(claim){return this.billing.withTransaction(async client=>{
  const row=await this.load(client,claim.job_id);this.match(row,claim);if(row.state!=='claimed')throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);
  await this.quotes.authorize(client,{kind:'customer',auth_user_id:row.auth_user_id},row.tenant_id,row.project_id,row.brand_id);
  const binding=await this.quotes.binding(client,row.request);if(digest(binding.preview_profile)!==digest(row.profile.preview_profile)||digest(binding.brand_snapshot)!==digest(row.profile.brand_snapshot))throw new QuoteError('QUOTE_CHANGED');await this.quotes.rights(client,row.request,row.brand_id);
  await client.query("update public.generation_execution_claims set state='calling',updated_at=$2 where job_id=$1",[claim.job_id,this.quotes.now()]);return row;
 });}
 async recovery(claim,reference=null){return this.billing.withTransaction(async client=>{
  const row=await this.load(client,claim.job_id);this.match(row,claim);if(['succeeded','failed'].includes(row.state))return;
  if(!['calling','recovery_required'].includes(row.state))throw new QuoteError('EXECUTION_FENCE_STALE');
  await client.query("update public.generation_execution_claims set state='recovery_required',provider_reference=coalesce($2,provider_reference),updated_at=$3 where job_id=$1",[claim.job_id,reference,this.quotes.now()]);
 });}
 async finalize(claim,outcome){
  if(!outcome||!['succeeded','failed'].includes(outcome.status)||outcome.status==='failed'&&outcome.definitive!==true)throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);
  const serialized=JSON.stringify(outcome);if(Buffer.byteLength(serialized)>65536)throw new QuoteError('PROVIDER_RESULT_INVALID',503);
  return this.billing.withTransaction(async client=>{
   const row=await this.load(client,claim.job_id);this.match(row,claim);
   if(['succeeded','failed'].includes(row.state)){if(digest(row.result)!==digest(outcome))throw new QuoteError('EXECUTION_RESULT_CONFLICT');return {status:row.state,replay:true};}
   if(!['calling','recovery_required'].includes(row.state))throw new QuoteError('EXECUTION_FENCE_STALE');
   const account=await this.billing.requireLockedAccount(client,row.tenant_id),reservation=await this.billing.requireRelatedEntry(client,account,row.reservation_id,'reservation');
   const success=outcome.status==='succeeded';
   await this.billing.appendLocked(client,account,{tenant_id:row.tenant_id,entry_type:success?'debit':'reservation_release',amount:reservation.amount,balance_delta:success?-reservation.amount:0,reserved_delta:-reservation.amount,project_id:reservation.project_id,generation_id:reservation.generation_id,execution_id:reservation.execution_id,transaction_correlation_id:reservation.transaction_correlation_id,reservation_entry_id:reservation.ledger_entry_id,idempotency_key:`quote:settle:${row.quote_id}`});
   await client.query('update public.generation_execution_claims set state=$2,provider_reference=$3,result=$4,updated_at=$5 where job_id=$1',[claim.job_id,outcome.status,outcome.provider_reference||row.provider_reference,outcome,this.quotes.now()]);await this.fault('settlement_before_commit');
   return {status:outcome.status,replay:false};
  });
 }
 async run(claim){const row=await this.start(claim);try{
  await this.fault('after_call_boundary_before_provider');
  const outcome=await this.provider.submit({idempotency_key:claim.job_id,profile:row.profile,request:row.request});
  await this.fault('after_provider_before_settlement');
  if(outcome?.status==='pending'||outcome?.status==='unknown'){await this.recovery(claim,outcome.provider_reference);return {status:'recovery_required'};}
  return await this.finalize(claim,outcome);
 }catch(error){await this.recovery(claim).catch(()=>{});throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);}}
 async reconciliationClaim(jobId){return this.billing.withTransaction(async client=>{const row=await this.load(client,jobId);if(!['calling','recovery_required'].includes(row.state))throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);return {job_id:jobId,token:row.claim_token,fence:Number(row.fence)};});}
 async reconcile(claim){
  const row=await this.billing.withTransaction(async client=>{const r=await this.load(client,claim.job_id);this.match(r,claim);if(!['calling','recovery_required','succeeded','failed'].includes(r.state))throw new QuoteError('EXECUTION_FENCE_STALE');return r;});
  if(['succeeded','failed'].includes(row.state))return {status:row.state,replay:true};
  if(typeof this.provider.reconcile!=='function')throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);
  // Reconciliation must query by stable provider identity, never submit again.
  const outcome=await this.provider.reconcile({idempotency_key:claim.job_id,provider_reference:row.provider_reference,profile:row.profile});
  if(!outcome||!['succeeded','failed'].includes(outcome.status)){await this.recovery(claim,outcome?.provider_reference);throw new QuoteError('EXECUTION_RECONCILIATION_REQUIRED',503);}
  return this.finalize(claim,outcome);
 }
}
module.exports={FencedGenerationWorker};
