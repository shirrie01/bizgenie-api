-- BG-STUDIO-020 draft only. Existing production composition does not use recovery repository.
begin;
alter table public.stripe_webhook_events add column claim_token uuid;
alter table public.stripe_webhook_events add column attempt_generation bigint not null default 0 check(attempt_generation>=0);
alter table public.stripe_webhook_events add column claimed_at timestamptz;
commit;
