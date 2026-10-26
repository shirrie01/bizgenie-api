-- DEC-023: additive sector domain only. Apply only under separate target approval.
-- Historical migrations are untouched; unknown/weakened definitions are rejected.
begin;
do $migration$
declare current_definition text; validated boolean;
begin
  select pg_get_constraintdef(oid),convalidated into current_definition,validated
    from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass
      and conname='workspace_onboarding_profiles_sector_key_check' and contype='c';
  if current_definition is null or not validated or current_definition not in (
    $old$CHECK ((sector_key = ANY (ARRAY['leasing'::text, 'perfume'::text, 'aesthetics'::text, 'beverage'::text, 'charity'::text, 'takeaway'::text, 'neutral'::text])))$old$,
    $new$CHECK ((sector_key = ANY (ARRAY['leasing'::text, 'perfume'::text, 'aesthetics'::text, 'beverage'::text, 'charity'::text, 'takeaway'::text, 'neutral'::text, 'professional_services'::text])))$new$
  ) then raise exception 'DEC-023 requires the reviewed onboarding sector constraint'; end if;
  if current_definition = $old$CHECK ((sector_key = ANY (ARRAY['leasing'::text, 'perfume'::text, 'aesthetics'::text, 'beverage'::text, 'charity'::text, 'takeaway'::text, 'neutral'::text])))$old$ then
    alter table public.workspace_onboarding_profiles drop constraint workspace_onboarding_profiles_sector_key_check;
    alter table public.workspace_onboarding_profiles add constraint workspace_onboarding_profiles_sector_key_check
      check(sector_key in ('leasing','perfume','aesthetics','beverage','charity','takeaway','neutral','professional_services'));
  end if;
end $migration$;
commit;
