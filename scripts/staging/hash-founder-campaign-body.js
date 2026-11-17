'use strict';
// OFFLINE private-body input. Only a digest is emitted, never customer fields or identity.
const {bodyHash}=require('../../src/studio-bridge/founderCampaign');
if(require.main===module){try{const body=JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify({body_sha256:bodyHash(body)}));}catch{console.error('FOUNDER_CAMPAIGN_BODY_INVALID');process.exitCode=1;}}
