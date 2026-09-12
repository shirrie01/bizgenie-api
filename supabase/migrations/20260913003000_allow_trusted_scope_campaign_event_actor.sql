-- BG-LAUNCH-003B2: allow canonical trusted-scope customer actors in
-- server-owned campaign events without weakening the fail-closed event shape.

begin;

create or replace function campaign_private.validate_event_shape()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  keys text[];
  minimal_actor jsonb;
  scoped_actor jsonb;
begin
  keys := case new.event_type
    when 'campaign.created' then array['campaign','brand_snapshot_id']
    when 'campaign.details_updated' then array['name','display_timezone']
    when 'campaign.archived' then array['reason']
    when 'campaign.restored' then array['reason']
    when 'content_item.created' then array['content_item']
    when 'content_item.renamed' then array['content_item_id','name']
    when 'content_item.archived' then array['content_item_id','reason']
    when 'content_item.restored' then array['content_item_id','reason']
    when 'variant.created' then array['variant']
    when 'revision.created' then array['record']
    when 'preview.acknowledged' then array['record']
    when 'review.submitted' then array['variant_id','revision_id']
    when 'approval.approved' then array['record']
    when 'approval.revoked' then array['record']
    when 'approval.changes_requested' then array['record']
    when 'schedule.created' then array['record']
    when 'schedule.cancelled' then array['variant_id','schedule_id','reason_code','reason']
    when 'publication.attempt_started' then array['record']
    when 'publication.attempt_failed' then array['record']
    when 'publication.attempt_cancelled' then array['record']
    when 'publication.confirmed' then array['resolution','publication']
    when 'publication.corrected' then array['record']
    else null
  end;

  minimal_actor := jsonb_build_object(
    'kind', 'customer',
    'auth_user_id', new.actor->>'auth_user_id'
  );

  scoped_actor := jsonb_build_object(
    'kind', 'customer',
    'auth_user_id', new.actor->>'auth_user_id',
    'trusted_scope', jsonb_build_object(
      'tenant_id', new.tenant_id,
      'project_id', new.project_id,
      'brand_id', new.brand_id
    )
  );

  if keys is null
     or not (new.payload ?& keys)
     or (new.payload - keys) <> '{}'::jsonb
     or new.actor->>'auth_user_id' is null
     or (new.actor is distinct from minimal_actor and new.actor is distinct from scoped_actor)
     or new.authorization_context is distinct from jsonb_build_object(
       'policy_version','campaign-owner.v1',
       'membership_role','owner',
       'action','project:write',
       'tenant_id',new.tenant_id,
       'project_id',new.project_id,
       'brand_id',new.brand_id
     )
  then
    raise exception 'invalid campaign event shape' using errcode='23514';
  end if;

  if new.payload ? 'record'
     and jsonb_typeof(new.payload->'record') is distinct from 'object'
  then
    raise exception 'invalid campaign event record' using errcode='23514';
  end if;

  return new;
end
$function$;

commit;
