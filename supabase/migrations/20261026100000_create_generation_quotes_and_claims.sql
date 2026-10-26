-- BG-STUDIO-020 draft only. Apply only in disposable local tests until separately approved.
begin;
create table public.generation_quotes (
 quote_id uuid primary key,tenant_id text not null,project_id text not null,brand_id text not null,
 auth_user_id uuid not null references public.customer_profiles(auth_user_id) on delete restrict,
 idempotency_key text not null,request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 request jsonb not null check(jsonb_typeof(request)='object'),
 profile jsonb not null check(jsonb_typeof(profile)='object'),
 policy_id text not null references public.commercial_policies(policy_id) on delete restrict,
 policy_version integer not null check(policy_version>0),entitlement_id text not null references public.tenant_entitlements(entitlement_id) on delete restrict,
 credit_cost bigint not null check(credit_cost>0),available_credits bigint not null check(available_credits>=0),
 created_at timestamptz not null,expires_at timestamptz not null check(expires_at>created_at),
 state text not null default 'quoted' check(state in ('quoted','confirmed','cancelled')),
 confirmation_key text,job_id text unique references public.generation_jobs(job_id) on delete restrict,
 reservation_id text references public.credit_ledger(ledger_entry_id) on delete restrict,
 foreign key(job_id,tenant_id,project_id) references public.generation_jobs(job_id,tenant_id,project_id) on delete restrict,
 foreign key(tenant_id,project_id) references public.projects(tenant_id,project_id) on delete restrict,
 foreign key(project_id,brand_id) references public.brand_brains(project_id,brand_id) on delete restrict,
 unique(tenant_id,project_id,auth_user_id,idempotency_key),
 check((state='confirmed' and confirmation_key is not null and job_id is not null and reservation_id is not null) or (state in ('quoted','cancelled') and confirmation_key is null and job_id is null and reservation_id is null))
);
create table public.generation_execution_claims (
 job_id text primary key references public.generation_jobs(job_id) on delete restrict,
 quote_id uuid not null unique references public.generation_quotes(quote_id) on delete restrict,
 fence bigint not null default 0 check(fence>=0),claim_token uuid,
 state text not null default 'queued' check(state in ('queued','claimed','calling','recovery_required','succeeded','failed','cancelled')),
 claimed_at timestamptz,provider_reference text,result jsonb,
 updated_at timestamptz not null,
 check((state in ('claimed','calling','recovery_required','succeeded','failed'))=(claim_token is not null))
);
alter table public.generation_quotes enable row level security;
alter table public.generation_execution_claims enable row level security;
revoke all on public.generation_quotes,public.generation_execution_claims from public,anon,authenticated,service_role;
create schema generation_quote_private;
revoke all on schema generation_quote_private from public,anon,authenticated,service_role;
create function generation_quote_private.guard_quote() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'quote history is immutable';end if;
 if (to_jsonb(new)-array['state','confirmation_key','job_id','reservation_id']) is distinct from (to_jsonb(old)-array['state','confirmation_key','job_id','reservation_id']) then raise exception 'quote authority is immutable';end if;
 if old.state<>'quoted' and new is distinct from old then raise exception 'quote decision is final';end if;
 if old.state='quoted' and new.state not in ('quoted','confirmed','cancelled') then raise exception 'invalid quote transition';end if;
 return new;
end $$;
create trigger generation_quote_immutable before update or delete on public.generation_quotes for each row execute function generation_quote_private.guard_quote();
create function generation_quote_private.guard_claim() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'execution history is immutable';end if;
 if new.job_id<>old.job_id or new.quote_id<>old.quote_id then raise exception 'execution authority is immutable';end if;
 if old.state in ('succeeded','failed','cancelled') and new is distinct from old then raise exception 'execution result is final';end if;
 if new.state='claimed' and old.state in ('queued','claimed') then
  if new.fence<>old.fence+1 or new.claim_token is not distinct from old.claim_token then raise exception 'new execution fence required';end if;
 elsif new.fence<>old.fence or new.claim_token is distinct from old.claim_token then raise exception 'execution fence is immutable';
 end if;
 if not ((old.state in ('queued','claimed') and new.state='claimed') or (old.state='claimed' and new.state='calling') or (old.state in ('calling','recovery_required') and new.state in ('recovery_required','succeeded','failed')) or new is not distinct from old) then raise exception 'invalid execution transition';end if;
 return new;
end $$;
create trigger generation_claim_immutable before update or delete on public.generation_execution_claims for each row execute function generation_quote_private.guard_claim();
revoke all on function generation_quote_private.guard_quote(),generation_quote_private.guard_claim() from public,anon,authenticated,service_role;
commit;
