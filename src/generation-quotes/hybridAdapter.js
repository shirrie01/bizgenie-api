const {QuoteError,digest}=require('./service');
class HybridCompositionAdapter{
 constructor({jobs,intake,storyboardGenerator,compositor,assetStore,inspector,executionPolicy=null}){Object.assign(this,{jobs,intake,compositor,assetStore,inspector,executionPolicy});this.storyboard=executionPolicy?executionPolicy.guard(storyboardGenerator):storyboardGenerator;}
 async submit({idempotency_key,profile,request}){
  const job=await this.jobs.getById(idempotency_key),stored=await this.jobs.getExecutionContent(idempotency_key);
  if(!job||!stored||digest(stored.request)!==digest(request)||digest(stored.profile)!==digest(profile)||request.execution_mode!=='hybrid'||job.execution_class!=='video.normal'||profile.composition_engine!==this.compositor.id||!request.execution_brief||request.supplied_assets.length!==1)throw new QuoteError('OPERATION_UNSUPPORTED',422);
  const actor=job.actor_correlation,scope={tenant_id:job.tenant_id,project_id:job.project_id,brand_id:job.brand_id},ref=request.supplied_assets[0];
  const before=await this.intake.referenceForComposition(actor,ref.asset_id,scope),pinned=profile.reference_bindings?.find(a=>a.asset_id===ref.asset_id);if(!pinned||before.sha256!==pinned.sha256||before.generation!==pinned.generation)throw new QuoteError('QUOTE_CHANGED');
  const plan=await this.storyboard({brief:request.execution_brief,model:profile.provider_model,brand_snapshot:profile.brand_snapshot.record});
  // Recheck rights after the possibly external AI stage and before rendering customer media.
  const source=await this.intake.referenceForComposition(actor,ref.asset_id,scope);if(source.sha256!==before.sha256||source.generation!==before.generation)throw new QuoteError('QUOTE_CHANGED');
  const output=await this.compositor.compose({source:source.bytes,storyboard:plan,profile});
  await this.intake.referenceForComposition(actor,ref.asset_id,scope);
  const asset=await this.assetStore.saveComposed({data:output,lineage:{tenant_id:job.tenant_id,project_id:job.project_id,generation_job_id:job.job_id,generation_id:job.job_id}},{inspect:this.inspector});
  return {status:'succeeded',result:{asset_id:asset.asset_id,generation_id:job.job_id,media_kind:'video',provenance:{origin:'hybrid',supplied_asset_ids:[ref.asset_id],source_sha256:[source.sha256],composition_engine:this.compositor.id,storyboard_origin:'ai_assisted'}}};
 }
 async reconcile(){return {status:'unknown'};}
}
module.exports={HybridCompositionAdapter};
