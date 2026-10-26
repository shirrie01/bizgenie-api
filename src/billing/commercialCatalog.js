const {z}=require('zod');
const {identifier,CommercialPolicySchema}=require('./schema');
const url=z.string().url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;});
const PlanSchema=z.object({
 plan_code:z.enum(['standard','pro']),plan_version:z.number().int().positive(),
 amount_minor:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),currency:z.string().regex(/^[A-Z]{3}$/),
 billing_cadence:z.enum(['month','year']),tax:z.object({presentation:z.enum(['inclusive','exclusive']),jurisdiction:z.string().min(1).max(100),wording:z.string().min(1).max(1000)}).strict(),
 credit_grant_cadence:z.literal('month'),included_credits:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),policy_id:identifier,
 entitlement_codes:z.array(identifier).min(1).max(100),effective_from:z.string().datetime({offset:true}),effective_to:z.string().datetime({offset:true}).nullable(),
 terms:z.object({version:identifier,url,cancellation_url:url,refund_url:url}).strict(),
 approval:z.object({decision:identifier,source:url,approved_at:z.string().datetime({offset:true})}).strict(),
 stripe:z.object({mode:z.enum(['test','live']),price_id:z.string().regex(/^price_[A-Za-z0-9]+$/)}).strict(),
}).strict().refine(p=>p.effective_to===null||Date.parse(p.effective_to)>Date.parse(p.effective_from));
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
class CatalogUnavailableError extends Error {constructor(){super('Approved commercial catalogue is unavailable');this.code='COMMERCIAL_CATALOG_UNAVAILABLE';}}
// Server-owned injection only. No environment defaults, browser prices, credit allowance guesses or Stripe writes.
class CommercialCatalog {
 constructor({plans,policies,mode,now=()=>new Date()}) {
  this.plans=freeze(z.array(PlanSchema).min(1).max(100).parse(plans));
  this.policies=freeze(z.array(CommercialPolicySchema).parse(policies));this.mode=z.enum(['test','live']).parse(mode);this.now=now;
  const prices=new Set();
  for(const plan of this.plans){
   if(plan.stripe.mode!==this.mode||prices.has(plan.stripe.price_id))throw new CatalogUnavailableError();prices.add(plan.stripe.price_id);
   const policy=this.policies.find(p=>p.policy_id===plan.policy_id);
   if(!policy||policy.plan_code!==plan.plan_code||policy.included_monthly_credits!==plan.included_credits||policy.status!=='active')throw new CatalogUnavailableError();
  }
 }
 activePlans(){
  const at=this.now().getTime();const active=this.plans.filter(p=>Date.parse(p.effective_from)<=at&&(!p.effective_to||Date.parse(p.effective_to)>at));
  if(!active.length||new Set(active.map(p=>p.plan_code)).size!==active.length)throw new CatalogUnavailableError();
  for(const plan of active){const policy=this.policies.find(p=>p.policy_id===plan.policy_id);if(Date.parse(policy.effective_from)>at||(policy.effective_to&&Date.parse(policy.effective_to)<=at))throw new CatalogUnavailableError();}
  return active;
 }
 read(){return {contract_version:'commercial-catalog.v1',plans:this.activePlans().map(({stripe,...publicPlan})=>structuredClone(publicPlan))};}
 stripeMapping(planCode){const p=this.activePlans().find(p=>p.plan_code===planCode);if(!p)throw new CatalogUnavailableError();return {priceId:p.stripe.price_id,policyId:p.policy_id,planVersion:p.plan_version};}
}
module.exports={PlanSchema,CommercialCatalog,CatalogUnavailableError};
