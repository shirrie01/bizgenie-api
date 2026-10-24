-- Roles that stand in for "what might the deployed backend connect as". LOCAL ONLY, loopback, no passwords.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='bg_rt_nobypass') then create role bg_rt_nobypass login; end if;
  if not exists(select 1 from pg_roles where rolname='bg_rt_bypass') then create role bg_rt_bypass login bypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='bg_rt_owner') then create role bg_rt_owner login; end if;
end $$;
grant usage on schema public to bg_rt_nobypass, bg_rt_bypass, bg_rt_owner;
grant select, insert, update, delete on public.workspace_onboarding_profiles to bg_rt_nobypass, bg_rt_bypass;
-- Fixture row (created by the table owner, i.e. the migration role).
insert into tenants(tenant_id,name,created_by) values ('tenant-rls','T','11111111-1111-4111-8111-111111111111') on conflict do nothing;
insert into projects(project_id,tenant_id,name) values ('p-rls','tenant-rls','P') on conflict do nothing;
insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values ('b-rls','p-rls','B',1,'approved',now(),now()) on conflict do nothing;
insert into workspace_onboarding_profiles(tenant_id,project_id,brand_id,profile_version,status,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash)
values ('tenant-rls','p-rls','b-rls',1,'in_progress',now(),now(),'11111111-1111-4111-8111-111111111111','k2',repeat('b',64)) on conflict do nothing;
-- The owner role must own the table to be an "owner" connection; ownership change is local to this throwaway database.
alter table public.workspace_onboarding_profiles owner to bg_rt_owner;
