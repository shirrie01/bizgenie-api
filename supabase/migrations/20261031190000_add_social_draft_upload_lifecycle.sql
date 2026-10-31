-- BG-SOCIAL-001 proposal; disposable local databases only until separately approved.
begin;
alter table public.social_dispatches add column operation_kind text not null default 'publish' check(operation_kind in('publish','draft_upload')),
 add column uploaded_at timestamptz;
alter table public.social_dispatches drop constraint social_dispatches_state_check;
alter table public.social_dispatches add constraint social_dispatches_state_check check(state in('queued','claimed','sending','reconciliation_required','published','uploaded','failed','cancelled'));
alter table public.social_dispatches add constraint social_draft_not_publication check(
 (operation_kind='publish' and state<>'uploaded' and uploaded_at is null) or
 (operation_kind='draft_upload' and state<>'published' and publication_id is null and publication_url is null and published_at is null and
  ((state='uploaded' and uploaded_at is not null and provider_reference is not null) or (state<>'uploaded' and uploaded_at is null)))
);
create or replace function generation_quote_private.guard_social_dispatch()returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'dispatch history is immutable';end if;
 if (to_jsonb(new)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','uploaded_at','updated_at']) is distinct from (to_jsonb(old)-array['state','fence','claim_token','provider_reference','publication_id','publication_url','published_at','uploaded_at','updated_at']) then raise exception 'dispatch authority is immutable';end if;
 if new.operation_kind='draft_upload' and new.state in ('claimed','sending') and old.state in ('queued','claimed') and current_setting('bizgenie.social_draft_worker',true) is distinct from 'v1' then raise exception 'draft-aware worker required';end if;
 if old.state in ('published','uploaded','failed','cancelled') and new is distinct from old then raise exception 'dispatch decision is final';end if;
 if new.state in ('claimed','cancelled') and old.state in ('queued','claimed') then
  if new.fence<>old.fence+1 then raise exception 'new dispatch fence required';end if;
 elsif new.fence<>old.fence or new.claim_token is distinct from old.claim_token then raise exception 'dispatch fence is immutable';end if;
 if not ((old.state in ('queued','claimed') and new.state in ('claimed','cancelled')) or (old.state='claimed' and new.state='sending') or (old.state in ('sending','reconciliation_required') and new.state in ('reconciliation_required','published','uploaded','failed')) or new is not distinct from old)then raise exception 'invalid dispatch transition';end if;
 return new;end$$;
commit;
