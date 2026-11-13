-- Pending hardening only; never apply to shared databases without founder approval.
begin;
-- Validate existing rows instead of guessing tenant ownership or rewriting customer data.
do $$
begin
  if to_regclass('public.workspace_onboarding_profiles') is null then
    raise exception 'workspace onboarding base migration is required';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass and conname='workspace_onboarding_profiles_project_tenant_fkey') then
    alter table public.workspace_onboarding_profiles
      add constraint workspace_onboarding_profiles_project_tenant_fkey
      foreign key (project_id, tenant_id) references public.projects(project_id, tenant_id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.workspace_onboarding_profiles'::regclass and conname='workspace_onboarding_channels_values') then
    alter table public.workspace_onboarding_profiles add constraint workspace_onboarding_channels_values check (
      channels <@ '["instagram","tiktok","facebook","linkedin","email","website"]'::jsonb
      and jsonb_array_length(channels) =
        (case when channels ? 'instagram' then 1 else 0 end) +
        (case when channels ? 'tiktok' then 1 else 0 end) +
        (case when channels ? 'facebook' then 1 else 0 end) +
        (case when channels ? 'linkedin' then 1 else 0 end) +
        (case when channels ? 'email' then 1 else 0 end) +
        (case when channels ? 'website' then 1 else 0 end)
    );
  end if;
end $$;
-- Do not fix unexpected grants automatically; application preflight must report drift.
commit;
