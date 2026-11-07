#!/usr/bin/env bash
# Local disposable container contract only. Synthetic public config; no IAM/provider calls.
set -euo pipefail
image="${1:?image required}"
name="bg-bridge-contract-${RANDOM}-${RANDOM}"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
# No host port or Docker socket is exposed.
docker run -d --name "$name" \
  -e BIZGENIE_ENVIRONMENT=staging \
  -e SUPABASE_URL=https://zrczojyxebwjgpymbmgu.supabase.co \
  -e SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic \
  -e BG_BRIDGE_STUDIO_ORIGIN=https://bizgenie-studio-staging.pages.dev \
  -e BG_BRIDGE_TARGET_URL=https://synthetic---bizgenie-api-staging-synthetic-ew.a.run.app \
  -e BG_BRIDGE_AUDIENCE=https://bizgenie-api-staging-synthetic-ew.a.run.app \
  -e BG_BRIDGE_REVISION=bizgenie-api-staging-00030-pob \
  -e BG_BRIDGE_SOURCE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -e BG_BRIDGE_REVIEW_REF=synthetic_container_contract "$image" >/dev/null
for attempt in {1..20}; do
  if docker exec "$name" node -e 'require("node:net").connect(8080,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' >/dev/null 2>&1; then break; fi
  sleep 1
done
# Pass script through stdin explicitly; no credentials in test diagnostics.
docker exec -i "$name" node <<'JS'
const assert=require('node:assert/strict');
(async()=>{
 assert.notEqual(process.getuid(),0);
 const base='http://127.0.0.1:8080',origin='https://bizgenie-studio-staging.pages.dev';
 for(const [path,method]of [['/customer/workspace','GET'],['/customer/workspace/bootstrap','POST']]){
  const r=await fetch(base+path,{method:'OPTIONS',headers:{origin,'access-control-request-method':method,'access-control-request-headers':'authorization,content-type'}});
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 }
 assert.equal((await fetch(base+'/customer/workspace',{headers:{origin}})).status,401);
 assert.equal((await fetch(base+'/customer/workspace',{method:'OPTIONS',headers:{origin:'https://foreign.test','access-control-request-method':'GET'}})).status,403);
 assert.equal((await fetch(base+'/customer/workspace/bootstrap',{method:'POST',headers:{origin}})).status,403);
 console.log('PASS: non-root bridge, preflight before auth, no-token denial, origin denial, write gate');
})().catch(()=>{console.error('BRIDGE_CONTAINER_CONTRACT_FAILED');process.exitCode=1;});
JS
