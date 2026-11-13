const {QuoteError}=require('../generation-quotes/service');
// Request-time metadata verification: never caches away later RLS/grant/trigger drift.
async function assertPrivateSchema(client,tables,guards={}){
 const rows=(await client.query(`select c.relname,c.relkind,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'select,insert,update,delete,truncate,references,trigger') or
 has_table_privilege('authenticated',c.oid,'select,insert,update,delete,truncate,references,trigger') or
 has_table_privilege('service_role',c.oid,'select,insert,update,delete,truncate,references,trigger') exposed
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])`,[tables])).rows;
 if(rows.length!==tables.length||rows.some(r=>r.relkind!=='r'||!r.relrowsecurity||r.exposed))throw new QuoteError('PRIVATE_SCHEMA_UNAVAILABLE',503);
 const expected=Object.entries(guards);if(!expected.length)return;
 const triggers=(await client.query(`select t.tgname,c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled='O' and t.tgname=any($1::text[])`,[expected.map(([name])=>name)])).rows;
 if(expected.some(([name,table])=>!triggers.some(t=>t.tgname===name&&t.relname===table)))throw new QuoteError('PRIVATE_SCHEMA_UNAVAILABLE',503);
}
module.exports={assertPrivateSchema};
