// No env activation or customer-controlled cost/identity. Only a reviewed worker may establish scope.
const { createHash } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { SpendError } = require('./index');
const scope = new AsyncLocalStorage();
const required = ['job_id','tenant_id','project_id','brand_id','claim_token','fence'];
async function withProviderJob({ spend, job, resolveJob, operations }, callback) {
  if (!spend || typeof spend.executePaid !== 'function' || typeof resolveJob !== 'function' || typeof callback !== 'function' || !job || required.some(k=>job[k]===undefined) || required.filter(k=>k!=='fence').some(k=>typeof job[k]!=='string'||!job[k].trim()) || !Number.isSafeInteger(job.fence) || job.fence<1 || !['calling','recovery_required'].includes(job.state) || !operations || Object.keys(operations).length>100) throw new SpendError('PROVIDER_ADMISSION_UNAVAILABLE');
  const identity=Object.freeze(structuredClone(job));
  return scope.run({spend,job:identity,resolveJob,operations:structuredClone(operations)},callback);
}
async function admitProviderDispatch(operation, dispatch) {
  const s=scope.getStore();
  if (!s) throw new SpendError('PROVIDER_ADMISSION_UNAVAILABLE');
  const states=operation.startsWith('vertex.video.') && operation.includes('.reconcile.') ? ['calling','recovery_required'] : ['calling'];
  const approved=s.operations[operation];
  if (!approved || typeof approved.estimateVersion!=='string') throw new SpendError('PROVIDER_COST_ESTIMATE_UNAPPROVED');
  let current;
  try { current=await s.resolveJob(s.job,operation); } catch { throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_UNAVAILABLE'); }
  if (!current || !states.includes(current.state) || required.some(k=>current[k]!==s.job[k]) || current.cancelled || current.revoked) throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_STALE');
  // Different requests cannot use random retry IDs: the operator-owned operation ID is stable per job/stage.
  return s.spend.executePaid({id:'dispatch:'+createHash('sha256').update(JSON.stringify([s.job.job_id,operation])).digest('hex'),tenantId:s.job.tenant_id,operation,estimateVersion:approved.estimateVersion,currency:'GBP'},async()=>{
    let latest;
    try { latest=await s.resolveJob(s.job,operation); } catch { throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_UNAVAILABLE'); }
    if (!latest || !states.includes(latest.state) || required.some(k=>latest[k]!==s.job[k]) || latest.cancelled || latest.revoked) throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_STALE');
    return dispatch();
  });
}
module.exports={withProviderJob,admitProviderDispatch};
