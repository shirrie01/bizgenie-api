-- BG022 proposal: only disposable local databases used by this task.
begin;
create table public.creative_content_dna(
 dna_id uuid primary key,job_id text not null unique references public.generation_jobs(job_id),
 tenant_id text not null,project_id text not null,brand_id text not null,campaign_id uuid not null,content_item_id uuid not null,variant_id uuid not null,revision_id uuid not null unique,
 payload jsonb not null,created_at timestamptz not null,created_by uuid not null references public.customer_profiles(auth_user_id),
 foreign key(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id)references public.campaign_revisions(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id),
 foreign key(job_id,tenant_id,project_id)references public.generation_jobs(job_id,tenant_id,project_id)
);
create table public.creative_experiments(
 experiment_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,campaign_id uuid not null,
 created_by uuid not null references public.customer_profiles(auth_user_id),created_at timestamptz not null,creation_key text not null,unique(tenant_id,project_id,created_by,creation_key),
 foreign key(tenant_id,project_id,brand_id,campaign_id)references public.campaigns(tenant_id,project_id,brand_id,campaign_id),
 unique(experiment_id,tenant_id,project_id,brand_id)
);
create table public.creative_experiment_versions(
 experiment_id uuid not null references public.creative_experiments(experiment_id),version integer not null check(version>0),
 payload jsonb not null,actor_id uuid not null references public.customer_profiles(auth_user_id),idempotency_key text not null,intent_hash text not null,created_at timestamptz not null,
 primary key(experiment_id,version),unique(experiment_id,actor_id,idempotency_key)
);
create table public.creative_experiment_assignments(
 experiment_id uuid not null,version integer not null,tenant_id text not null,project_id text not null,brand_id text not null,campaign_id uuid not null,content_item_id uuid not null,variant_id uuid not null,revision_id uuid not null,
 primary key(experiment_id,version,variant_id),foreign key(experiment_id,version)references public.creative_experiment_versions(experiment_id,version),
 foreign key(experiment_id,tenant_id,project_id,brand_id)references public.creative_experiments(experiment_id,tenant_id,project_id,brand_id),
 foreign key(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id)references public.campaign_revisions(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id)
);
create table public.creative_experiment_evaluations(
 evaluation_id uuid primary key,experiment_id uuid not null,version integer not null,evaluation_version integer not null check(evaluation_version>0),unique(experiment_id,evaluation_version),tenant_id text not null,project_id text not null,brand_id text not null,
 payload jsonb not null,created_at timestamptz not null,actor_id uuid not null references public.customer_profiles(auth_user_id),
 foreign key(experiment_id,version)references public.creative_experiment_versions(experiment_id,version),
 foreign key(experiment_id,tenant_id,project_id,brand_id)references public.creative_experiments(experiment_id,tenant_id,project_id,brand_id)
);
alter table public.learning_recommendations add column experiment_evaluation_id uuid references public.creative_experiment_evaluations(evaluation_id);
do $$declare t text;begin foreach t in array array['creative_content_dna','creative_experiments','creative_experiment_versions','creative_experiment_assignments','creative_experiment_evaluations']loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger %I before update or delete on public.%I for each row execute function generation_quote_private.reject_job_link_mutation()',t||'_immutable',t);
end loop;end$$;
create index creative_dna_scope on public.creative_content_dna(tenant_id,project_id,brand_id,dna_id);
create index creative_experiment_scope on public.creative_experiments(tenant_id,project_id,brand_id,experiment_id);
commit;
