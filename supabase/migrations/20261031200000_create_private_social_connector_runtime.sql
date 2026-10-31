-- Draft only. Local disposable rehearsal authorised; no shared application.
begin;
create table public.social_token_secrets(
 reference uuid primary key,binding_hash text not null,binding jsonb not null,
 ciphertext bytea not null,iv bytea not null,tag bytea not null,key_id text not null,
 tenant_id text generated always as (binding->>'tenant_id') stored not null,project_id text generated always as (binding->>'project_id') stored not null,brand_id text generated always as (binding->>'brand_id') stored not null,
 revision bigint not null default 1,revoked boolean not null default false,
 rotation_state text not null default 'idle' check(rotation_state in('idle','calling','unknown')),
 rotation_fence uuid,created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(tenant_id,project_id)references public.projects(tenant_id,project_id),foreign key(project_id,brand_id)references public.brand_brains(project_id,brand_id)
);
create table public.social_provider_operations(identity text primary key,binding_hash text not null,publish_id text,created_at timestamptz not null);
create table public.social_provider_rate_windows(account_hash text not null,kind text not null check(kind in('init','status')),bucket timestamptz not null,used integer not null check(used>0),primary key(account_hash,kind,bucket));
create table public.social_connector_audit(event_id uuid primary key,event_type text not null,binding_hash text not null,reference uuid,recorded_at timestamptz not null);
create function generation_quote_private.guard_social_secret_binding()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'secret deletion requires approved retention procedure';end if;
 if new.reference<>old.reference or new.binding_hash<>old.binding_hash or new.binding<>old.binding or new.created_at<>old.created_at or(old.revoked and not new.revoked) then raise exception 'secret binding/revocation is immutable';end if;
 return new;end$$;
create trigger social_token_binding_guard before update or delete on public.social_token_secrets for each row execute function generation_quote_private.guard_social_secret_binding();
create function generation_quote_private.guard_social_provider_operation()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or new.identity<>old.identity or new.binding_hash<>old.binding_hash or new.created_at<>old.created_at or(old.publish_id is not null and new.publish_id is distinct from old.publish_id) then raise exception 'provider operation identity is immutable';end if;return new;end$$;
create trigger social_provider_operation_guard before update or delete on public.social_provider_operations for each row execute function generation_quote_private.guard_social_provider_operation();
create trigger social_connector_audit_guard before update or delete on public.social_connector_audit for each row execute function generation_quote_private.reject_job_link_mutation();
do $$declare t text;begin foreach t in array array['social_token_secrets','social_provider_operations','social_provider_rate_windows','social_connector_audit']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;end$$;
revoke all on function generation_quote_private.guard_social_secret_binding(),generation_quote_private.guard_social_provider_operation() from public,anon,authenticated,service_role;
alter table public.social_dispatches add column creator_action_required boolean,add column upload_time_source text check(upload_time_source in('server_confirmation_observed_at','provider_reported'));
-- The current immutable-row guard permits this field only in the initial upload settlement.
create or replace function generation_quote_private.guard_social_dispatch()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'dispatch history is immutable';end if;
 if (to_jsonb(new)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','uploaded_at','creator_action_required','upload_time_source','updated_at']) is distinct from (to_jsonb(old)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','uploaded_at','creator_action_required','upload_time_source','updated_at']) then raise exception 'dispatch authority is immutable';end if;
 if new.operation_kind='draft_upload' and new.state in ('claimed','sending') and old.state in ('queued','claimed') and current_setting('bizgenie.social_draft_worker',true) is distinct from 'v1' then raise exception 'draft-aware worker required';end if;
 if old.state in ('published','uploaded','failed','cancelled') and new is distinct from old then raise exception 'dispatch decision is final';end if;
 if (new.creator_action_required is distinct from old.creator_action_required or new.upload_time_source is distinct from old.upload_time_source) and not(old.state in('sending','reconciliation_required') and new.state='uploaded')then raise exception 'creator observation only on settlement';end if;
 if new.state in ('claimed','cancelled') and old.state in ('queued','claimed') then if new.fence<>old.fence+1 then raise exception 'new dispatch fence required';end if;
 elsif new.fence<>old.fence or new.claim_token is distinct from old.claim_token then raise exception 'dispatch fence is immutable';end if;
 if not ((old.state in ('queued','claimed') and new.state in ('claimed','cancelled')) or(old.state='claimed' and new.state='sending') or(old.state in ('sending','reconciliation_required') and new.state in ('reconciliation_required','published','uploaded','failed')) or new is not distinct from old)then raise exception 'invalid dispatch transition';end if;return new;end$$;
commit;
