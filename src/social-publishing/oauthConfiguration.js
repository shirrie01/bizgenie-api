const {QuoteError,digest}=require('../generation-quotes/service');
const HOSTS={facebook:['www.facebook.com'],instagram:['www.instagram.com','api.instagram.com','www.facebook.com'],linkedin:['www.linkedin.com'],tiktok:['www.tiktok.com'],youtube:['accounts.google.com']};
function configuration(platform,p){
 if(!p.oauth)return null;
 const v=structuredClone(p.oauth);
 if(v.app_review_status!=='approved')throw new QuoteError('PLATFORM_APP_REVIEW_REQUIRED',422);
 try{
  const endpoint=new URL(v.authorization_endpoint),redirect=new URL(v.redirect_uri);
  if(endpoint.protocol!=='https:'||!HOSTS[platform]?.includes(endpoint.hostname)||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||v.redirect_uri.length>2048||redirect.protocol!=='https:'||redirect.port||redirect.username||redirect.password||redirect.search||redirect.hash||!Array.isArray(v.approved_redirect_uris)||!v.approved_redirect_uris.includes(v.redirect_uri)||!Array.isArray(v.scopes)||!v.scopes.length||v.scopes.some(s=>typeof s!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(s))||p.requiredScopes.some(s=>!v.scopes.includes(s))||typeof v.client_id!=='string'||!v.client_id||v.client_id.length>256||v.pkce_method!=='S256'||v.pkce_support_verified!==true||typeof v.review_ref!=='string'||!v.review_ref.trim()||typeof v.documentation_ref!=='string'||!v.documentation_ref.startsWith('https://'))throw Error();
 }catch{throw new QuoteError('OAUTH_CONFIGURATION_UNAVAILABLE',503);}
 return {...v,configuration_hash:digest([platform,v])};
}
function authorizeURL(config,{state,challenge}){
 const url=new URL(config.authorization_endpoint);
 for(const [k,v] of Object.entries({client_id:config.client_id,redirect_uri:config.redirect_uri,response_type:'code',scope:config.scopes.join(','),state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
 return url.href;
}
module.exports={configuration,authorizeURL};
