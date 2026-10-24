-- Structural + security fingerprint of the public schema (no row content). Compare before/after a restore.
-- Constraint definitions are compared with parentheses and whitespace removed: pg_dump/pg_restore re-renders nested AND
-- expressions with different parentheses (same meaning). The backend's own preflight compares the RAW text; see the restore script.
select 'tables_rls_owner' as part, md5(coalesce(string_agg(c.relname||':'||c.relkind::text||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||pg_get_userbyid(c.relowner), ',' order by c.relname),'')) as md5
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')
union all
select 'columns', md5(coalesce(string_agg(c.relname||'.'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''), ',' order by c.relname,a.attnum),''))
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
union all
select 'constraints', md5(coalesce(string_agg(conrelid::regclass::text||'.'||conname||':'||convalidated::text||':'||regexp_replace(pg_get_constraintdef(oid),'[() \t\r\n]','','g'), ',' order by conrelid::regclass::text,conname),''))
  from pg_constraint where connamespace='public'::regnamespace
union all
select 'indexes', md5(coalesce(string_agg(indexdef, ',' order by indexname),'')) from pg_indexes where schemaname='public'
union all
select 'policies', md5(coalesce(string_agg(tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename,policyname),'')) from pg_policies where schemaname='public'
union all
select 'table_acls', md5(coalesce(string_agg(c.relname||':'||coalesce(c.relacl, acldefault('r', c.relowner))::text, ',' order by c.relname),''))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all
select 'functions', md5(coalesce(string_agg(p.proname||':'||md5(p.prosrc)||':'||coalesce(p.proacl::text,''), ',' order by p.proname,p.oid::text),''))
  from pg_proc p where p.pronamespace='public'::regnamespace
union all
select 'triggers', md5(coalesce(string_agg(tgrelid::regclass::text||':'||tgname, ',' order by tgrelid::regclass::text,tgname),'')) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
order by 1;
