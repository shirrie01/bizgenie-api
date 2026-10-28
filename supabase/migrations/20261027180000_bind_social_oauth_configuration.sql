-- BG025 proposal: disposable local rehearsal only; shared application requires approval.
begin;
alter table public.social_oauth_intents add column authorization_config_hash text,
 add column redirect_uri text,
 add constraint social_oauth_configuration_pair check (
  (authorization_config_hash is null and redirect_uri is null) or
  (authorization_config_hash is not null and authorization_config_hash ~ '^[a-f0-9]{64}$' and redirect_uri is not null and length(redirect_uri)<=2048)
 );
alter table public.social_connections add column display_name text check(display_name is null or length(display_name) between 1 and 200);
-- Existing deny-by-default RLS and grants remain unchanged. Legacy rows retained.
commit;
