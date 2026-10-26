begin;
create table public.customer_product_sources(
 source_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,
 created_by uuid not null references public.customer_profiles(auth_user_id),created_at timestamptz not null,idempotency_key text not null,intent_hash text not null,
 payload jsonb not null,content_hash text not null,
 foreign key(tenant_id,project_id)references public.projects(tenant_id,project_id),foreign key(project_id,brand_id)references public.brand_brains(project_id,brand_id),
 unique(tenant_id,project_id,created_by,idempotency_key),unique(source_id,tenant_id,project_id,brand_id)
);
create table public.customer_product_decisions(
 source_id uuid not null references public.customer_product_sources(source_id),version integer not null check(version>0),
 actor_id uuid not null references public.customer_profiles(auth_user_id),decision text not null check(decision in ('accepted','rejected','revoked')),idempotency_key text not null,intent_hash text not null,created_at timestamptz not null,
 primary key(source_id,version),unique(source_id,actor_id,idempotency_key)
);
alter table public.customer_product_sources enable row level security;alter table public.customer_product_decisions enable row level security;
revoke all on public.customer_product_sources,public.customer_product_decisions from public,anon,authenticated,service_role;
create trigger customer_product_sources_immutable before update or delete on public.customer_product_sources for each row execute function generation_quote_private.reject_job_link_mutation();
create trigger customer_product_decisions_immutable before update or delete on public.customer_product_decisions for each row execute function generation_quote_private.reject_job_link_mutation();
create index customer_product_scope on public.customer_product_sources(tenant_id,project_id,brand_id,source_id);
commit;
