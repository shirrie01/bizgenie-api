// Source-only composition: no environment parser, startup hook, policy mutation or activation.
const {FounderVideoSpend,binding,matches}=require('./founderVideo');
const {createFencedWorkerScope}=require('./fencedWorkerScope');
const {SpendError}=require('./index');
function createFounderVideoAcceptance({environment,founder,pool,enabled=false,policyVersion}={}){
 if(environment!=='staging')throw new SpendError('FOUNDER_VIDEO_STAGING_REQUIRED');
 const approved=binding(founder),spend=new FounderVideoSpend({founder:approved,pool,enabled,policyVersion});
 return Object.freeze({
  quoteOptions:Object.freeze({founderVideo:approved}),
  bridgeOptions:Object.freeze({founderVideo:approved}),
  providerScopeFor(worker,operationsForRow){
   if(!matches(approved,worker?.quotes?.founderVideo))throw new SpendError('FOUNDER_VIDEO_BINDING_REQUIRED');
   return createFencedWorkerScope({worker,spend,operationsForRow});
  },
 });
}
module.exports={createFounderVideoAcceptance};
