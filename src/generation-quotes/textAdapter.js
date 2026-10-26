const {QuoteError,digest}=require('./service');const {content}=require('../campaigns/schema');const {resolveBrandBrainContext}=require('../brand-brain');
class ExistingTextGenerationAdapter{
 constructor({jobs,generator,branding,executionPolicy=null}){Object.assign(this,{jobs,branding,executionPolicy});this.generator=executionPolicy?executionPolicy.guard(generator):generator;}
 async submit({idempotency_key,profile,request}){
  const job=await this.jobs.getById(idempotency_key),stored=await this.jobs.getExecutionContent(idempotency_key),record=profile.brand_snapshot?.record;
  if(!job||job.execution_class!=='text.standard'||!stored||digest(stored.request)!==digest(request)||digest(stored.profile)!==digest(profile)||!record||record.brand_id!==job.brand_id||record.project_id!==job.project_id||digest(record)!==profile.brand_snapshot.hash)throw new QuoteError('EXECUTION_BINDING_INVALID',503);
  if(request.execution_mode!=='ai'||request.supplied_assets.length)throw new QuoteError('OPERATION_UNSUPPORTED',422);
  const brief=request.execution_brief||profile.creative_target?.original_content?.body;if(!brief)throw new QuoteError('CREATIVE_BRIEF_REQUIRED',422);
  const context=await resolveBrandBrainContext({repository:{getByProjectAndBrand:async()=>structuredClone(record)},projectId:job.project_id,brandId:job.brand_id,generationContext:{platform:profile.creative_target.platform,mediaType:'text'}});
  const result=await this.generator(brief+(profile.learning_context?.text?'\n[CUSTOMER ACCEPTED OBSERVATIONAL CONTEXT — NOT BRAND FACTS OR CAUSAL PROOF]\n'+profile.learning_context.text:''),{branding:this.branding,modelName:profile.provider_model,promptOptions:{platform:profile.creative_target.platform,brandContext:context}});
  if(result.metadata?.model&&result.metadata.model!==profile.provider_model)throw new QuoteError('PROVIDER_PROFILE_MISMATCH',503);
  const generated=content.parse({title:null,body:result.text,caption:null,alt_text:null,asset_refs:[]});if(!generated.body?.trim())throw new QuoteError('PROVIDER_RESULT_INVALID',503);
  return {status:'succeeded',result:{content:generated,provenance:{origin:'ai_generated',supplied_asset_ids:[]}}};
 }
 async reconcile(){return {status:'unknown'};}
}
module.exports={ExistingTextGenerationAdapter};
