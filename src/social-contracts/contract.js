const {z}=require('zod');const {createHash,timingSafeEqual}=require('node:crypto');const {identifier,uuid,canonical}=require('../campaigns/schema');
class SocialContractError extends Error{constructor(code){super('Social authorization or dispatch is unavailable');this.code=code;}}
const hash=v=>createHash('sha256').update(typeof v==='string'?v:canonical(v)).digest('hex');
const Connection=z.object({connection_id:uuid,tenant_id:identifier,project_id:identifier,brand_id:identifier,platform:z.enum(['instagram','facebook','linkedin','tiktok','youtube']),account_id:identifier,granted_scopes:z.array(z.string().min(1).max(512).regex(/^[^\s\x00-\x1f]+$/)).max(100),token_reference:uuid,token_expires_at:z.string().datetime({offset:true}),status:z.enum(['active','revoked','expired']),version:z.number().int().positive()}).strict();
function validateOAuthCallback(intent,{state,tenant_id,project_id,brand_id,now}){
 if(!intent||intent.consumed!==false||!Number.isFinite(Date.parse(intent.expires_at))||Date.parse(intent.expires_at)<=now.getTime()||['tenant_id','project_id','brand_id'].some(k=>intent[k]!==({tenant_id,project_id,brand_id})[k])||typeof state!=='string'||state.length<32||state.length>256||!/^[a-f0-9]{64}$/.test(intent.state_hash||''))throw new SocialContractError('OAUTH_STATE_INVALID');
 if(!timingSafeEqual(Buffer.from(hash(state),'hex'),Buffer.from(intent.state_hash,'hex')))throw new SocialContractError('OAUTH_STATE_INVALID');
 if(!/^[A-Za-z0-9_-]{43}$/.test(intent.pkce_challenge||''))throw new SocialContractError('OAUTH_PKCE_REQUIRED');
 // Caller must atomically consume this persisted nonce before any code/token exchange; validation is not a CAS.
 return {nonce_id:intent.nonce_id,expected_consumed:false,consume:true};
}
function compileDispatch({context,connection:raw,binding,requiredScopes,now}){
 const parsed=Connection.safeParse(raw);if(!parsed.success)throw new SocialContractError('CONNECTION_INVALID');const connection=parsed.data;
 if(context.actor?.kind!=='customer'||!uuid.safeParse(context.actor.auth_user_id).success||context.membership_role!=='owner'||['tenant_id','project_id'].some(k=>context[k]!==connection[k])||connection.status!=='active'||Date.parse(connection.token_expires_at)<=now.getTime())throw new SocialContractError('CONNECTION_UNAVAILABLE');
 if(!Array.isArray(requiredScopes)||!requiredScopes.length||requiredScopes.some(s=>!connection.granted_scopes.includes(s)))throw new SocialContractError('PLATFORM_PERMISSION_REQUIRED');
 if(['tenant_id','project_id','brand_id','platform'].some(k=>binding[k]!==connection[k])||binding.destination_account_id!==connection.account_id||['current_revision','current_approval','current_schedule','rights_active','preview_active','explicit_publishing_consent'].some(k=>binding[k]!==true)||binding.expected_campaign_version!==binding.campaign_version)throw new SocialContractError('PUBLICATION_AUTHORITY_STALE');
 for(const key of ['campaign_id','variant_id','revision_id','schedule_id','approval_id'])if(!uuid.safeParse(binding[key]).success)throw new SocialContractError('PUBLICATION_AUTHORITY_STALE');
 return {contract_version:'social-dispatch.v1',dispatch_identity:hash([connection.tenant_id,connection.project_id,connection.connection_id,connection.account_id,binding.campaign_id,binding.variant_id,binding.revision_id,binding.approval_id,binding.schedule_id]),connection_version:connection.version,token_reference:connection.token_reference,tenant_id:connection.tenant_id,project_id:connection.project_id,brand_id:connection.brand_id,platform:connection.platform,campaign_id:binding.campaign_id,variant_id:binding.variant_id,revision_id:binding.revision_id,schedule_id:binding.schedule_id,account_id:connection.account_id};
}
function dispatchTransition(row,event){
 if(event.fence!==row.fence||event.claim_token!==row.claim_token)throw new SocialContractError('DISPATCH_FENCE_STALE');
 if(row.state==='succeeded'){if(event.type==='provider_success'&&row.provider_publication_id===event.provider_publication_id)return {...row};throw new SocialContractError('PUBLICATION_RESULT_CONFLICT');}
 if(event.type==='send'&&row.state==='claimed')return {...row,state:'sending'};
 if(event.type==='timeout'&&row.state==='sending')return {...row,state:'reconciliation_required'};
 if(event.type==='provider_success'&&['sending','reconciliation_required'].includes(row.state)&&typeof event.provider_publication_id==='string'&&event.provider_publication_id.length>0)return {...row,state:'succeeded',provider_publication_id:event.provider_publication_id,evidence_kind:'platform_api'};
 if(event.type==='provider_failure'&&['sending','reconciliation_required'].includes(row.state)&&event.definitive===true)return {...row,state:'failed'};
 throw new SocialContractError('DISPATCH_RECONCILIATION_REQUIRED');
}
// Deterministic adapter only, not a real supported-platform adapter or a durable store.
class MockSocialProvider{
 constructor({timeoutAfterAcceptance=false}={}){this.timeoutAfterAcceptance=timeoutAfterAcceptance;this.calls=0;this.accepted=new Map();}
 async submit(dispatch){this.calls++;const id='mock_'+dispatch.dispatch_identity;this.accepted.set(dispatch.dispatch_identity,id);if(this.timeoutAfterAcceptance)throw new Error('mock uncertain timeout');return {status:'succeeded',provider_publication_id:id};}
 async reconcile(dispatch){const id=this.accepted.get(dispatch.dispatch_identity);return id?{status:'succeeded',provider_publication_id:id}:{status:'unknown'};}
}
module.exports={Connection,validateOAuthCallback,compileDispatch,dispatchTransition,MockSocialProvider,SocialContractError,hash};
