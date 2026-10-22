// Optional browser transport proof. Requires an available Playwright installation and Chromium;
// no application dependency, deployed endpoint or real provider/storage credential is used.
const assert=require("node:assert/strict");
const http=require("node:http");
const {chromium}=require("playwright");
const {integrationFixture}=require("../test/helpers/media-integration");
async function listen(server){await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));return `http://127.0.0.1:${server.address().port}`;}
(async()=>{
  const frontend=http.createServer((_req,res)=>res.end("<!doctype html><title>Local media integration fixture</title><body>Fixture</body>"));
  const foreign=http.createServer((_req,res)=>res.end("<!doctype html><title>Foreign fixture</title>"));
  let api,browser;
  try{
    const origin=await listen(frontend),foreignOrigin=await listen(foreign);
    const f=await integrationFixture({allowedOrigins:[origin]});const seen=[];
    api=http.createServer((req,res)=>{seen.push({cookie:req.headers.cookie,authorization:req.headers.authorization,method:req.method});f.app(req,res);});const apiOrigin=await listen(api);
    const video=await integrationFixture({kind:"video",allowedOrigins:[origin]});
    const videoServer=http.createServer(video.app);const videoOrigin=await listen(videoServer);
    try{
      browser=await chromium.launch({executablePath:process.argv[2]||"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
      const context=await browser.newContext();
      await context.route("**/*",route=>{const u=new URL(route.request().url());if([origin,foreignOrigin,apiOrigin,videoOrigin].includes(u.origin))return route.continue();return route.abort();});
      await context.addCookies([{name:"unrelated_fixture_cookie",value:"not-a-credential",url:origin}]);
      const page=await context.newPage();await page.goto(origin);
      const q=new URLSearchParams({...f.scope,expected_campaign_version:"2"});
      const metadataURL=apiOrigin+f.metadataPath+"?"+q+"&revision_id="+f.target.revision_id;
      const mediaURL=apiOrigin+f.deliveryPath+"?"+q;
      const result=await page.evaluate(async({metadataURL,mediaURL})=>{
        const headers={authorization:"Bearer a"};
        const m=await fetch(metadataURL,{headers,credentials:"omit"});const preview=(await m.json()).preview;
        const h=await fetch(mediaURL,{method:"HEAD",headers,credentials:"omit"});
        const r=await fetch(mediaURL,{headers,credentials:"omit"});const blob=await r.blob();const url=URL.createObjectURL(blob);
        const img=document.createElement("img");img.alt="Synthetic generated fixture";img.src=url;document.body.append(img);await img.decode();const width=img.naturalWidth;URL.revokeObjectURL(url);
        const denied=await fetch(mediaURL,{credentials:"omit"});
        const foreign=await fetch(mediaURL,{headers:{authorization:"Bearer b"},credentials:"omit"});
        const stale=await fetch(mediaURL.replace("expected_campaign_version=2","expected_campaign_version=1"),{headers,credentials:"omit"});
        return {metadata:m.status,source:preview.media[0].source_kind,head:h.status,mime:r.headers.get("content-type"),displayWidth:width,bytes:blob.size,anonymous:denied.status,foreign:foreign.status,stale:stale.status};
      },{metadataURL,mediaURL});
      assert.deepEqual(result,{metadata:200,source:"generated",head:200,mime:"image/png",displayWidth:1,bytes:f.PNG.length,anonymous:401,foreign:404,stale:409});
      assert.ok(seen.filter(x=>x.authorization).every(x=>x.cookie===undefined));
      const videoURL=videoOrigin+video.deliveryPath+"?"+q;
      const range=await page.evaluate(async url=>{const r=await fetch(url,{headers:{authorization:"Bearer a",Range:"bytes=0-7"},credentials:"omit"});return {status:r.status,range:r.headers.get("content-range"),bytes:(await r.arrayBuffer()).byteLength};},videoURL);
      assert.deepEqual(range,{status:206,range:"bytes 0-7/64",bytes:8});
      const before=f.state.storage.length;
      await page.goto(foreignOrigin);
      const blocked=await page.evaluate(async url=>{try{await fetch(url,{headers:{authorization:"Bearer a"},credentials:"omit"});return false;}catch{return true;}},mediaURL);
      assert.equal(blocked,true);assert.equal(f.state.storage.length,before);
      await page.goto(origin);f.mediaRepository.assets.get(f.assetId).allowed_uses=[];
      const revoked=await page.evaluate(async url=>(await fetch(url,{headers:{authorization:"Bearer a"},credentials:"omit"})).status,mediaURL);assert.equal(revoked,404);
      console.log(JSON.stringify({image:result,videoRange:range,foreignOriginBlocked:blocked,revoked,cookiesOmitted:true,scope:"local synthetic transport, not live provider or MP4 playback"}));
      await context.close();
    }finally{await new Promise(resolve=>videoServer.close(resolve));}
  }finally{if(browser)await browser.close();if(api)await new Promise(resolve=>api.close(resolve));await new Promise(resolve=>frontend.close(resolve));await new Promise(resolve=>foreign.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
