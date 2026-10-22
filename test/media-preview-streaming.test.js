const assert = require("node:assert/strict");
const { test } = require("node:test");
const http = require("node:http");
const express = require("express");
const request = require("supertest");
const { deliverPreview } = require("../src/media/previewDelivery");
const { GoogleCloudMediaStorage } = require("../src/media");
const asset = { bucket: "private-test", key: "not-client-controlled", mimeType: "video/mp4", mediaKind: "video", byteSize: 1024 };
function appFor(storage, timeoutMs) {
  const app = express(); app.get("/", async (req,res) => { try { await deliverPreview(req,res,asset,storage,{timeoutMs}); }
    catch (error) { if (!res.destroyed) res.status(error.status || 503).json({ error: "Unavailable" }); } }); return app;
}
test("deadline aborts even a stalled metadata operation and does not report success", async () => {
  let signal;
  const storage = { bucket: asset.bucket, statPreview(input) { signal = input.signal; return new Promise(()=>{}); } };
  const r=await request(appFor(storage,20)).get("/"); assert.equal(r.status,503); assert.equal(signal.aborted,true);
});
test("client disconnect cancels the upstream stream and aborts storage signal", async () => {
  let signal, cancelled;
  const cancellation = new Promise(resolve=>{cancelled=resolve;});
  const storage={bucket:asset.bucket,async statPreview(){return {size:1024,mimeType:"video/mp4",generation:"42"};},async openPreview(input){
    signal=input.signal;
    return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32));},cancel(){cancelled();}}),{headers:{"content-type":"video/mp4","content-length":"1024"}});
  }};
  const server=appFor(storage,1000).listen(0,"127.0.0.1");
  try {
    await new Promise(resolve=>server.once("listening",resolve));
    await new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port:server.address().port,path:"/"},res=>{res.once("data",()=>{req.destroy();resolve();});});req.on("error",reject);});
    await Promise.race([cancellation,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("not cancelled")),1500);t.unref();})]);
    assert.equal(signal.aborted,true);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test("storage deadline cancels an in-progress upstream body without a false complete response", async () => {
  let cancelled=false;
  const storage={bucket:asset.bucket,async statPreview(){return {size:1024,mimeType:"video/mp4",generation:"42"};},async openPreview(){
    return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(32));},cancel(){cancelled=true;}}),{headers:{"content-type":"video/mp4","content-length":"1024"}});
  }};
  await assert.rejects(request(appFor(storage,20)).get("/"),/aborted|socket hang up|ECONNRESET/);assert.equal(cancelled,true);
});
test("storage reads reject redirects and cap metadata buffering without emitting upstream errors", async () => {
  const controller=new AbortController();let cancelled=false;
  const storage=new GoogleCloudMediaStorage({bucket:"private-test",accessTokenProvider:async()=>"fixture-token",fetchImpl:async(url,init)=>{
    assert.equal(new URL(url).hostname,"storage.googleapis.com");assert.equal(init.redirect,"error");
    return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}}));
  }});
  await assert.rejects(()=>storage.statPreview({key:"fixed-key",signal:controller.signal}),e=>e.code==="MEDIA_PERSISTENCE_UNAVAILABLE");assert.equal(cancelled,true);
  storage.fetchImpl=async()=>new Response("private bucket/key details",{status:302,headers:{location:"https://foreign.invalid"}});
  await assert.rejects(()=>storage.statPreview({key:"fixed-key",signal:controller.signal}),e=>e.code==="MEDIA_PERSISTENCE_UNAVAILABLE");
});
test("per-storage concurrency rejects extra work before storage and releases slots after completion", async()=>{
  const releases=[];let ready;
  const saturated=new Promise(resolve=>{ready=resolve;});let calls=0;
  const stat={size:1024,mimeType:"video/mp4",generation:"42"};
  const storage={bucket:asset.bucket,statPreview(){calls++;if(calls>4)return Promise.resolve(stat);return new Promise(resolve=>{releases.push(()=>resolve(stat));if(releases.length===4)ready();});}};
  const app=appFor(storage,2000);
  const pending=Array.from({length:4},()=>request(app).head("/").then(r=>r));
  await saturated;
  const blocked=await request(app).head("/");assert.equal(blocked.status,429);assert.equal(calls,4);
  releases.forEach(release=>release());
  for(const r of await Promise.all(pending))assert.equal(r.status,200);
  assert.equal((await request(app).head("/")).status,200);assert.equal(calls,5);
});
