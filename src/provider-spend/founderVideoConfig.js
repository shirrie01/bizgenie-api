// Parse operator-owned configuration only. No I/O, credentials, defaults for price or activation.
const {binding,MIN_STATUS_INTERVAL_MS}=require('./founderVideo');
const {SpendError}=require('./index');
const STAGING_SUPABASE='https://zrczojyxebwjgpymbmgu.supabase.co';
function reference(v){return typeof v==='string'&&/^[A-Za-z0-9_.:/#-]{1,160}$/.test(v)&&!/(UNKNOWN|UNRESOLVED|TODO|PLACEHOLDER)/i.test(v);}
function flag(v){if(v===undefined||v==='false')return false;if(v==='true')return true;throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');}
function readBinding(env,prefix,userKey){
 return binding({auth_user_id:env[userKey],tenant_id:env[prefix+'TENANT_ID'],project_id:env[prefix+'PROJECT_ID'],brand_id:env[prefix+'BRAND_ID'],campaign_id:env[prefix+'CAMPAIGN_ID'],variant_id:env[prefix+'VARIANT_ID']});
}
function bridgeVideoConfig(env){
 const enabled=flag(env.BG_BRIDGE_ALLOW_FOUNDER_VIDEO),prefix='BG_BRIDGE_FOUNDER_VIDEO_';
 if(!enabled){if(Object.keys(env).some(k=>k.startsWith(prefix)&&env[k]!==undefined))throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');return null;}
 if(env.BIZGENIE_ENVIRONMENT!=='staging'||env.SUPABASE_URL!==STAGING_SUPABASE||!reference(env[prefix+'APPROVAL_REF']))throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');
 return readBinding(env,prefix,'BG_BRIDGE_FOUNDER_AUTH_USER_ID');
}
function apiVideoConfig(env){
 const enabled=flag(env.FOUNDER_VIDEO_ACCEPTANCE_ENABLED),prefix='FOUNDER_VIDEO_';
 if(!enabled){if(Object.keys(env).some(k=>k.startsWith(prefix)&&k!=='FOUNDER_VIDEO_ACCEPTANCE_ENABLED'&&env[k]!==undefined))throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');return null;}
 if((env.GOOGLE_CLOUD_PROJECT||env.GCLOUD_PROJECT||env.GCP_PROJECT)!=='bizgenie-backend'||['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','GCP_PROJECT'].some(k=>env[k]!==undefined&&env[k]!=='bizgenie-backend')||env.BIZGENIE_ENVIRONMENT!=='staging'||env.SUPABASE_URL!==STAGING_SUPABASE||['QUOTED_GENERATION_ENABLED','VIDEO_GENERATION_ENABLED','MEDIA_STORAGE_ENABLED','BILLING_DURABLE_ENABLED'].some(k=>env[k]!=='true')||['PRODUCTION_ACTIVATION_ENABLED','IMAGE_GENERATION_ENABLED','SOCIAL_PUBLISHING_ENABLED','STRIPE_BILLING_ENABLED','STRATEGY_WORKFLOWS_ENABLED','LEARNING_ENABLED','MEDIA_INTAKE_ENABLED'].some(k=>env[k]!==undefined&&env[k]!=='false')||env.VIDEO_INSPECTION_ISOLATION!=='bubblewrap'||!/^gs:\/\/[a-z0-9][a-z0-9._-]+\/[A-Za-z0-9_./-]+$/.test(env.VIDEO_PROVIDER_OUTPUT_STORAGE_URI||'')||env.TEXT_GENERATION_MODEL||env.VIDEO_DURATION_SECONDS!=='4'||env.VIDEO_ASPECT_RATIO!=='9:16')throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');
 for(const k of ['APPROVAL_REF','SPEND_POLICY_VERSION','SUBMIT_ESTIMATE_VERSION','STATUS_ESTIMATE_VERSION'])if(!reference(env[prefix+k]))throw new SpendError('FOUNDER_VIDEO_CONFIGURATION_INVALID');
 const seconds=env.FOUNDER_VIDEO_STATUS_POLL_INTERVAL_SECONDS===undefined?MIN_STATUS_INTERVAL_MS/1000:Number(env.FOUNDER_VIDEO_STATUS_POLL_INTERVAL_SECONDS);
 if(!Number.isSafeInteger(seconds)||seconds<25||seconds>300)throw new SpendError('FOUNDER_VIDEO_POLL_INTERVAL_INVALID');
 return Object.freeze({minStatusIntervalMs:seconds*1000,founder:readBinding(env,prefix,prefix+'AUTH_USER_ID'),approvalRef:env[prefix+'APPROVAL_REF'],policyVersion:env[prefix+'SPEND_POLICY_VERSION'],submitVersion:env[prefix+'SUBMIT_ESTIMATE_VERSION'],statusVersion:env[prefix+'STATUS_ESTIMATE_VERSION']});
}
module.exports={reference,bridgeVideoConfig,apiVideoConfig,STAGING_SUPABASE};
