const { z } = require('zod');
const { createHash } = require('node:crypto');
const { identifier, uuid } = require('./schema');
const { CampaignValidationError } = require('./errors');
const MAX_WINDOW_DAYS = 93;
const querySchema = z.object({
  tenant_id: identifier, project_id: identifier,
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }),
  campaign_id: uuid.optional(), platform: z.enum(['linkedin','instagram','facebook','tiktok','youtube','email','other']).optional(),
  workflow: z.enum(['draft','review','approved','scheduled','published']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().refine(q => Date.parse(q.to) > Date.parse(q.from) && Date.parse(q.to)-Date.parse(q.from) <= MAX_WINDOW_DAYS*86400000);
function binding(q) {
  return createHash('sha256').update(JSON.stringify([q.tenant_id,q.project_id,q.from,q.to,q.campaign_id||null,q.platform||null,q.workflow||null])).digest('hex');
}
function parseQuery(input) {
  const parsed=querySchema.safeParse(input);
  if(!parsed.success) throw new CampaignValidationError();
  const q=parsed.data;q.from=new Date(q.from).toISOString();q.to=new Date(q.to).toISOString();
  if(q.cursor) {
    try {
      const decoded=JSON.parse(Buffer.from(q.cursor,'base64url').toString('utf8'));
      const value=z.object({v:z.literal(1),binding:z.literal(binding(q)),at:z.string().datetime().nullable(),id:uuid}).strict().parse(decoded);
      q.after={at:value.at,id:value.id};
    } catch {throw new CampaignValidationError();}
  }
  return q;
}
function compare(a,b) {return (a.occurrence_at===null ? (b.occurrence_at===null?0:1) : b.occurrence_at===null?-1:a.occurrence_at.localeCompare(b.occurrence_at)) || a.variant_id.localeCompare(b.variant_id);}
function page(q,rows) {
  const selected=rows.slice(0,q.limit),last=selected.at(-1);
  return {contract_version:'workspace-calendar.v1',window:{from:q.from,to:q.to},display_timezone:'UTC',
    entries:selected.filter(r=>r.occurrence_at!==null),unscheduled:selected.filter(r=>r.occurrence_at===null),
    next_cursor:rows.length>q.limit?Buffer.from(JSON.stringify({v:1,binding:binding(q),at:last.occurrence_at,id:last.variant_id})).toString('base64url'):null};
}
function memoryRows(campaigns,q) {
  const rows=[];
  for(const c of campaigns) {
    if(c.archived_at || (q.campaign_id && c.campaign_id!==q.campaign_id))continue;
    for(const item of c.items.values()) {
      if(item.archived_at)continue;
      for(const v of item.variants.values()) {
        if((q.platform && q.platform!==v.platform)||(q.workflow && q.workflow!==v.workflow))continue;
        const publication=c.publications.get(v.publication_id);
        const corrections=[...c.corrections.values()].filter(r=>r.publication_id===v.publication_id);
        const correction=corrections.find(r=>!corrections.some(n=>n.supersedes_correction_id===r.correction_id));
        const schedule=c.schedules.get(v.active_schedule_id);
        const at=publication?(correction||publication).published_at:schedule?.scheduled_for||null;
        if(at!==null && (at<q.from || at>=q.to))continue;
        rows.push({campaign_id:c.campaign_id,campaign_name:c.name,content_item_id:item.content_item_id,content_item_name:item.name,format:item.format,
          variant_id:v.variant_id,platform:v.platform,placement:v.placement,destination_label:v.destination_label,workflow:v.workflow,
          occurrence_at:at,occurrence_kind:publication?'published':schedule?'scheduled':'unscheduled',
          schedule_id:publication?null:schedule?.schedule_id||null,publication_id:publication?.publication_id||null});
      }
    }
  }
  return rows.sort(compare).filter(r=>!q.after || compare(r,{occurrence_at:q.after.at,variant_id:q.after.id})>0).slice(0,q.limit+1);
}
// One scoped projection query; no aggregate hydration, per-campaign fan-out, external API or write.
const SQL = `with occurrences as (
 select c.campaign_id,c.name campaign_name,i.content_item_id,i.name content_item_name,i.format,
 v.variant_id,v.platform,v.placement,v.destination_label,v.workflow,
 case when p.publication_id is not null then coalesce(pc.published_at,p.published_at) else s.scheduled_for end occurrence_at,
 case when p.publication_id is not null then 'published' when s.schedule_id is not null then 'scheduled' else 'unscheduled' end occurrence_kind,
 case when p.publication_id is null then s.schedule_id else null end schedule_id,p.publication_id
 from public.campaigns c
 join public.campaign_content_items i on (i.tenant_id,i.project_id,i.campaign_id)=(c.tenant_id,c.project_id,c.campaign_id)
 join public.campaign_platform_variants v on (v.tenant_id,v.project_id,v.campaign_id,v.content_item_id)=(i.tenant_id,i.project_id,i.campaign_id,i.content_item_id)
 left join public.campaign_schedule_entries s on (s.tenant_id,s.project_id,s.campaign_id,s.variant_id,s.schedule_id)=(v.tenant_id,v.project_id,v.campaign_id,v.variant_id,v.active_schedule_id)
 left join public.campaign_publications p on (p.tenant_id,p.project_id,p.campaign_id,p.variant_id,p.publication_id)=(v.tenant_id,v.project_id,v.campaign_id,v.variant_id,v.publication_id)
 left join lateral (select x.published_at from public.campaign_publication_corrections x
   where (x.tenant_id,x.project_id,x.campaign_id,x.variant_id,x.publication_id)=(p.tenant_id,p.project_id,p.campaign_id,p.variant_id,p.publication_id)
   and not exists(select 1 from public.campaign_publication_corrections n where n.supersedes_correction_id=x.correction_id)
   limit 1) pc on true
 where c.tenant_id=$1 and c.project_id=$2 and c.archived_at is null and i.archived_at is null
 and ($5::uuid is null or c.campaign_id=$5) and ($6::text is null or v.platform=$6) and ($7::text is null or v.workflow=$7)
) select * from occurrences where (occurrence_at is null or (occurrence_at >= $3::timestamptz and occurrence_at < $4::timestamptz))
 and (not $8::boolean or ($9::timestamptz is null and occurrence_at is null and variant_id>$10::uuid)
 or ($9::timestamptz is not null and (occurrence_at is null or occurrence_at>$9 or (occurrence_at=$9 and variant_id>$10))))
 order by occurrence_at asc nulls last,variant_id asc limit $11`;
const platformSQL=SQL
 .replace('v.destination_label,v.workflow,',"v.destination_label,case when vp.dispatch_id is not null then 'published' else v.workflow end workflow,")
 .replace("case when p.publication_id is not null then coalesce(pc.published_at,p.published_at) else s.scheduled_for end occurrence_at", "case when vp.dispatch_id is not null then vp.published_at when p.publication_id is not null then coalesce(pc.published_at,p.published_at) else s.scheduled_for end occurrence_at")
 .replace("case when p.publication_id is not null then 'published'", "case when vp.dispatch_id is not null or p.publication_id is not null then 'published'")
 .replace('case when p.publication_id is null then s.schedule_id else null end schedule_id,p.publication_id',"case when p.publication_id is null and vp.dispatch_id is null then s.schedule_id else null end schedule_id,coalesce(vp.dispatch_id,p.publication_id) publication_id,vp.evidence_kind,vp.provider_publication_id")
 .replace(' left join public.campaign_schedule_entries s'," left join lateral(select x.* from public.verified_campaign_publications x where x.tenant_id=v.tenant_id and x.project_id=v.project_id and x.campaign_id=v.campaign_id and x.variant_id=v.variant_id order by x.published_at desc,x.dispatch_id desc limit 1)vp on true\n left join public.campaign_schedule_entries s")
 .replace('or v.workflow=$7)',"or (case when vp.dispatch_id is not null then 'published' else v.workflow end)=$7)");
module.exports={parseQuery,page,memoryRows,SQL,platformSQL,MAX_WINDOW_DAYS};
