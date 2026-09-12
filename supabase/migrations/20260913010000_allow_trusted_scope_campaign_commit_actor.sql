-- BG-LAUNCH-003B3: allow canonical trusted-scope customer actors during
-- campaign commit validation without weakening receipt/event integrity checks.

begin;

create or replace function campaign_private.validate_campaign_commit()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  cid uuid;
  root public.campaigns%rowtype;
  n integer;
  hi integer;
  versions integer;
  first_event jsonb;
  latest_name text;
  latest_zone text;
begin
  cid := new.campaign_id;
  select * into root from public.campaigns where campaign_id = cid;

  select count(*), max(sequence), count(distinct campaign_version)
    into n, hi, versions
    from public.campaign_events
   where campaign_id = cid;

  if n <> root.last_event_sequence
     or hi <> n
     or versions <> root.version
     or (select count(*) from public.campaign_command_receipts where campaign_id = cid) <> root.version
  then
    raise exception 'campaign event receipt counters disagree' using errcode='23514';
  end if;

  if exists(
       select 1
         from public.campaign_command_receipts r
        where r.campaign_id = cid
          and (
            r.result_campaign_version <> r.expected_campaign_version + 1
            or (select count(*) from public.campaign_events e where e.command_id = r.command_id) <> r.last_sequence - r.first_sequence + 1
            or (select min(sequence) from public.campaign_events e where e.command_id = r.command_id) <> r.first_sequence
            or (select max(sequence) from public.campaign_events e where e.command_id = r.command_id) <> r.last_sequence
          )
     )
     or exists(
       select 1
         from public.campaign_events e
         join public.campaign_command_receipts r using(command_id)
        where e.campaign_id = cid
          and (
            e.campaign_version <> r.result_campaign_version
            or e.command_event_index <> e.sequence - r.first_sequence + 1
            or (
              e.actor is distinct from jsonb_build_object(
                'kind','customer',
                'auth_user_id',r.auth_user_id
              )
              and e.actor is distinct from jsonb_build_object(
                'kind','customer',
                'auth_user_id',r.auth_user_id,
                'trusted_scope',jsonb_build_object(
                  'tenant_id',e.tenant_id,
                  'project_id',e.project_id,
                  'brand_id',e.brand_id
                )
              )
            )
          )
     )
  then
    raise exception 'campaign event receipt interval disagrees' using errcode='23514';
  end if;

  select payload->'campaign'
    into first_event
    from public.campaign_events
   where campaign_id = cid
     and sequence = 1
     and event_type = 'campaign.created';

  select payload->>'name', payload->>'display_timezone'
    into latest_name, latest_zone
    from public.campaign_events
   where campaign_id = cid
     and event_type = 'campaign.details_updated'
   order by sequence desc
   limit 1;

  if first_event is null
     or root.name is distinct from coalesce(latest_name, first_event->>'name')
     or root.display_timezone is distinct from coalesce(latest_zone, first_event->>'display_timezone')
     or root.goal is distinct from first_event->>'goal'
  then
    raise exception 'campaign root does not match event history' using errcode='23514';
  end if;

  if exists(
    select 1
      from public.campaign_content_items i
     where i.campaign_id = cid
       and not exists(
         select 1
           from public.campaign_platform_variants v
          where v.content_item_id = i.content_item_id
       )
  )
  then
    raise exception 'campaign item requires a variant' using errcode='23514';
  end if;

  if exists (
    select 1
      from public.campaign_platform_variants v
      left join lateral (
        select case e.event_type
          when 'revision.created' then 'draft'
          when 'review.submitted' then 'review'
          when 'approval.approved' then 'approved'
          when 'approval.revoked' then 'review'
          when 'approval.changes_requested' then 'draft'
          when 'schedule.created' then 'scheduled'
          when 'schedule.cancelled' then 'approved'
          when 'publication.confirmed' then 'published'
          when 'publication.attempt_failed' then 'approved'
        end stage
          from public.campaign_events e
         where e.campaign_id = cid
           and coalesce(
             e.payload->>'variant_id',
             e.payload->'record'->>'variant_id',
             e.payload->'publication'->>'variant_id'
           ) = v.variant_id::text
           and e.event_type in (
             'revision.created','review.submitted','approval.approved','approval.revoked',
             'approval.changes_requested','schedule.created','schedule.cancelled',
             'publication.confirmed','publication.attempt_failed'
           )
         order by e.sequence desc
         limit 1
      ) expected on true
     where v.campaign_id = cid
       and v.workflow is distinct from expected.stage
  )
  then
    raise exception 'campaign workflow does not match event history' using errcode='23514';
  end if;

  return null;
end
$function$;

commit;
