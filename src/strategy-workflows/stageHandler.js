const {QuoteError}=require('../generation-quotes/service');
const {deriveAllowableEvidenceAnchors,resolveEvidenceAnchorReferences,validateSelectedStrategy,validateFinalDraftStrategyFidelity,validateDraftExecutionFidelity,renderEvidenceAnchorCatalog,renderSelectedStrategyExecutionContract,CAMPAIGN_CREATIVE_BRIEF}=require('../campaigns/generation');
class StrategyStageHandler{
 async run({request,profile,context,generator,branding}){
  const campaign={goal:profile.content_dna.customer_objective},variant=profile.creative_target,stage=request.strategy_stage.stage;
  const anchors=deriveAllowableEvidenceAnchors(campaign.goal,context),previous=profile.strategy_context.previous;
  const prompt=[request.execution_brief||campaign.goal,CAMPAIGN_CREATIVE_BRIEF,'Content DNA is a declared plan, not verified causal evidence: '+JSON.stringify(profile.content_dna),profile.learning_context?.text||'',stage==='strategy'?renderEvidenceAnchorCatalog(anchors):renderSelectedStrategyExecutionContract(previous?.strategy?.selected_strategy)].join('\n');
  const result=await generator(prompt,{branding,modelName:profile.provider_model,promptOptions:{platform:variant.platform,brandContext:context,campaignObjective:campaign.goal,campaignInstructions:CAMPAIGN_CREATIVE_BRIEF,structuredMode:stage==='strategy'?'strategy':'draft',evidenceAnchorCatalog:renderEvidenceAnchorCatalog(anchors)}});
  if(result.metadata?.model&&result.metadata.model!==profile.provider_model)throw new QuoteError('PROVIDER_PROFILE_MISMATCH',503);
  if(stage==='strategy'){
   const resolved=resolveEvidenceAnchorReferences(result.metadata,anchors),selection=result.metadata?.selection_evidence;
   if(!resolved.ok||!validateSelectedStrategy(resolved.selected_strategy,{campaign,variant,brandContext:context,candidates:resolved.candidates,selection_evidence:selection}).ok)throw new QuoteError('STRATEGY_OUTPUT_REQUIRES_REVIEW',409);
   return {status:'succeeded',result:{strategy:{selected_strategy:resolved.selected_strategy,candidates:resolved.candidates,selection_evidence:selection,content_dna:profile.content_dna},provenance:{origin:'ai_generated_strategy',workflow_id:request.strategy_stage.workflow_id}}};
  }
  const selected=previous?.strategy?.selected_strategy;if(!selected||require('../generation').findMissingSections(result.text).length||!validateDraftExecutionFidelity(result.text,selected).ok||!validateFinalDraftStrategyFidelity(result.text,{campaign,brandContext:context,selected_strategy:selected}).ok)throw new QuoteError('STRATEGY_OUTPUT_REQUIRES_REVIEW',409);
  return {status:'succeeded',result:{content:{title:null,body:result.text,caption:null,alt_text:null,asset_refs:[]},provenance:{origin:'ai_generated',workflow_id:request.strategy_stage.workflow_id,predecessor_job_id:previous.job_id,predecessor_result_hash:previous.result_hash,supplied_asset_ids:[]}}};
 }
}
module.exports={StrategyStageHandler};
