'use strict';
// Optional staging server entrypoint. Not imported by normal API startup and never deployed automatically.
const {createStudioBridge}=require('../../src/studio-bridge/service');
const {createSupabaseCustomerTokenVerifierFromEnv}=require('../../src/authentication');
function createExistingInvokerProvider({project,audience,VertexAI=require('@google-cloud/vertexai').VertexAI}){
 let client;
 return async()=>{
  if(!client){const auth=new VertexAI({project,location:'us-central1'}).googleAuth;client=await auth.getIdTokenClient(audience);}
  const h=await client.getRequestHeaders();const value=typeof h.get==='function'?h.get('authorization'):h.authorization||h.Authorization;
  if(!/^Bearer [^\s]+$/.test(value||''))throw Error('Invoker unavailable');
  const token=value.slice(7);let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{throw Error('Invoker unavailable');}
  if(claims.email!=='bizgenie-staging-runtime@bizgenie-backend.iam.gserviceaccount.com'||claims.aud!==audience||!Number.isSafeInteger(claims.exp)||claims.exp<=Date.now()/1000)throw Error('Reviewed staging invoker required');
  return token;
 };
}
function fromEnv(env=process.env){
 if(env.SUPABASE_URL!=='https://zrczojyxebwjgpymbmgu.supabase.co'||!env.SUPABASE_PUBLISHABLE_KEY)throw Error('Staging public auth configuration required');
 const target={environment:env.BIZGENIE_ENVIRONMENT,upstream:env.BG_BRIDGE_TARGET_URL,audience:env.BG_BRIDGE_AUDIENCE,revision:env.BG_BRIDGE_REVISION,sourceSha:env.BG_BRIDGE_SOURCE_SHA,reviewRef:env.BG_BRIDGE_REVIEW_REF,origin:env.BG_BRIDGE_STUDIO_ORIGIN||'https://staging-app.getbizgenie.com',allowWorkspaceBootstrap:env.BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP==='true',allowStripeCheckout:env.BG_BRIDGE_ALLOW_STRIPE_CHECKOUT==='true',allowWrites:env.BG_BRIDGE_ALLOW_WRITES==='true',allowGenerationConfirmation:env.BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION==='true',allowSocialWrites:env.BG_BRIDGE_ALLOW_SOCIAL_WRITES==='true'};
 return createStudioBridge({target,tokenVerifier:createSupabaseCustomerTokenVerifierFromEnv({env}),iamTokenProvider:createExistingInvokerProvider({project:'bizgenie-backend',audience:new URL(target.audience).origin})});
}
if(require.main===module){try{const bind=process.env.BG_BRIDGE_BIND||'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(bind))throw Error();const port=Number(process.env.PORT||8081);if(!Number.isInteger(port)||port<1||port>65535)throw Error();fromEnv().listen(port,bind,()=>console.log('Reviewed staging bridge listening; credentials are never logged'));}catch{console.error('STAGING_BRIDGE_CONFIGURATION_UNAVAILABLE');process.exitCode=1;}}
module.exports={fromEnv,createExistingInvokerProvider};
