begin;
create table public.strategy_workflows(
 workflow_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,auth_user_id uuid not null references public.customer_profiles(auth_user_id),
 request jsonb not null,context_hash text not null,max_total_credits bigint not null check(max_total_credits>0),price_policy jsonb not null,workflow_policy_version text not null,idempotency_key text not null,intent_hash text not null,created_at timestamptz not null,
 foreign key(tenant_id,project_id)references public.projects(tenant_id,project_id),foreign key(project_id,brand_id)references public.brand_brains(project_id,brand_id),unique(tenant_id,project_id,auth_user_id,idempotency_key)
);
create table public.strategy_workflow_stages(workflow_id uuid not null references public.strategy_workflows(workflow_id),stage text not null check(stage in('strategy','draft')),quote_id uuid not null unique references public.generation_quotes(quote_id),job_id text not null unique references public.generation_execution_claims(job_id),created_at timestamptz not null,primary key(workflow_id,stage));
create table public.strategy_workflow_stops(workflow_id uuid primary key references public.strategy_workflows(workflow_id),actor_id uuid not null references public.customer_profiles(auth_user_id),created_at timestamptz not null);
do $$declare t text;begin foreach t in array array['strategy_workflows','strategy_workflow_stages','strategy_workflow_stops']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('create trigger %I before update or delete on public.%I for each row execute function generation_quote_private.reject_job_link_mutation()',t||'_immutable',t);end loop;end$$;
commit;
