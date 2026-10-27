begin;
create table public.runtime_limit_policies(policy_version text primary key,payload jsonb not null,intent_hash text not null,created_at timestamptz not null);
create table public.runtime_limit_activation(namespace text primary key,policy_version text not null references public.runtime_limit_policies(policy_version));
create table public.runtime_capacity_claims(job_id text primary key references public.generation_execution_claims(job_id),tenant_id text not null references public.tenants(tenant_id),provider_group text not null,policy_version text not null references public.runtime_limit_policies(policy_version),claim_token uuid not null,fence bigint not null,state text not null check(state in ('held','released')),created_at timestamptz not null,updated_at timestamptz not null);
create table public.runtime_budget_consumption(resource text not null,identity text not null,tenant_id text not null references public.tenants(tenant_id),provider_group text not null,policy_version text not null references public.runtime_limit_policies(policy_version),bucket date not null,units bigint not null check(units>0),created_at timestamptz not null,primary key(resource,identity));
do $$declare t text;begin foreach t in array array['runtime_limit_policies','runtime_limit_activation','runtime_capacity_claims','runtime_budget_consumption']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;end$$;
create function generation_quote_private.guard_runtime_capacity()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-array['state','claim_token','fence','updated_at'])is distinct from(to_jsonb(old)-array['state','claim_token','fence','updated_at'])or old.state='released' then raise exception 'runtime capacity is immutable';end if;
 if new.claim_token is distinct from old.claim_token or new.fence<>old.fence then if new.state<>'held' or new.fence<=old.fence or not exists(select 1 from public.generation_execution_claims e where e.job_id=new.job_id and e.state='claimed' and e.fence=new.fence and e.claim_token=new.claim_token)then raise exception 'invalid capacity takeover';end if;end if;
 if new.state='released' and not exists(select 1 from public.generation_execution_claims e where e.job_id=new.job_id and e.state in('succeeded','failed','cancelled'))then raise exception 'execution outcome unresolved';end if;return new;end$$;
create trigger runtime_capacity_guard before update or delete on public.runtime_capacity_claims for each row execute function generation_quote_private.guard_runtime_capacity();
create trigger runtime_limit_activation_immutable before update or delete on public.runtime_limit_activation for each row execute function generation_quote_private.reject_job_link_mutation();
create trigger runtime_limit_policy_immutable before update or delete on public.runtime_limit_policies for each row execute function generation_quote_private.reject_job_link_mutation();
create trigger runtime_budget_immutable before update or delete on public.runtime_budget_consumption for each row execute function generation_quote_private.reject_job_link_mutation();
revoke all on function generation_quote_private.guard_runtime_capacity()from public,anon,authenticated,service_role;
create index runtime_capacity_held on public.runtime_capacity_claims(tenant_id,provider_group)where state='held';
create index runtime_budget_bucket on public.runtime_budget_consumption(resource,bucket,tenant_id);
commit;
