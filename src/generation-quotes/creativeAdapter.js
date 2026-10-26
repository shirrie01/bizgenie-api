const {QuoteError,digest}=require('./service');
const {ImageGenerationRequestSchema}=require('../image-generation/schema');const {VideoGenerationRequestSchema}=require('../video-generation/schema');
// Bridge only: existing services/providers/storage remain authoritative. Never composed by default.
class ExistingCreativeServicesAdapter{
 constructor({jobs,mediaAssets,imageService,videoService}){Object.assign(this,{jobs,mediaAssets,imageService,videoService});}
 async bound(id,request,profile){const job=await this.jobs.getById(id),stored=await this.jobs.getExecutionContent(id);
  if(!job||!stored||digest(stored.request)!==digest(request)||digest(stored.profile)!==digest(profile)||stored.request_fingerprint!==digest(request)||job.tenant_id!==request.tenant_id||job.project_id!==request.project_id||job.execution_class!==request.execution_class)throw new QuoteError('EXECUTION_BINDING_INVALID',503);
  return job;
 }
 async outcome(job,asset,request,reference){const owned=await this.mediaAssets.findOwned({assetId:asset?.asset_id,tenantId:job.tenant_id,projectId:job.project_id});
  if(!owned||owned.status!=='active'||owned.source_kind!=='generated'||owned.generation_job_id!==job.job_id||owned.generation_id!==job.job_id)throw new QuoteError('PRIVATE_ASSET_UNAVAILABLE',503);
  return {status:'succeeded',...(reference?{provider_reference:reference}:{}),result:{asset_id:owned.asset_id,generation_id:job.job_id,media_kind:owned.media_kind,provenance:{origin:request.execution_mode==='hybrid'?'hybrid':'ai_generated',supplied_asset_ids:request.supplied_assets.map(a=>a.asset_id)}}};
 }
 async submit({idempotency_key,profile,request}){
  const job=await this.bound(idempotency_key,request,profile);if(!request.execution_brief)throw new QuoteError('CREATIVE_BRIEF_REQUIRED',422);
  const common={execution_id:job.request_correlation_id,generation_id:job.job_id,user_id:job.actor_correlation.auth_user_id,project_id:job.project_id,brand_id:job.brand_id,campaign_id:request.campaign_id,topic:request.execution_brief,aspect_ratio:profile.aspect_ratio};
  if(job.execution_class==='image.normal'&&this.imageService){
   if(this.imageService.provider.model!==profile.provider_model)throw new QuoteError('QUOTE_CHANGED');
   const input=ImageGenerationRequestSchema.parse({...common,image_purpose:request.execution_brief,reference_assets:request.supplied_assets.map(a=>({asset_id:a.asset_id}))});
   const record=await this.imageService.generate(input,{job});return this.outcome(job,record.asset,request,record.provider_job_id);
  }
  if(['video.normal','video.premium'].includes(job.execution_class)&&this.videoService){
   const provider=this.videoService.provider;const expected=provider instanceof require('../video-generation/googleVeoProvider').GoogleVertexVeoProvider?require('../video-generation/googleVeoProvider').modelForQuality(job.execution_class.split('.')[1]):provider.modelForQuality?.(job.execution_class.split('.')[1]);
   if(expected!==profile.provider_model)throw new QuoteError('QUOTE_CHANGED');
   if(request.supplied_assets.length>1)throw new QuoteError('OPERATION_UNSUPPORTED',422);
   const input=VideoGenerationRequestSchema.parse({...common,video_purpose:request.execution_brief,quality:job.execution_class.split('.')[1],duration_seconds:profile.duration_seconds,...(request.supplied_assets.length?{input_image:{asset_id:request.supplied_assets[0].asset_id}}:{})});
   const record=await this.videoService.submit(input,{job});return {status:'pending',provider_reference:record.provider_job_id};
  }
  throw new QuoteError('OPERATION_UNSUPPORTED',422);
 }
 async reconcile({idempotency_key,profile}){
  const stored=await this.jobs.getExecutionContent(idempotency_key);if(!stored)return {status:'unknown'};const job=await this.bound(idempotency_key,stored.request,profile);
  if(job.execution_class.startsWith('image.')){
   const assets=await this.mediaAssets.findGeneratedForJob({jobId:job.job_id,tenantId:job.tenant_id,projectId:job.project_id});
   return assets.length===1?this.outcome(job,assets[0],stored.request):{status:'unknown'};
  }
  if(job.execution_class.startsWith('video.')&&this.videoService){
   let record;try{record=await this.videoService.get(job.job_id);}catch{return {status:'unknown'};}
   if(record.generation_job_id!==job.job_id||record.tenant_id!==job.tenant_id||!record.provider_job_id)return {status:'unknown'};
   try{record=await this.videoService.poll(job.job_id);}catch(error){if(error.code==='VIDEO_PROVIDER_FAILED')return {status:'failed',definitive:true,provider_reference:record.provider_job_id};return {status:'unknown',provider_reference:record.provider_job_id};}
   return record.status==='completed'?this.outcome(job,record.asset,stored.request,record.provider_job_id):{status:'pending',provider_reference:record.provider_job_id};
  }
  return {status:'unknown'};
 }
}
module.exports={ExistingCreativeServicesAdapter};
