const { AuthenticationRequiredError, AuthorizationDeniedError } = require("../authorization");
const { AUTHENTICATION_ERROR, AUTHORIZATION_ERROR, AUTHORIZATION_UNAVAILABLE_ERROR, extractBearerToken, responseBody } = require("./customerGenerationBoundary");
function createCustomerVideoStatusBoundary({tokenVerifier,authorizationService,videoGenerationService,generationJobRepository,logger=console}){
  return async function authorizeCustomerVideoStatus(req,res,next){
    try{
      const pathMatch=req.path.match(/^\/([^/]+)(?:\/poll)?$/); if(!pathMatch) throw new AuthorizationDeniedError(); const generationId=pathMatch[1];
      const actor=await tokenVerifier.verifyAccessToken(extractBearerToken(req.header("authorization")));
      const record=await videoGenerationService.get(generationId); if(!record.tenant_id||!record.generation_job_id) throw new AuthorizationDeniedError();
      const authorization=record.brand_id?await authorizationService.authorizeProjectBrand({actor,tenantId:record.tenant_id,projectId:record.project_id,brandId:record.brand_id,action:"generation:create"}):await authorizationService.authorizeProject({actor,tenantId:record.tenant_id,projectId:record.project_id,action:"generation:create"});
      const job=await generationJobRepository.getById(record.generation_job_id); if(
        !job||
        job.job_id!==record.generation_job_id||
        job.tenant_id!==authorization.tenant_id||
        job.project_id!==authorization.project_id||
        job.request_correlation_id!==record.execution_id||
        job.execution_class!==`video.${record.quality}`||
        job.actor_correlation?.auth_user_id!==actor.auth_user_id||
        record.user_id!==actor.auth_user_id
      ) throw new AuthorizationDeniedError();
      res.locals.customerAuthorization=authorization; res.locals.generationJob=job; return next();
    }catch(error){
      if(error instanceof AuthenticationRequiredError) return res.status(401).json(responseBody("video",AUTHENTICATION_ERROR));
      if(error instanceof AuthorizationDeniedError||error?.code==="VIDEO_GENERATION_NOT_FOUND") return res.status(404).json(responseBody("video",AUTHORIZATION_ERROR));
      logger.error?.("customer video authorization unavailable",{code:AUTHORIZATION_UNAVAILABLE_ERROR.code,path:req.path}); return res.status(503).json(responseBody("video",AUTHORIZATION_UNAVAILABLE_ERROR));
    }
  };
}
module.exports={createCustomerVideoStatusBoundary};
