'use strict';
const {z}=require('zod');
const {hashIntent}=require('../campaigns/schema');
const {CustomerTrustedScopeSchema}=require('../authorization/schema');
const KEY='bg-r2-founder-campaign-v1';
const text=max=>z.string().min(1).max(max).refine(v=>v.isWellFormed()&&v.trim().length>0);
const bodySchema=CustomerTrustedScopeSchema.extend({name:text(200),goal:text(2000),display_timezone:text(255).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),idempotency_key:z.literal(KEY)}).strict();
const bindingSchema=CustomerTrustedScopeSchema.extend({body_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
function bodyHash(value){const parsed=bodySchema.safeParse(value);if(!parsed.success||Object.keys(parsed.data).some(k=>parsed.data[k]!==value[k]))throw Error('FOUNDER_CAMPAIGN_BODY_INVALID');return hashIntent(value);}
function binding(value){const p=bindingSchema.safeParse(value);if(!p.success||Object.keys(p.data).some(k=>p.data[k]!==value[k]))throw Error('FOUNDER_CAMPAIGN_BINDING_INVALID');return p.data;}
module.exports={KEY,bodySchema,bodyHash,binding};
