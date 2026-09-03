const { z } = require("zod");
const { createHash } = require("node:crypto");
const { CampaignValidationError } = require("./errors");

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());
const reason = z.string().trim().min(1).max(1000);
const name = z.string().trim().min(1).max(200);
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
  title: z.string().min(1).max(200).nullable(),
  body: z.string().min(1).max(32000).nullable(),
  caption: z.string().min(1).max(8000).nullable(),
  alt_text: z.string().min(1).max(2000).nullable(),
  asset_refs: z.array(assetRef).max(10),
}).strict();
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
  const parsed = base.safeParse(value);
  if (!parsed.success) throw new CampaignValidationError();
  return parsed.data;
}

function emptyContent() {
  return { title: null, body: null, caption: null, alt_text: null, asset_refs: [] };
}

module.exports = { identifier, uuid, reason, name, actor, authorization, content, parseCommand, hashIntent, canonical, emptyContent };
