'use strict';
// Preloaded into each curated test process and inherited Node children. No remote sockets/providers.
require('./safety').target(process.env);
const net=require('node:net'),http=require('node:http'),https=require('node:https'),cp=require('node:child_process'),path=require('node:path');
const allowed=h=>['127.0.0.1','localhost','::1','[::1]'].includes(String(h).toLowerCase());
const deny=()=>{throw Error('GOLDEN_JOURNEY_REAL_NETWORK_FORBIDDEN');};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let a=args[0];if(Array.isArray(a))a=a[0];const host=typeof a==='object'?a.host||'localhost':typeof args[1]==='string'?args[1]:'localhost';if(typeof a==='string'||a?.path||!allowed(host))return deny();return connect.apply(this,args);};
function destination(input){if(typeof input==='string'||input instanceof URL)return new URL(input).hostname;return input?.hostname||String(input?.host||'localhost').split(':')[0];}
for(const mod of [http,https])for(const name of ['request','get']){const original=mod[name];mod[name]=function(...args){if(!allowed(destination(args[0])))return deny();return original.apply(this,args);};}
const fetch=globalThis.fetch;
if(fetch)globalThis.fetch=function(input,...args){if(!allowed(new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname))return Promise.reject(Error('GOLDEN_JOURNEY_REAL_NETWORK_FORBIDDEN'));return fetch.call(this,input,...args);};
// No curl/shell/provider executable escape. Curated v1 suites need Node children only.
const guard=__filename;
function options(o={}){return {...o,env:{...(o.env||process.env),TEST_DATABASE_URL:process.env.TEST_DATABASE_URL,GOLDEN_JOURNEY_DISPOSABLE:'true',NODE_OPTIONS:`--require=${guard}`}};}
for(const name of ['spawn','spawnSync','execFile','execFileSync']){const original=cp[name];cp[name]=function(file,args,opts,...rest){if(path.resolve(file)!==process.execPath)return deny();if(!Array.isArray(args)){rest=[opts,...rest];opts=args;args=[];}return original.call(this,file,args,options(opts),...rest);};}
cp.exec=deny;cp.execSync=deny;
const fork=cp.fork;cp.fork=function(modulePath,args=[],opts={}){if(opts.execPath&&path.resolve(opts.execPath)!==process.execPath)return deny();return fork.call(this,modulePath,args,options(opts));};
const dns=require('node:dns');
function localAddress(host,options={}){if(!allowed(host))return deny();const address=host==='localhost'?(options.family===6?'::1':'127.0.0.1'):String(host).replace(/^\[|\]$/g,'');return {address,family:address.includes(':')?6:4};}
dns.lookup=function(host,opts,callback){if(typeof opts==='function'){callback=opts;opts={};}const a=localAddress(host,typeof opts==='object'?opts:{family:opts});process.nextTick(()=>opts?.all?callback(null,[a]):callback(null,a.address,a.family));};
dns.promises.lookup=async function(host,opts={}){const a=localAddress(host,typeof opts==='object'?opts:{family:opts});return opts?.all?[a]:a;};
for(const name of ['resolve','resolve4','resolve6','resolveAny','resolveCname','resolveMx','resolveTxt','reverse']){if(dns[name])dns[name]=deny;if(dns.promises[name])dns.promises[name]=async()=>deny();}
require('node:dgram').createSocket=deny;
require('node:module').syncBuiltinESMExports();
