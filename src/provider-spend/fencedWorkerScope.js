const { withProviderJob } = require('./dispatch');
const { SpendError } = require('./index');
const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const same=(a,b)=>a!==undefined&&b!==undefined&&JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
// Explicit worker dependency injection; no startup/env activation and no stale-row authority.
function createFencedWorkerScope({ worker, spend, operationsForRow }) {
  if (!worker || typeof operationsForRow!=='function') throw new SpendError('PROVIDER_ADMISSION_UNAVAILABLE');
  return async function providerScope(claim, dispatch) {
    async function load() {
      return worker.billing.withTransaction(async client=>{
        const row=await worker.load(client,claim.job_id);
        worker.match(row,claim);
        if (!['calling','recovery_required'].includes(row.state)) throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_STALE');
        await worker.quotes.authorize(client,{kind:'customer',auth_user_id:row.auth_user_id},row.tenant_id,row.project_id,row.brand_id);
        await worker.quotes.rights(client,row.request,row.brand_id);
        const binding=await worker.quotes.binding(client,row.request);
        if (!same(binding.preview_profile,row.profile.preview_profile)||!same(binding.brand_snapshot,row.profile.brand_snapshot)) throw new SpendError('PROVIDER_EXECUTION_AUTHORITY_STALE');
        return row;
      });
    }
    const row=await load();
    const identity=r=>({job_id:r.job_id,tenant_id:r.tenant_id,project_id:r.project_id,brand_id:r.brand_id,
      claim_token:r.claim_token,fence:Number(r.fence),state:r.state});
    return withProviderJob({spend,job:identity(row),operations:await operationsForRow(row),resolveJob:async()=>identity(await load())},dispatch);
  };
}
module.exports={createFencedWorkerScope};
