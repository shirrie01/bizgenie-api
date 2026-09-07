const { z } = require("zod");
const { createHash } = require("node:crypto");
const { CampaignValidationError } = require("./errors");

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const text = (max, trim = true) => z.string().refine(value => value.isWellFormed()).transform(value => {
  const normalized = value.normalize('NFC').replace(/\r\n/g, '\n');
  return trim ? normalized.trim() : normalized;
}).refine(value => [...value].length > 0 && [...value].length <= max);
const reason = text(1000);
const name = text(200);
const zone = z.string().min(1).max(255).refine(value => { try { new Intl.DateTimeFormat('en', {timeZone:value}); return true; } catch { return false; } });
const time = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/).refine(value => {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return false;
  const [y,m,d] = value.slice(0,10).split('-').map(Number);
  return d >= 1 && d <= new Date(Date.UTC(y,m,0)).getUTCDate() && m >= 1 && m <= 12;
}).transform(value => new Date(value).toISOString());
const actor = z.object({ kind: z.literal("customer"), auth_user_id: uuid }).strict();
const authorization = z.object({
  actor,
  tenant_id: identifier,
  project_id: identifier,
  membership_role: z.enum(["owner", "member"]),
  policy_version: z.literal("campaign-owner.v1"),
}).strict();
const assetRef = z.object({ asset_id: uuid, role: z.enum(["primary", "supporting"]) }).strict();
const content = z.object({
  title: text(200, false).nullable(),
  body: text(32000, false).nullable(),
  caption: text(8000, false).nullable(),
  alt_text: text(2000, false).nullable(),
  asset_refs: z.array(assetRef).max(10).refine(refs => new Set(refs.map(ref => ref.asset_id)).size === refs.length),
}).strict();
const destination = {platform:z.enum(['linkedin','instagram','facebook','tiktok','youtube','email','other']),placement:identifier,destination_label:name,destination_key:uuid.optional()};
const revision = {variant_id:uuid,revision_id:uuid};
const approval = {...revision,approval_id:uuid};
const schedule = {...approval,scheduled_for:time,timezone:zone,local_datetime:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/),utc_offset_minutes:z.number().int().min(-840).max(840)};
const publicationUrl = z.string().max(2048).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}}).nullable();
const metadata = {published_at:time,publication_url:publicationUrl,external_reference:identifier.nullable(),note:reason.nullable()};
const payloads = Object.fromEntries(Object.entries({
  create_campaign:{brand_id:identifier,name,goal:text(2000),display_timezone:zone},
  create_content_item:{name,format:z.enum(['text','image','video']),...destination,initial_content:content.optional()},
  add_variant:{content_item_id:uuid,...destination,initial_content:content.optional()},
  update_campaign_details:{name,display_timezone:zone},rename_content_item:{content_item_id:uuid,name},
  archive_content_item:{content_item_id:uuid,reason},restore_content_item:{content_item_id:uuid,reason},
  archive_campaign:{reason},restore_campaign:{reason},
  save_revision:{variant_id:uuid,content,change_reason:reason,brand_snapshot_id:uuid.optional(),capture_current_brand:z.boolean().optional()},
  submit_review:revision,acknowledge_preview:{...revision,render_receipt_id:uuid,acknowledged:z.literal(true)},
  approve:{...revision,preview_id:uuid,approved:z.literal(true)},request_changes:{...revision,reason},
  revoke_approval:{variant_id:uuid,approval_id:uuid,reason},schedule,reschedule:schedule,
  unschedule:{variant_id:uuid,schedule_id:uuid},begin_manual_publication:approval,
  confirm_manual_publication:{variant_id:uuid,attempt_id:uuid,...metadata,publication_url:publicationUrl.optional(),external_reference:identifier.nullable().optional(),note:reason.nullable().optional(),attested_published:z.literal(true)},
  fail_manual_publication:{variant_id:uuid,attempt_id:uuid,reason,not_published_attestation:z.literal(true)},
  cancel_manual_publication:{variant_id:uuid,attempt_id:uuid,reason,not_published_attestation:z.literal(true)},
  correct_publication:{variant_id:uuid,publication_id:uuid,...metadata,reason},
}).map(([key,shape])=>[key,z.object(shape).strict()]));
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const previewReceipt=z.object({render_receipt_id:uuid,variant_id:uuid,revision_id:uuid,revision_content_hash:hash,profile_id:identifier,profile_version:z.number().int().min(1).max(2147483647),profile_hash:hash,platform:destination.platform,placement:identifier,format:z.enum(['text','image','video']),renderer_version:identifier,render_input_hash:hash,preview_digest:hash,rendered_at:time}).strict();
const base = z.object({
  contract_version: z.literal("campaign-spine.v1"),
  idempotency_key: identifier,
  expected_campaign_version: z.number().int().min(0).max(2147483647),
  command_type: identifier,
  tenant_id: identifier,
  project_id: identifier,
  campaign_id: uuid.optional(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

function canonical(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashIntent(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function parseCommand(value) {
  try { if (Buffer.byteLength(JSON.stringify(value),'utf8') > 256 * 1024) throw new Error(); } catch { throw new CampaignValidationError(); }
  const parsed = base.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  const schema = Object.hasOwn(payloads,parsed.data.command_type) ? payloads[parsed.data.command_type] : null;
  const payload = schema?.safeParse(parsed.data.payload);
  if (!payload?.success || (parsed.data.command_type === 'create_campaign' ? parsed.data.campaign_id !== undefined : !parsed.data.campaign_id)) throw new CampaignValidationError();
  return {...parsed.data,payload:payload.data};
}

function emptyContent() {
  return { title: null, body: null, caption: null, alt_text: null, asset_refs: [] };
}

module.exports = { identifier, uuid, reason, name, actor, authorization, content, parseCommand, hashIntent, canonical, emptyContent, time, payloads, previewReceipt };
