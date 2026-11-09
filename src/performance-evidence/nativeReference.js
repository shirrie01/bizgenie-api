'use strict';
// Offline contract only: reuses the existing reference registry. No HTTP route,
// durable-store claim, native provider fetch or production composition is added.
const {createHash}=require('node:crypto');
const {PerformanceEvidenceReferenceRegistry,EvidenceError}=require('./contract');
const keys=['tenant_id','project_id','brand_id'];
function sameScope(context,scope){return keys.every(k=>typeof context?.[k]==='string'&&context[k]===scope[k]);}
class ConsentedNativeAnalyticsReferenceRegistry extends PerformanceEvidenceReferenceRegistry {
 constructor({authorizeSource,authorizeConsent,now=()=>new Date()}={}){
  if(typeof authorizeSource!=='function'||typeof authorizeConsent!=='function')throw new TypeError('Verified source and consent authorizers required');
  const permitted=async args=>sameScope(args.context,args.binding)&&await authorizeSource(args)===true&&await authorizeConsent(args)===true;
  super({now,authorizeSource:permitted});this.permitted=permitted;this.bindings=new Map();
 }
 async ingest(context,binding,input){
  const row=await super.ingest(context,binding,input);this.bindings.set(row.observation.observation_id,structuredClone(binding));return row;
 }
 snapshot(){throw new EvidenceError('EVIDENCE_POLICY_REQUIRED');}
 async snapshotForLearning({context,tenant_id,project_id,brand_id,max_age_ms,min_sample_size}){
  const scope={tenant_id,project_id,brand_id};
  if(!sameScope(context,scope))throw new EvidenceError('EVIDENCE_SOURCE_UNAUTHORIZED');
  if(!Number.isSafeInteger(min_sample_size)||min_sample_size<1)throw new EvidenceError('EVIDENCE_POLICY_REQUIRED');
  const base=super.snapshot({...scope,max_age_ms}),observations=[];let withheld=0;
  for(const row of base.observations){
   const binding=this.bindings.get(row.observation.observation_id);
   if(!binding||await this.permitted({context,binding,observation:row.observation})!==true){withheld++;continue;}
   const n=row.observation.measurement_context?.sample_size;
   if(!Number.isSafeInteger(n)||n<min_sample_size){withheld++;continue;}
   observations.push(row);
  }
  return {...base,state:observations.length?'available':'unavailable',reason:observations.length?null:withheld?'consent_source_or_sample_unavailable':base.reason,observations,snapshot_hash:createHash('sha256').update(JSON.stringify(observations.map(r=>r.fingerprint).sort())).digest('hex'),learning_policy:{max_age_ms,min_sample_size},causal_claim:false,requires_customer_acceptance:true};
 }
}
module.exports={ConsentedNativeAnalyticsReferenceRegistry};
