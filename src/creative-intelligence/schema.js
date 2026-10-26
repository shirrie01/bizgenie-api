const { z } = require('zod');
const { identifier, uuid } = require('../campaigns/schema');
const label = z.string().trim().min(1).max(100);
const block = z.string().trim().max(2000).nullable();
const DnaInput = z.object({
  schema_version: z.literal('content-dna.v1'),
  classification_version: label,
  hook_type: label, narrative_framework: label, engagement_trigger_type: label, cta_type: label,
  hook: block, context: block, value: block, engagement_trigger: block, closure_cta: block,
}).strict();
const unknownDna = () => ({ schema_version:'content-dna.v1', classification_version:'unclassified.v1',hook_type:'unknown',narrative_framework:'unknown',engagement_trigger_type:'unknown',cta_type:'unknown',hook:null,context:null,value:null,engagement_trigger:null,closure_cta:null });
function plan(request,binding) {
  return { ...DnaInput.parse(request.content_dna || unknownDna()), provenance:request.content_dna?'customer_declared_plan':'unclassified',verified_against_output:false,
    customer_objective:binding.goal,platform:binding.platform,placement:binding.placement,format:binding.format,
    brand_snapshot_id:binding.brand_snapshot.id,brand_snapshot_hash:binding.brand_snapshot.hash };
}
const Assignment=z.object({variant_id:uuid,revision_id:uuid,label:label,audience_ref:identifier.nullable()}).strict();
const Experiment=z.object({campaign_id:uuid,objective:identifier,hypothesis:z.string().trim().min(1).max(2000),
  category:z.enum(['hook_ab','cta_ab','offer_ab','creative_format','image_concept','video_concept','platform','audience_message']),tested_variable:label,
  assignments:z.array(Assignment).min(2).max(10),metric:z.enum(['reach','views','impressions','clicks','leads','conversions','sales','revenue']),unit:z.enum(['count','gbp','usd','eur']),
  period:z.object({from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true})}).strict(),
  attribution:z.enum(['organic','paid']),attribution_policy:identifier,
  decision_policy:z.literal('observational.v1'),
}).strict().refine(e=>new Set(e.assignments.map(a=>a.variant_id)).size===e.assignments.length&&Date.parse(e.period.from)<Date.parse(e.period.to)&&Date.parse(e.period.to)-Date.parse(e.period.from)<=93*86400000&&(e.metric==='revenue'?e.unit!=='count':e.unit==='count'));
module.exports={DnaInput,unknownDna,plan,Experiment};
