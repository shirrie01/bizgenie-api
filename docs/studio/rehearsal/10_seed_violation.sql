-- A project/tenant pair that does not exist as a pair, with a brand that does exist, so the BASE foreign key
-- (project_id, brand_id) passes and only the HARDENING foreign key (project_id, tenant_id) can catch it.
insert into tenants(tenant_id,name,created_by) values ('tenant-ok','T','11111111-1111-4111-8111-111111111111');
insert into projects(project_id,tenant_id,name) values ('p-ok','tenant-ok','P');
insert into brand_brains(brand_id,project_id,name,version,status,created_at,updated_at) values ('b-ok','p-ok','B',1,'approved',now(),now());
insert into workspace_onboarding_profiles(tenant_id,project_id,brand_id,profile_version,status,created_at,updated_at,updated_by,last_idempotency_key,last_request_hash)
values ('tenant-WRONG','p-ok','b-ok',1,'in_progress',now(),now(),'11111111-1111-4111-8111-111111111111','k1',repeat('a',64));
