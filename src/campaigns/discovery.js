const {z}=require('zod');
const {createHash}=require('node:crypto');
const {identifier,uuid,canonical}=require('./schema');
const {CampaignValidationError}=require('./errors');
const schema=z.object({tenant_id:identifier,project_id:identifier,archived:z.enum(['active','archived','all']).default('active'),limit:z.coerce.number().int().min(1).max(100).default(25),cursor:z.string().max(1024).optional()}).strict();
function parseQuery(input,actor){const parsed=schema.safeParse(input);if(!parsed.success)throw new CampaignValidationError();const q=parsed.data;const binding=createHash('sha256').update(canonical([q.tenant_id,q.project_id,q.archived,actor.auth_user_id])).digest('hex');let after=null;if(q.cursor){try{const v=JSON.parse(Buffer.from(q.cursor,'base64url'));if(v.binding!==binding||!uuid.safeParse(v.id).success||!z.string().datetime({offset:true}).safeParse(v.at).success)throw Error();after={id:v.id,at:new Date(v.at).toISOString()};}catch{throw new CampaignValidationError();}}return {...q,binding,after};}
function page(q,rows){const selected=rows.slice(0,q.limit),last=selected.at(-1);return {contract_version:'campaign-discovery.v1',campaigns:selected,next_cursor:rows.length>q.limit?Buffer.from(JSON.stringify({binding:q.binding,id:last.campaign_id,at:last.updated_at})).toString('base64url'):null};}
const order=['draft','review','approved','scheduled','published'];
function summary(c){return Object.fromEntries(['campaign_id','tenant_id','project_id','brand_id','name','goal','display_timezone','version','status','counts','archived_at','created_at','updated_at'].map(k=>[k,c[k]]));}
function memoryRows(campaigns,q){return campaigns.filter(c=>(q.archived==='all'||(q.archived==='archived')===!!c.archived_at)&&(!q.after||c.updated_at<q.after.at||c.updated_at===q.after.at&&c.campaign_id>q.after.id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.campaign_id.localeCompare(b.campaign_id)).slice(0,q.limit+1).map(summary);}
// Bound roots before aggregating current state. No revisions, snapshots, events or history are loaded.
const SQL=`with roots as(select * from campaigns where tenant_id=$1 and project_id=$2 and ($3='all' or ($3='archived')=(archived_at is not null)) and ($4::timestamptz is null or updated_at<$4 or(updated_at=$4 and campaign_id>$5::uuid)) order by updated_at desc,campaign_id limit $6)
select c.campaign_id,c.tenant_id,c.project_id,c.brand_id,c.name,c.goal,c.display_timezone,c.version,c.archived_at,c.created_at,c.updated_at,
coalesce(s.status,'draft') status,coalesce(s.counts,'{"draft":0,"review":0,"approved":0,"scheduled":0,"published":0}'::jsonb) counts from roots c left join lateral(
 select (array['draft','review','approved','scheduled','published'])[min(rank)] status,jsonb_build_object('draft',count(*)filter(where rank=1),'review',count(*)filter(where rank=2),'approved',count(*)filter(where rank=3),'scheduled',count(*)filter(where rank=4),'published',count(*)filter(where rank=5)) counts from(
 select i.content_item_id,coalesce(min(array_position(array['draft','review','approved','scheduled','published'],v.workflow)),1) rank from campaign_content_items i left join campaign_platform_variants v using(tenant_id,project_id,campaign_id,content_item_id) where i.tenant_id=c.tenant_id and i.project_id=c.project_id and i.campaign_id=c.campaign_id and i.archived_at is null group by i.content_item_id)items
)s on true order by c.updated_at desc,c.campaign_id`;
module.exports={parseQuery,page,memoryRows,SQL,summary};
