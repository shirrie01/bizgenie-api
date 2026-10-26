-- BG-STUDIO-021 local draft. No real platform ingestion or shared migration.
begin;
create table public.campaign_performance_objectives(
 campaign_id uuid not null,version integer not null,tenant_id text not null,project_id text not null,brand_id text not null,
 objective text not null,metric text not null,approved_by uuid not null references public.customer_profiles(auth_user_id),created_at timestamptz not null,
 idempotency_key text not null,intent_hash text not null,primary key(campaign_id,version),
 foreign key(tenant_id,project_id,brand_id,campaign_id) references public.campaigns(tenant_id,project_id,brand_id,campaign_id),
 unique(tenant_id,project_id,approved_by,idempotency_key)
);
create table public.platform_performance_observations(
 observation_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,
 dispatch_id uuid not null references public.social_dispatches(dispatch_id),connection_id uuid not null references public.social_connections(connection_id),
 objective_version integer not null,source_id text not null,account_id text not null,record_id text not null,
 payload jsonb not null,fingerprint text not null,observed_at timestamptz not null,correction_of uuid references public.platform_performance_observations(observation_id),superseded_by uuid references public.platform_performance_observations(observation_id),retracted boolean not null,
 unique(tenant_id,project_id,source_id,account_id,record_id)
);
create table public.performance_evidence_snapshots(
 snapshot_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,payload jsonb not null,snapshot_hash text not null,created_at timestamptz not null
);
create table public.learning_recommendations(
 recommendation_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,objective text not null,
 snapshot_id uuid not null references public.performance_evidence_snapshots(snapshot_id),payload jsonb not null,evidence_ids uuid[] not null,created_at timestamptz not null
);
create table public.learning_customer_feedback(
 feedback_id uuid primary key,recommendation_id uuid not null references public.learning_recommendations(recommendation_id),version integer not null,
 tenant_id text not null,project_id text not null,brand_id text not null,actor_id uuid not null references public.customer_profiles(auth_user_id),
 decision text not null check(decision in ('accepted','rejected')),idempotency_key text not null,intent_hash text not null,created_at timestamptz not null,
 unique(recommendation_id,version),unique(tenant_id,project_id,actor_id,idempotency_key)
);
do $$declare table_name text;begin foreach table_name in array array['campaign_performance_objectives','platform_performance_observations','performance_evidence_snapshots','learning_recommendations','learning_customer_feedback']loop
 execute format('alter table public.%I enable row level security',table_name);execute format('revoke all on public.%I from public,anon,authenticated,service_role',table_name);
 if table_name<>'platform_performance_observations' then execute format('create trigger %I before update or delete on public.%I for each row execute function generation_quote_private.reject_job_link_mutation()',table_name||'_immutable',table_name);end if;
 end loop;end$$;
create function generation_quote_private.guard_platform_observation()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-'superseded_by') is distinct from (to_jsonb(old)-'superseded_by') or old.superseded_by is not null then raise exception 'platform observation is immutable';end if;return new;end$$;
create trigger platform_observation_immutable before update or delete on public.platform_performance_observations for each row execute function generation_quote_private.guard_platform_observation();
revoke all on function generation_quote_private.guard_platform_observation() from public,anon,authenticated,service_role;
alter table public.social_dispatches add constraint social_dispatch_scope_unique unique(dispatch_id,tenant_id,project_id,brand_id);
alter table public.platform_performance_observations add constraint observation_dispatch_scope foreign key(dispatch_id,tenant_id,project_id,brand_id)references public.social_dispatches(dispatch_id,tenant_id,project_id,brand_id);
alter table public.performance_evidence_snapshots add constraint snapshot_scope_unique unique(snapshot_id,tenant_id,project_id,brand_id);
alter table public.learning_recommendations add constraint recommendation_snapshot_scope foreign key(snapshot_id,tenant_id,project_id,brand_id)references public.performance_evidence_snapshots(snapshot_id,tenant_id,project_id,brand_id);
alter table public.learning_recommendations add constraint recommendation_scope_unique unique(recommendation_id,tenant_id,project_id,brand_id);
alter table public.learning_customer_feedback add constraint feedback_recommendation_scope foreign key(recommendation_id,tenant_id,project_id,brand_id)references public.learning_recommendations(recommendation_id,tenant_id,project_id,brand_id);
alter table public.generation_execution_claims add column error_code text;
commit;
