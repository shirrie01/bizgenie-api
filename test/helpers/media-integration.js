const { randomUUID } = require("node:crypto");
const { createApp } = require("../../index");
const { InMemoryBrandBrainRepository } = require("../../src/brand-brain");
const { ImageGenerationService, InMemoryImageGenerationRepository, OpenAIImageProvider } = require("../../src/image-generation");
const { VideoGenerationService, InMemoryVideoGenerationRepository, GoogleVertexVeoProvider } = require("../../src/video-generation");
const { InMemoryMediaAssetRepository, GoogleCloudMediaStorage, DurableMediaAssetStore, RightsAwareMediaReferenceLoader, objectKey } = require("../../src/media");
const { InMemoryCampaignRepository, InMemoryPreviewRegistry } = require("../../src/campaigns");
const { InMemoryAuthorizationRepository, AuthenticationRequiredError, createCustomerActorFromVerifiedIdentity } = require("../../src/authorization");
const { scenario, context, content, NOW } = require("./campaign-regressions");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=", "base64");
const OTHER = "22222222-2222-4222-8222-222222222222";
async function integrationFixture({ kind = "image", allowedOrigins = ["https://studio.example"], platform, previewProfiles, videoBytes } = {}) {
  const bucket = "private-media-integration", referenceId = randomUUID(), jobId = "integration_job_" + randomUUID();
  const state = { objects: new Map(), storage: [], providerCalls: 0, generations: 100, onStat: null, jobBrand: "brand_a" };
  const referenceKey = objectKey({tenantId:"tenant_a",projectId:"project_a",mediaKind:"image",assetId:referenceId,extension:"png"});
  state.objects.set(referenceKey,{data:PNG,mime:"image/png",generation:"99"});
  const mediaRepository = new InMemoryMediaAssetRepository();
  await mediaRepository.create({asset_id:referenceId,tenant_id:"tenant_a",project_id:"project_a",brand_id:"brand_a",source_kind:"reference",media_kind:"image",storage_bucket:bucket,storage_key:referenceKey,mime_type:"image/png",allowed_uses:["image.generate.reference","video.generate.reference","campaign.preview"],status:"active",created_at:NOW});
  const storage = new GoogleCloudMediaStorage({bucket,accessTokenProvider:async()=>"fixture-gcs-token",fetchImpl:async(url,init={})=>{
    const u=new URL(url);state.storage.push({url,init});
    if(u.pathname.startsWith("/upload/")){
      const key=u.searchParams.get("name"),data=Buffer.from(init.body);const generation=String(++state.generations);
      state.objects.set(key,{data,mime:init.headers["content-type"],generation});return new Response(JSON.stringify({bucket,name:key,size:String(data.length)}));
    }
    if(u.pathname.includes("/rewriteTo/")){
      const parts=/\/o\/([^/]+)\/rewriteTo\/b\/[^/]+\/o\/([^/]+)$/.exec(u.pathname),source=state.objects.get(decodeURIComponent(parts[1])),key=decodeURIComponent(parts[2]);
      state.objects.set(key,{...source,generation:String(++state.generations)});return new Response(JSON.stringify({done:true,resource:{bucket,name:key,size:String(source.data.length)}}));
    }
    const key=decodeURIComponent(u.pathname.slice(u.pathname.lastIndexOf("/o/")+3)),object=state.objects.get(key);
    if(!object)return new Response("not found",{status:404});
    if(u.searchParams.has("fields")){
      const metadata={size:String(object.data.length),contentType:object.mime,generation:object.generation};state.onStat?.(object);
      return new Response(JSON.stringify(metadata));
    }
    if(u.searchParams.has("generation") && (u.searchParams.get("generation")!==object.generation || u.searchParams.get("ifGenerationMatch")!==object.generation))return new Response("generation mismatch",{status:412});
    const range=init.headers?.Range?.match(/^bytes=(\d+)-(\d+)$/),start=range?Number(range[1]):0,end=range?Number(range[2]):object.data.length-1;
    const data=object.data.subarray(start,end+1);
    return new Response(data,{status:range?206:200,headers:{"content-type":object.mime,"content-length":String(data.length),...(range?{"content-range":`bytes ${start}-${end}/${object.data.length}`}:{})}});
  }});
  const job=Object.freeze({job_id:jobId,tenant_id:"tenant_a",project_id:"project_a",brand_id:"brand_a",execution_class:kind==="image"?"image.normal":"video.normal",actor_correlation:{auth_user_id:context.actor.auth_user_id}});
  const lineage={generation_id:"generation_"+randomUUID(),generation_job_id:jobId,tenant_id:job.tenant_id,project_id:job.project_id};
  let result;
  if(kind==="image"){
    const provider=new OpenAIImageProvider({apiKey:"fixture-only",outputFormat:"png",assetStore:new DurableMediaAssetStore({mediaKind:"image",repository:mediaRepository,storage,now:()=>new Date(NOW)}),
      referenceAssetLoader:new RightsAwareMediaReferenceLoader({repository:mediaRepository,storage,delivery:"bytes"}),fetchImpl:async()=>{state.providerCalls++;return new Response(JSON.stringify({data:[{b64_json:PNG.toString("base64")}]}),{headers:{"x-request-id":"fixture-image-request"}});}});
    const service=new ImageGenerationService({repository:new InMemoryImageGenerationRepository(),provider,brandBrainRepository:new InMemoryBrandBrainRepository(),now:()=>new Date(NOW)});
    result=await service.generate({execution_id:"execution_image",generation_id:lineage.generation_id,user_id:context.actor.auth_user_id,project_id:job.project_id,brand_id:job.brand_id,topic:"Synthetic fixture",image_purpose:"Integration test",aspect_ratio:"1:1",reference_assets:[{asset_id:referenceId}]},{job});
  }else{
    const outputKey="provider-outputs/fixture.mp4";
    state.objects.set(outputKey,{data:videoBytes ?? Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypisom"),Buffer.alloc(52)]),mime:"video/mp4",generation:"98"});
    let operation;
    const provider=new GoogleVertexVeoProvider({projectId:"bizgenie-test-123",outputStorageUri:`gs://${bucket}/provider-outputs/`,transport:{async post(url,body){
      if(url.endsWith(":predictLongRunning")){state.providerCalls++;operation="projects/bizgenie-test-123/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/fixture";return {name:operation};}
      return {name:operation,done:true,response:{videos:[{gcsUri:`gs://${bucket}/${outputKey}`,mimeType:"video/mp4"}]}};
    }}});
    const service=new VideoGenerationService({repository:new InMemoryVideoGenerationRepository(),provider,brandBrainRepository:new InMemoryBrandBrainRepository(),now:()=>new Date(NOW),referenceAssetLoader:new RightsAwareMediaReferenceLoader({repository:mediaRepository,storage,delivery:"gcs"}),assetStore:new DurableMediaAssetStore({mediaKind:"video",repository:mediaRepository,storage,videoSourcePrefix:`gs://${bucket}/provider-outputs/`,now:()=>new Date(NOW)})});
    await service.submit({execution_id:"execution_video",generation_id:lineage.generation_id,user_id:context.actor.auth_user_id,project_id:job.project_id,brand_id:job.brand_id,topic:"Synthetic fixture",video_purpose:"Integration test",quality:"normal",duration_seconds:4,aspect_ratio:"16:9",input_image:{asset_id:referenceId}},{job});
    result=await service.poll(lineage.generation_id);
  }
  const assetId=result.asset.asset_id;
  const resolveMedia=async(_context,id)=>{
    const row=await mediaRepository.findOwned({assetId:id,tenantId:job.tenant_id,projectId:job.project_id});
    if(!row)return null;
    return {...row,brand_id:state.jobBrand,job_id:row.generation_job_id,manifest:{asset_id:id,mime_type:row.mime_type,width:row.width??null,height:row.height??null,duration_ms:row.duration_seconds==null?null:row.duration_seconds*1000,byte_size:row.byte_size??null}};
  };
  const registry=new InMemoryPreviewRegistry({now:()=>new Date(NOW), ...(previewProfiles ? { profiles: previewProfiles } : {})});
  const repository=new InMemoryCampaignRepository({now:()=>new Date(NOW),authorize:async()=>true,resolveMedia,
    resolvePreviewReceipt:(...args)=>registry.resolvePreviewReceipt(...args),validatePreview:(...args)=>registry.validatePreview(...args),
    captureBrandSnapshot:async()=>({brand_snapshot_id:randomUUID(),tenant_id:"tenant_a",project_id:"project_a",brand_id:"brand_a",source_version:1,source_updated_at:NOW,source_schema_version:"brand-brain.v1",snapshot:{name:"Fixture"},snapshot_hash:"a".repeat(64),captured_at:NOW})});
  const s=await scenario(repository);
  const added=await s.cmd("create_content_item",{name:"Fixture creative",format:kind,platform:platform ?? (kind==="image"?"instagram":"tiktok"),placement:"feed",destination_label:"Fixture",initial_content:{...content,asset_refs:[{asset_id:assetId,role:"primary"}]}});
  const target={variant_id:added.created_ids.variant_ids[0],revision_id:added.created_ids.revision_ids[0]};
  const auth=new InMemoryAuthorizationRepository({customerProfiles:[{auth_user_id:context.actor.auth_user_id},{auth_user_id:OTHER}],tenants:[{tenant_id:"tenant_a",name:"A",created_by:context.actor.auth_user_id},{tenant_id:"tenant_b",name:"B",created_by:OTHER}],memberships:[{tenant_id:"tenant_a",auth_user_id:context.actor.auth_user_id,role:"owner"},{tenant_id:"tenant_b",auth_user_id:OTHER,role:"owner"}],projects:[{project_id:"project_a",tenant_id:"tenant_a",name:"A"},{project_id:"project_b",tenant_id:"tenant_b",name:"B"}],brands:[]});
  const app=createApp({campaignRepository:repository,previewRegistry:registry,mediaPreviewStorage:storage,authorizationRepository:auth,
    customerTokenVerifier:{async verifyAccessToken(token){if(!["a","b"].includes(token))throw new AuthenticationRequiredError();return createCustomerActorFromVerifiedIdentity({verifiedAuthUserId:token==="a"?context.actor.auth_user_id:OTHER});}},corsConfig:{enabled:true,allowedOrigins},logger:{info(){},warn(){},error(){}}});
  const metadataPath=`/customer/campaigns/${s.id}/variants/${target.variant_id}/creative-preview`;
  const deliveryPath=`/customer/campaigns/${s.id}/variants/${target.variant_id}/revisions/${target.revision_id}/assets/${assetId}/preview`;
  state.storage=[];
  return {app,s,target,assetId,referenceId,job,storage,state,repository,registry,mediaRepository,metadataPath,deliveryPath,
    scope:{tenant_id:"tenant_a",project_id:"project_a"},context,PNG};
}
module.exports={integrationFixture};
