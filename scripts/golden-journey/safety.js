'use strict';
function target(env){
 try{
  if(env.GOLDEN_JOURNEY_DISPOSABLE!=='true'||typeof env.TEST_DATABASE_URL!=='string')throw Error();
  const u=new URL(env.TEST_DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(u.protocol)||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.search||u.hash||!u.username||!u.password||u.pathname!=='/postgres'||/supabase|pooler|amazonaws|googleapis|neon\.tech/i.test(env.TEST_DATABASE_URL))throw Error();
  const port=Number(u.port||5432);if(!Number.isInteger(port)||port<1||port>65535)throw Error();
  return {host:u.hostname,port};
 }catch{throw Error('GOLDEN_JOURNEY_DISPOSABLE_DATABASE_REQUIRED');}
}
module.exports={target};
