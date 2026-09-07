const { canonical } = require('./schema');
const { CampaignPersistenceError } = require('./errors');
const clone = value => structuredClone(value);
const rootFields = ['campaign_id','tenant_id','project_id','brand_id','name','goal','initial_brand_snapshot_id','display_timezone','archived_at','created_at','updated_at','created_by','version','last_event_sequence'];
const itemFields = ['content_item_id','name','format','archived_at','created_at','updated_at','created_by'];
const variantFields = ['variant_id','platform','placement','destination_key','destination_label','workflow','current_revision_id','active_approval_id','active_schedule_id','pending_attempt_id','publication_id','created_at','updated_at'];
const pick = (row,fields) => Object.fromEntries(fields.map(key=>[key,row[key]]));
const maps = {approvals:'approval_id',previews:'preview_id',schedules:'schedule_id',attempts:'attempt_id',resolutions:'resolution_id',publications:'publication_id',corrections:'correction_id'};
function normalize(value) {
  if(value instanceof Date) return value.toISOString();
  if(Array.isArray(value)) return value.map(normalize);
  if(value instanceof Map) return new Map([...value].map(([k,v])=>[k,normalize(v)]));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)]));
  return value;
}
function ordered(map,fn=value=>value) {return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,fn(v)]);}
function record(row) {
  // SQL repeats ownership columns on immutable descendants; the enclosing aggregate
  // and database composite keys supply the same ownership in the domain adapter.
  return Object.fromEntries(Object.entries(normalize(row)).filter(([key])=>!['tenant_id','project_id','brand_id','campaign_id','content_item_id'].includes(key)));
}
function view(campaign) {
  const result=pick(campaign,rootFields);
  result.items=ordered(campaign.items,item=>({...pick(item,itemFields),variants:ordered(item.variants,variant=>({...pick(variant,variantFields),revisions:ordered(variant.revisions,record)}))}));
  for(const key of Object.keys(maps)) result[key]=ordered(campaign[key],record);
  return normalize(result);
}
function replay(campaign) {
  let rebuilt;
  const variant=id=>{for(const item of rebuilt.items.values()) if(item.variants.has(id))return item.variants.get(id);throw new Error('Missing variant');};
  let sequence=0, version=0, commandId, commandIndex=0;
  for(const e of campaign.events) {
    if(e.sequence!==++sequence || e.campaign_id!==campaign.campaign_id || e.tenant_id!==campaign.tenant_id || e.project_id!==campaign.project_id || e.brand_id!==campaign.brand_id)throw new Error('Invalid envelope');
    if(e.command_id!==commandId){if(e.campaign_version!==++version)throw new Error('Invalid version');commandId=e.command_id;commandIndex=0;}
    if(e.command_event_index!==++commandIndex || e.campaign_version!==version)throw new Error('Invalid command interval');
    const p=e.payload,r=p.record;
    if(e.event_type==='campaign.created') {
      if(rebuilt || sequence!==1)throw new Error('Duplicate campaign');
      rebuilt={...clone(p.campaign),items:new Map(),...Object.fromEntries(Object.keys(maps).map(key=>[key,new Map()]))};
    } else if(!rebuilt)throw new Error('Missing campaign');
    switch(e.event_type) {
      case 'campaign.created': break;
      case 'campaign.details_updated': Object.assign(rebuilt,{name:p.name,display_timezone:p.display_timezone});break;
      case 'campaign.archived': rebuilt.archived_at=e.recorded_at;break;
      case 'campaign.restored': rebuilt.archived_at=null;break;
      case 'content_item.created': rebuilt.items.set(p.content_item.content_item_id,{...clone(p.content_item),variants:new Map()});break;
      case 'content_item.renamed': Object.assign(rebuilt.items.get(p.content_item_id),{name:p.name,updated_at:e.recorded_at});break;
      case 'content_item.archived': case 'content_item.restored': Object.assign(rebuilt.items.get(p.content_item_id),{archived_at:e.event_type.endsWith('archived')?e.recorded_at:null,updated_at:e.recorded_at});break;
      case 'variant.created': {const item=rebuilt.items.get(p.variant.content_item_id);item.variants.set(p.variant.variant_id,{...clone(p.variant),revisions:new Map()});item.updated_at=e.recorded_at;break;}
      case 'revision.created': {const v=variant(r.variant_id);v.revisions.set(r.revision_id,clone(r));Object.assign(v,{current_revision_id:r.revision_id,workflow:'draft',updated_at:e.recorded_at});break;}
      case 'review.submitted': Object.assign(variant(p.variant_id),{workflow:'review',updated_at:e.recorded_at});break;
      case 'preview.acknowledged': rebuilt.previews.set(r.preview_id,clone(r));break;
      case 'approval.approved': case 'approval.changes_requested': case 'approval.revoked': {
        rebuilt.approvals.set(r.approval_id,clone(r));Object.assign(variant(r.variant_id),{active_approval_id:r.decision==='approved'?r.approval_id:null,workflow:r.decision==='approved'?'approved':r.decision==='revoked'?'review':'draft',updated_at:e.recorded_at});break;
      }
      case 'schedule.created': rebuilt.schedules.set(r.schedule_id,clone(r));Object.assign(variant(r.variant_id),{active_schedule_id:r.schedule_id,workflow:'scheduled',updated_at:e.recorded_at});break;
      case 'schedule.cancelled': Object.assign(variant(p.variant_id),{active_schedule_id:null,workflow:'approved',updated_at:e.recorded_at});break;
      case 'publication.attempt_started': rebuilt.attempts.set(r.attempt_id,clone(r));Object.assign(variant(r.variant_id),{pending_attempt_id:r.attempt_id,updated_at:e.recorded_at});break;
      case 'publication.attempt_failed': case 'publication.attempt_cancelled': rebuilt.resolutions.set(r.resolution_id,clone(r));Object.assign(variant(r.variant_id),{pending_attempt_id:null,updated_at:e.recorded_at,...(r.outcome==='failed'?{workflow:'approved',active_schedule_id:null}:{})});break;
      case 'publication.confirmed': rebuilt.resolutions.set(p.resolution.resolution_id,clone(p.resolution));rebuilt.publications.set(p.publication.publication_id,clone(p.publication));Object.assign(variant(p.publication.variant_id),{publication_id:p.publication.publication_id,pending_attempt_id:null,active_approval_id:null,active_schedule_id:null,workflow:'published',updated_at:e.recorded_at});break;
      case 'publication.corrected': rebuilt.corrections.set(r.correction_id,clone(r));variant(r.variant_id).updated_at=e.recorded_at;break;
      default: throw new Error('Unknown campaign event');
    }
    rebuilt.version=version;rebuilt.last_event_sequence=sequence;rebuilt.updated_at=e.recorded_at;
  }
  return rebuilt;
}
function verify(campaign) {
  let valid=false;
  try {valid=canonical(view(campaign))===canonical(view(replay(campaign)));}catch{}
  return {valid,campaign_version:campaign.version,last_event_sequence:campaign.last_event_sequence};
}
function latestCorrection(campaign,publicationId) {
  const rows=[...campaign.corrections.values()].filter(row=>row.publication_id===publicationId);
  let prior=null,current;
  for(let i=0;i<rows.length;i++) {
    const next=rows.filter(row=>row.supersedes_correction_id===prior);
    if(next.length!==1)throw new CampaignPersistenceError();
    current=next[0];prior=current.correction_id;
  }
  return current;
}
function rollup(campaign,item) {
  const items=item?[item]:[...campaign.items.values()].filter(row=>!row.archived_at);
  const stages=items.map(row=>{const states=[...row.variants.values()].map(v=>v.workflow);return ['draft','review','approved','scheduled','published'].find(s=>states.includes(s))||'draft';});
  const values=item?[...item.variants.values()].map(row=>row.workflow):stages;
  const order=['draft','review','approved','scheduled','published'];
  const counts=Object.fromEntries(order.map(s=>[s,values.filter(value=>value===s).length]));
  return {status:order.find(s=>counts[s])||'draft',counts};
}
function decorate(campaign) {
  const result=normalize(clone(campaign));Object.assign(result,rollup(result));
  for(const item of result.items.values())Object.assign(item,rollup(result,item));
  return result;
}
function calendar(campaigns,{from,to}) {
  const entries=[];
  for(const campaign of campaigns) for(const item of campaign.items.values()) {
    if(campaign.archived_at||item.archived_at)continue;
    for(const v of item.variants.values()) {
      const publication=campaign.publications.get(v.publication_id);
      const instant=publication?(latestCorrection(campaign,v.publication_id)||publication).published_at:campaign.schedules.get(v.active_schedule_id)?.scheduled_for;
      if(instant && instant>=new Date(from).toISOString() && instant<new Date(to).toISOString())entries.push({campaign_id:campaign.campaign_id,content_item_id:item.content_item_id,variant_id:v.variant_id,workflow:v.workflow,occurrence_at:instant});
    }
  }
  return entries.sort((a,b)=>a.occurrence_at.localeCompare(b.occurrence_at)||a.variant_id.localeCompare(b.variant_id));
}
module.exports={normalize,verify,decorate,calendar,latestCorrection,rootFields,itemFields,variantFields,pick};
