-- Exact row counts for every public base table (restore completeness check).
select format('%s=%s', relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text)
from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname;
