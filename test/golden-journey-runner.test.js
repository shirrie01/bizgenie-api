const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {target}=require('../scripts/golden-journey/safety'),{run,stages}=require('../scripts/golden-journey/run');
const env={PATH:process.env.PATH,TEST_DATABASE_URL:'postgres://synthetic:synthetic@127.0.0.1:5433/postgres',GOLDEN_JOURNEY_DISPOSABLE:'true'};
test('requires explicitly disposable loopback PostgreSQL and rejects hosted/alternate/query connections without leaking URL',()=>{
 assert.equal(target(env).port,5433);
 for(const patch of [{GOLDEN_JOURNEY_DISPOSABLE:undefined},{TEST_DATABASE_URL:undefined},{TEST_DATABASE_URL:'bad'},{TEST_DATABASE_URL:'postgres://u:p@example.com/postgres'},{TEST_DATABASE_URL:'postgres://u:p@127.0.0.1/existing_customer_db'},{TEST_DATABASE_URL:'postgres://u:p@localhost/postgres?host=foreign.test'},{TEST_DATABASE_URL:'postgres://u:p@127.0.0.1/postgres#fragment'}])assert.throws(()=>target({...env,...patch}),/^Error: GOLDEN_JOURNEY_DISPOSABLE_DATABASE_REQUIRED$/);
});
test('invalid environment runs no tests and writes honest BLOCKED/NOT_RUN JSON and Markdown',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gj-refused-'));try{const r=run({env:{},output:dir,spawn:()=>{throw Error('must not spawn');}});assert.equal(r.status,'BLOCKED');assert.ok(r.stages.every(s=>s.status==='NOT_RUN'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'report.json'))).status,'BLOCKED');assert.match(fs.readFileSync(path.join(dir,'report.md'),'utf8'),/NOT RUN/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('stage counts reflect actual subprocess output; skipped/failing/missing counts cannot become PASS',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gj-report-'));try{
 const spawn=(exe,args,opts)=>{assert.equal(exe,process.execPath);assert.ok(opts.env.NODE_OPTIONS.includes('no-real-network.js'));assert.equal(opts.env.STRIPE_SECRET_KEY,undefined);return {status:0,stdout:'# tests 3\n# pass 3\n# fail 0\n# skipped 0\n'};};
 const r=run({env:{...env,STRIPE_SECRET_KEY:'do-not-inherit'},output:dir,spawn});assert.equal(r.status,'PASS');assert.equal(r.stages.length,stages.length);assert.equal(r.hostedAcceptance,'NOT_RUN');
 for(const result of [{status:0,stdout:'# pass 2\n# fail 0\n# skipped 1\n'},{status:1,stdout:'# pass 2\n# fail 1\n# skipped 0\n'},{status:0,stdout:''},{status:null,error:Error('timeout')}])assert.equal(run({env,output:dir,spawn:()=>result}).status,'FAIL');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('preloaded guard blocks remote fetch/http/socket and shell escape before any real network',()=>{
 const guard=path.join(__dirname,'../scripts/golden-journey/no-real-network.js');
 for(const code of ["require('node:http').get('http://example.com')","require('node:net').connect(443,'example.com')","require('node:child_process').exec('curl https://example.com')"]){const r=spawnSync(process.execPath,['--require',guard,'-e',code],{encoding:'utf8',env});assert.notEqual(r.status,0);assert.match(r.stderr,/GOLDEN_JOURNEY_REAL_NETWORK_FORBIDDEN/);}
 const r=spawnSync(process.execPath,['--require',guard,'-e',"fetch('https://example.com').catch(e=>{console.log(e.message);process.exitCode=2;})"],{encoding:'utf8',env});assert.equal(r.status,2);assert.equal(r.stdout.trim(),'GOLDEN_JOURNEY_REAL_NETWORK_FORBIDDEN');
});

test('guard permits local HTTP fixtures without external DNS resolution',()=>{const guard=path.join(__dirname,'../scripts/golden-journey/no-real-network.js');const code="const h=require('node:http');const s=h.createServer((q,r)=>r.end('local'));s.listen(0,'127.0.0.1',async()=>{try{const r=await fetch('http://localhost:'+s.address().port);console.log(await r.text());}finally{s.close();}});";const r=spawnSync(process.execPath,['--require',guard,'-e',code],{encoding:'utf8',env,timeout:10000});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'local');});
