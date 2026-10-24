-- Minimal stand-in for the Supabase pieces the migrations reference. LOCAL ONLY. Hosted Supabase differs
-- (its `postgres` role is not a superuser; default privileges auto-grant to anon/authenticated/service_role).
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
