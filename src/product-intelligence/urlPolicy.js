const net=require('node:net');
const {QuoteError}=require('../generation-quotes/service');
function publicAddress(ip){
 const kind=net.isIP(ip);if(kind===4){const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(kind===6){const s=new URL('http://['+ip+']/').hostname.slice(1,-1).toLowerCase(),second=parseInt(s.split(':')[1]||'0',16);return /^[23][0-9a-f]{3}:/.test(s)&&!(s.startsWith('2001:')&&second<512)&&!s.startsWith('3fff:')&&!s.startsWith('2001:db8:')&&!s.startsWith('2001:0:')&&!s.startsWith('2002:');}return false;
}
function validateURL(value){let u;try{u=new URL(value);}catch{throw new QuoteError('SOURCE_URL_INVALID',400);}const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||u.href.length>2048||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.internal')||host.endsWith('.local')||!host.includes('.')&&!net.isIP(host)||net.isIP(host)&&!publicAddress(host))throw new QuoteError('SOURCE_URL_INVALID',400);return u.href;}
async function fetchPlan(value,resolve){const url=validateURL(value),host=new URL(url).hostname,addresses=await resolve(host);if(!Array.isArray(addresses)||!addresses.length||addresses.length>16||addresses.some(a=>!publicAddress(a)))throw new QuoteError('SOURCE_ADDRESS_DENIED',422);return {url,pinned_addresses:[...new Set(addresses)],method:'GET',redirects:0,maximum_bytes:131072,timeout_ms:3000,credentials:'omit',accepted_types:['text/plain','text/html'],execution_enabled:false};}
module.exports={validateURL,publicAddress,fetchPlan};
