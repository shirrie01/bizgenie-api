// Local, synthetic H.264 proof only. No live service, secrets or paid provider calls.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { integrationFixture } = require("../test/helpers/media-integration");
const { createVideoInspector, assessInstagramVideoCandidate } = require("../src/media/videoInspection");
async function listen(server) { await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); return `http://127.0.0.1:${server.address().port}`; }
(async () => {
  const frontend = http.createServer((_req, res) => res.end("<!doctype html><title>Local H.264 fixture</title>"));
  let api, browser;
  try {
    const origin = await listen(frontend);
    const data = fs.readFileSync(path.join(__dirname, "../test/fixtures/video-inspection/silent-h264.mp4"));
    const f = await integrationFixture({ kind: "video", videoBytes: data, allowedOrigins: [origin] });
    api = http.createServer(f.app); const apiOrigin = await listen(api);
    browser = await chromium.launch({ executablePath: process.argv[2] || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.newContext();
    await context.route("**/*", route => [origin, apiOrigin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(origin);
    const url = apiOrigin + f.deliveryPath + "?" + new URLSearchParams({ ...f.scope, expected_campaign_version: "2" });
    const output = await page.evaluate(async url => {
      const headers = { authorization: "Bearer a" };
      const head = await fetch(url, { method: "HEAD", headers, credentials: "omit" });
      const size = Number(head.headers.get("content-length"));
      if (head.status !== 200 || !size || size > 32 * 1024 * 1024) throw new Error("Invalid HEAD budget");
      const response = await fetch(url, { headers, credentials: "omit" }); const bytes = await response.arrayBuffer();
      if (response.status !== 200 || bytes.byteLength !== size) throw new Error("Incomplete media");
      const blob = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
      const video = document.createElement("video"); video.controls = true; video.muted = true; video.setAttribute("aria-label", "Synthetic blue video, no audio"); document.body.append(video);
      try {
        await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error("Decode failed")); video.src = blob; });
        await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error("Seek timeout")), 5000); video.onseeked = () => { clearTimeout(timeout); resolve(); }; video.currentTime = 1; });
        const measured = { seeked: video.currentTime === 1, width: video.videoWidth, height: video.videoHeight, duration: video.duration };
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Playback timeout")), 10000);
          video.onended = () => { clearTimeout(timeout); resolve(); };
          video.play().catch(reject);
        });
        const range = await fetch(url, { headers: { ...headers, Range: "bytes=0-7" }, credentials: "omit" });
        return { ...measured, playedToEnd: video.ended, bytes: size, range: range.status, rangeBytes: (await range.arrayBuffer()).byteLength };
      } finally { video.removeAttribute("src"); video.load(); video.remove(); URL.revokeObjectURL(blob); }
    }, url);
    assert.deepEqual(output, { seeked: true, width: 1280, height: 720, duration: 4, playedToEnd: true, bytes: data.length, range: 206, rangeBytes: 8 });
    const inspection = await createVideoInspector()(data); assert.equal(inspection.status, "measured");
    assert.equal(assessInstagramVideoCandidate(inspection).status, "candidate_constraints_met");
    f.mediaRepository.assets.get(f.assetId).status = "revoked"; f.state.storage = [];
    assert.equal(await page.evaluate(async url => (await fetch(url, { headers: { authorization: "Bearer a" }, credentials: "omit" })).status, url), 404);
    assert.equal(f.state.storage.length, 0);
    console.log(JSON.stringify({ ...output, inspectedSha256: inspection.sha256, revoked: 404, scope: "local synthetic H264 decode/playback; not staging or Meta compliance" }));
  } finally {
    await browser?.close(); if (api) await new Promise(resolve => api.close(resolve)); await new Promise(resolve => frontend.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
