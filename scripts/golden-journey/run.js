'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process');
const {target}=require('./safety');
const root=path.resolve(__dirname,'../..');
const stages=[
 {id:'postgres_golden',kind:'existing_chained_disposable_postgres',files:['test/customer-golden-journey.postgres.integration.test.js']},
 {id:'content_plan',kind:'independent_curated_contracts',files:['test/campaign-content-plan.test.js']},
 {id:'identity_and_bridge',kind:'independent_curated_contracts',files:['test/customer-authentication.test.js','test/studio-bridge-founder.test.js','test/studio-bridge-founder-recommendations.test.js']},
 {id:'campaign_and_revision',kind:'independent_curated_contracts',files:['test/customer-campaigns.test.js','test/customer-copy-revisions.test.js']},
 {id:'private_media',kind:'independent_curated_contracts',files:['test/media-preview-delivery.test.js']},
 {id:'billing_social_contracts',kind:'independent_curated_contracts',files:['test/customer-billing-state.test.js','test/social-contract.test.js']},
];
function markdown(r){return `# Golden Journey v1 — ${r.status}\n\nLOCAL automated evidence only. Synthetic identity/Auth admin; real disposable PostgreSQL in the existing golden fixture. Independent curated suites are NOT a chained product E2E. No WEB/hosted/customer/provider acceptance.\n\n| Stage | Status | Pass | Fail | Skip |\n|---|---|---:|---:|---:|\n`+r.stages.map(s=>`| ${s.id} | ${s.status} | ${s.passed||0} | ${s.failed||0} | ${s.skipped||0} |`).join('\n')+`\n\nRefusal: ${r.refusal||'none'}\nHosted browser, real OAuth, paid image/video, live billing and publishing: NOT RUN.\n`;}
function run({env=process.env,spawn=spawnSync,output=path.join(root,'artifacts/golden-journey')}={}){
 let sourceSha='UNKNOWN',workingTreeDirty=true;try{sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();workingTreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());}catch{}
 const report={sourceSha,workingTreeDirty,schema:'golden-journey.v1',status:'BLOCKED',evidenceClass:'LOCAL_AUTOMATED',stages:stages.map(s=>({...s,status:'NOT_RUN'})),hostedAcceptance:'NOT_RUN',webLeg:'NOT_IMPLEMENTED_V1',realProviders:'NOT_RUN',paidSpend:0};
 try{target(env);}catch{report.refusal='GOLDEN_JOURNEY_DISPOSABLE_DATABASE_REQUIRED';write();return report;}
 // Whitelist environment inputs: no live credentials, deployment flags, proxies or Node hooks inherited.
 const child={PATH:env.PATH,HOME:env.HOME,TMPDIR:env.TMPDIR,TZ:'UTC',TEST_DATABASE_URL:env.TEST_DATABASE_URL,GOLDEN_JOURNEY_DISPOSABLE:'true',NODE_OPTIONS:`--require=${path.join(__dirname,'no-real-network.js')}`};
 for(const s of report.stages){
  const result=spawn(process.execPath,['--test','--test-reporter=tap',...s.files],{cwd:root,env:child,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  const text=result.stdout||'';const count=k=>{const a=[...text.matchAll(new RegExp('^# '+k+' (\\d+)$','gm'))];return a.length?Number(a.at(-1)[1]):null;};
  Object.assign(s,{passed:count('pass'),failed:count('fail'),skipped:count('skipped')});
  s.status=result.status===0&&s.passed>0&&s.failed===0&&s.skipped===0?'PASS':'FAIL';
  if(s.status==='FAIL')s.reason=result.error?'TEST_PROCESS_ERROR_OR_TIMEOUT':s.skipped?'SKIPPED_TESTS_NOT_ACCEPTANCE':'TEST_FAILURE_OR_MISSING_COUNTS';
 }
 report.status=report.stages.every(s=>s.status==='PASS')?'PASS':'FAIL';write();return report;
 function write(){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(output,'report.md'),markdown(report));}
}
if(require.main===module){const result=run();console.log(JSON.stringify({status:result.status,stages:result.stages.map(({id,status,passed,failed,skipped})=>({id,status,passed,failed,skipped})),refusal:result.refusal}));process.exitCode=result.status==='PASS'?0:1;}
module.exports={run,stages,markdown};
