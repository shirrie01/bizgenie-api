const {it}=require('node:test');const assert=require('node:assert/strict');
const {createTikTokPlatform}=require('../src/social-connectors/tiktok');const {createLinkedInPlatform,STAGING_STUDIO_REDIRECT_URI}=require('../src/social-connectors/linkedin');const {configuration,authorizeURL}=require('../src/social-publishing/oauthConfiguration');
const vault={ready(){},driver:{}},operations={};
const li=env=>createLinkedInPlatform({vault,operations,env:{LINKEDIN_CLIENT_ID:'synthetic_id',LINKEDIN_CLIENT_SECRET:'synthetic_secret',LINKEDIN_APP_REVIEW_APPROVED:'true',LINKEDIN_OAUTH_REVIEW_REF:'synthetic_review',...env}});
const tt=env=>createTikTokPlatform({vault,operations,mediaSource:{loadApprovedVideo(){},revalidate(){}},uploadPolicy:{chunkBytes:5,reviewRef:'r',uploadOrigins:['https://upload.example.test']},env:{TIKTOK_CLIENT_KEY:'synthetic_key',TIKTOK_CLIENT_SECRET:'synthetic_secret',TIKTOK_APP_REVIEW_APPROVED:'true',TIKTOK_OAUTH_REVIEW_REF:'synthetic_review',...env}});
const STUDIO={linkedin:'https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin',tiktok:'https://staging-app.getbizgenie.com/customer/social/oauth/callback/tiktok'};
it('Studio-hosted staging callback is accepted for both providers only when the API runs as staging, and is the exact redirect in the authorize URL',async()=>{
 assert.equal(STAGING_STUDIO_REDIRECT_URI,STUDIO.linkedin);
 for(const [name,make,key] of [['linkedin',li,'LINKEDIN_REDIRECT_URI'],['tiktok',tt,'TIKTOK_REDIRECT_URI']]){
  const p=await make({BIZGENIE_ENVIRONMENT:'staging',[key]:STUDIO[name]});assert.deepEqual(p.oauth.approved_redirect_uris,[STUDIO[name]]);
  assert.equal(new URL(authorizeURL(configuration(name,p),{state:'s'.repeat(43),challenge:'c'.repeat(43)})).searchParams.get('redirect_uri'),STUDIO[name]);
  await assert.rejects(make({[key]:STUDIO[name]}),{status:503});await assert.rejects(make({BIZGENIE_ENVIRONMENT:'production',[key]:STUDIO[name]}),{status:503});
  for(const bad of [STUDIO[name]+'?x=1',STUDIO[name]+'#f',STUDIO[name].replace('https://','https://u:p@'),STUDIO[name].replace('.com','.com:8443'),STUDIO[name].replace('staging-app','staging-app.evil'),STUDIO[name].replace('staging-app','stagingg-app'),STUDIO[name].replace(name,name==='tiktok'?'linkedin':'tiktok'),STUDIO[name].replace('https','http'),'https://staging-app.getbizgenie.com/customer/social/oauth/callback/'+name+'/'])await assert.rejects(make({BIZGENIE_ENVIRONMENT:'staging',[key]:bad}),{status:503},bad);
 }
});
