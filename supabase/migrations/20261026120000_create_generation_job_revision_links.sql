-- BG-STUDIO-021 draft; local/disposable only until separately approved.
begin;
create table public.generation_job_revision_links(
 job_id text primary key,tenant_id text not null,project_id text not null,brand_id text not null,
 campaign_id uuid not null,content_item_id uuid not null,variant_id uuid not null,revision_id uuid not null,
 campaign_version integer not null,created_by uuid not null references public.customer_profiles(auth_user_id),created_at timestamptz not null,
 foreign key(job_id,tenant_id,project_id) references public.generation_jobs(job_id,tenant_id,project_id) on delete restrict,
 foreign key(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id) references public.campaign_revisions(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id) on delete restrict
);
alter table public.generation_job_revision_links enable row level security;
revoke all on public.generation_job_revision_links from public,anon,authenticated,service_role;
create function generation_quote_private.reject_job_link_mutation()returns trigger language plpgsql set search_path='' as $$begin raise exception 'generation revision association is immutable';end$$;
create trigger generation_job_link_immutable before update or delete on public.generation_job_revision_links for each row execute function generation_quote_private.reject_job_link_mutation();
revoke all on function generation_quote_private.reject_job_link_mutation() from public,anon,authenticated,service_role;
commit;
