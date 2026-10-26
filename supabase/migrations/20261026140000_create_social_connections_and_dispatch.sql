-- BG-STUDIO-021 local draft only. No OAuth/app/provider activation.
begin;
create table public.social_oauth_intents(
 intent_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,actor_id uuid not null references public.customer_profiles(auth_user_id),
 platform text not null,state_hash text not null unique,pkce_challenge text not null,expires_at timestamptz not null,consumed_at timestamptz,
 foreign key(tenant_id,project_id) references public.projects(tenant_id,project_id),foreign key(project_id,brand_id) references public.brand_brains(project_id,brand_id)
);
create table public.social_connections(
 connection_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,platform text not null,account_id text not null,
 token_reference uuid not null,granted_scopes text[] not null,expires_at timestamptz not null,status text not null check(status in ('active','revoked','expired')),
 version integer not null check(version>0),refresh_token uuid,refresh_fence bigint not null default 0,
 created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(tenant_id,project_id) references public.projects(tenant_id,project_id),foreign key(project_id,brand_id) references public.brand_brains(project_id,brand_id),
 unique(tenant_id,project_id,brand_id,platform,account_id),unique(connection_id,tenant_id,project_id,brand_id)
);
create table public.social_dispatches(
 dispatch_id uuid primary key,connection_id uuid not null,tenant_id text not null,project_id text not null,brand_id text not null,
 campaign_id uuid not null,content_item_id uuid not null,variant_id uuid not null,revision_id uuid not null,approval_id uuid not null,schedule_id uuid not null,
 expected_campaign_version integer not null,connection_version integer not null,scheduled_for timestamptz not null,created_by uuid not null references public.customer_profiles(auth_user_id),
 identity_hash text not null unique,payload jsonb not null,
 state text not null check(state in ('queued','claimed','sending','reconciliation_required','published','failed','cancelled')),
 fence bigint not null default 0,claim_token uuid,provider_reference text,publication_id text,publication_url text,published_at timestamptz,
 created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(connection_id,tenant_id,project_id,brand_id) references public.social_connections(connection_id,tenant_id,project_id,brand_id),
 foreign key(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id) references public.campaign_revisions(tenant_id,project_id,brand_id,campaign_id,content_item_id,variant_id,revision_id)
);
create index social_dispatch_due on public.social_dispatches(scheduled_for,dispatch_id) where state='queued';
create table public.social_dispatch_audit(event_id uuid primary key,dispatch_id uuid not null references public.social_dispatches(dispatch_id),event_type text not null,fence bigint not null,recorded_at timestamptz not null);
alter table public.social_oauth_intents enable row level security;alter table public.social_connections enable row level security;alter table public.social_dispatches enable row level security;alter table public.social_dispatch_audit enable row level security;
revoke all on public.social_oauth_intents,public.social_connections,public.social_dispatches,public.social_dispatch_audit from public,anon,authenticated,service_role;
create function generation_quote_private.guard_social_dispatch()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'dispatch history is immutable';end if;
 if (to_jsonb(new)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','updated_at']) is distinct from (to_jsonb(old)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','updated_at']) then raise exception 'dispatch authority is immutable';end if;
 if old.state in ('published','failed','cancelled') and new is distinct from old then raise exception 'dispatch decision is final';end if;
 if new.state in ('claimed','cancelled') and old.state in ('queued','claimed') then
  if new.fence<>old.fence+1 then raise exception 'new dispatch fence required';end if;
 elsif new.fence<>old.fence or new.claim_token is distinct from old.claim_token then raise exception 'dispatch fence is immutable';end if;
 if not ((old.state in ('queued','claimed') and new.state in ('claimed','cancelled')) or (old.state='claimed' and new.state='sending') or (old.state in ('sending','reconciliation_required') and new.state in ('reconciliation_required','published','failed')) or new is not distinct from old)then raise exception 'invalid dispatch transition';end if;
 return new;end$$;
create trigger social_dispatch_guard before update or delete on public.social_dispatches for each row execute function generation_quote_private.guard_social_dispatch();
create trigger social_dispatch_audit_guard before update or delete on public.social_dispatch_audit for each row execute function generation_quote_private.reject_job_link_mutation();
revoke all on function generation_quote_private.guard_social_dispatch() from public,anon,authenticated,service_role;
commit;
