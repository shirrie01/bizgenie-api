const {AsyncLocalStorage}=require('node:async_hooks');const {randomUUID}=require('node:crypto');
const {PostgresBillingRepository}=require('../postgresRepository');const {identifier}=require('../schema');const {StripeEventConflictError,StripeEventInProgressError}=require('./errors');
// Opt-in draft repository, never selected by existing production composition.
// Every financial transaction in an event handler verifies its current durable claim.
class FencedStripeBillingRepository extends PostgresBillingRepository{
 constructor(options){super(options);this.stripeFence=new AsyncLocalStorage();this.requiresStripeFence=true;}
 async withTransaction(operation,options){const fence=this.stripeFence.getStore();return super.withTransaction(async client=>{
  if(fence){const r=await client.query("select claim_token from public.stripe_webhook_events where stripe_event_id=$1 and status='processing' for share",[fence.event_id]);if(r.rowCount!==1||r.rows[0].claim_token!==fence.claim_token)throw new StripeEventConflictError();}
  return operation(client);
 },options);}
 withStripeEventFence(claim,operation){if(!claim?.event_id||!claim.claim_token)throw new StripeEventConflictError();return this.stripeFence.run(claim,operation);}
 async beginStripeEvent(input){const eventId=identifier.parse(input.event_id);return this.withTransaction(async client=>{
  const token=randomUUID();const at=this.timestamp();
  const inserted=await client.query(`insert into public.stripe_webhook_events(stripe_event_id,event_type,livemode,intent_hash,status,received_at,claim_token,attempt_generation,claimed_at) values($1,$2,$3,$4,'processing',$5,$6,1,$5) on conflict do nothing returning stripe_event_id`,[eventId,input.event_type,Boolean(input.livemode),input.intent_hash,input.received_at||at,token]);
  if(inserted.rowCount===1)return {replay:false,event_id:eventId,claim_token:token};
  const r=await client.query('select * from public.stripe_webhook_events where stripe_event_id=$1 for update',[eventId]),old=r.rows[0];
  if(!old||old.event_type!==input.event_type||old.livemode!==Boolean(input.livemode)||old.intent_hash!==input.intent_hash)throw new StripeEventConflictError();
  if(old.status==='processed')return {replay:true,result:old.result};
  if(old.status==='processing'&&input.recover_processing!==true)throw new StripeEventInProgressError();
  await client.query("update public.stripe_webhook_events set status='processing',claim_token=$2,attempt_generation=attempt_generation+1,claimed_at=$3 where stripe_event_id=$1",[eventId,token,at]);
  return {replay:false,event_id:eventId,claim_token:token,recovered:old.status==='processing'};
 });}
}
module.exports={FencedStripeBillingRepository};
