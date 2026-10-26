-- BG-STUDIO-021 draft, no shared application authorized.
begin;
create table public.customer_media_intakes(
 asset_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,
 created_by uuid not null references public.customer_profiles(auth_user_id),
 filename text not null check(length(filename) between 1 and 200),content_type text not null check(content_type in ('image/png','image/jpeg','image/webp','video/mp4')),
 declared_bytes bigint not null check(declared_bytes between 1 and 33554432),storage_key text not null unique,
 rights_policy_version text not null,rights_statement text not null,rights_confirmed_at timestamptz not null,
 idempotency_key text not null,intent_hash text not null check(intent_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'initiated' check(state in ('initiated','quarantined','ready','rejected','revoked','deleted')),
 generation text,sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),inspection jsonb,
 created_at timestamptz not null,updated_at timestamptz not null,
 foreign key(tenant_id,project_id) references public.projects(tenant_id,project_id) on delete restrict,
 foreign key(project_id,brand_id) references public.brand_brains(project_id,brand_id) on delete restrict,
 unique(tenant_id,project_id,created_by,idempotency_key)
);
create table public.customer_media_intake_audit(
 event_id uuid primary key,asset_id uuid not null references public.customer_media_intakes(asset_id) on delete restrict,
 actor_id uuid not null references public.customer_profiles(auth_user_id),event_type text not null,recorded_at timestamptz not null
);
alter table public.customer_media_intakes enable row level security;
alter table public.customer_media_intake_audit enable row level security;
revoke all on public.customer_media_intakes,public.customer_media_intake_audit from public,anon,authenticated,service_role;
create function generation_quote_private.guard_intake() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'media intake history is immutable';end if;
 if (to_jsonb(new)-array['state','generation','sha256','inspection','updated_at']) is distinct from (to_jsonb(old)-array['state','generation','sha256','inspection','updated_at']) then raise exception 'media intake authority is immutable';end if;
 if old.sha256 is not null and (new.sha256 is distinct from old.sha256 or new.generation is distinct from old.generation) then raise exception 'uploaded bytes are immutable';end if;
 if not ((old.state='initiated' and new.state='quarantined') or (old.state='quarantined' and new.state in ('ready','rejected')) or (old.state in ('initiated','quarantined','ready','rejected') and new.state in ('revoked','deleted')) or (old.state='revoked' and new.state='deleted') or new is not distinct from old) then raise exception 'invalid media intake transition';end if;
 return new;end$$;
create trigger customer_media_intake_guard before update or delete on public.customer_media_intakes for each row execute function generation_quote_private.guard_intake();
create trigger customer_media_intake_audit_immutable before update or delete on public.customer_media_intake_audit for each row execute function generation_quote_private.reject_job_link_mutation();
revoke all on function generation_quote_private.guard_intake() from public,anon,authenticated,service_role;
commit;
