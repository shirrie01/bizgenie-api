const contract = require("./schemaContract.json");
const professionalContract = require("./schemaContractProfessional.json");
const { OnboardingPersistenceError } = require("./errors");
// PostgreSQL17 logical dump/reparse flattens this one redundant AND grouping.
// Accept only this exact equivalent rendering, never general parenthesis removal.
const idempotencyName = "workspace_onboarding_profiles_last_idempotency_key_check";
const restoredIdempotency = "CHECK (((length(last_idempotency_key) >= 1) AND (length(last_idempotency_key) <= 128) AND (last_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'::text)))";
function normalizedConstraint(c) {
  let definition = c.definition.replace(/public\./g, "").replace(/\s+/g, " ").trim();
  if (c.conname === idempotencyName && definition === restoredIdempotency) {
    definition = contract.constraints.find(entry => entry.name === idempotencyName).definition;
  }
  return { name: c.conname, definition };
}

const columns = {
  tenant_id: ["text", true], project_id: ["text", true], brand_id: ["text", true], profile_version: ["integer", true],
  status: ["text", true], sector_key: ["text", false], sector_source: ["text", false], industry_text: ["text", false],
  channels: ["jsonb", true], channels_source: ["text", false], current_step: ["smallint", false], draft: ["jsonb", true],
  completed_at: ["timestamp with time zone", false], created_at: ["timestamp with time zone", true],
  updated_at: ["timestamp with time zone", true], updated_by: ["uuid", true], last_idempotency_key: ["text", true], last_request_hash: ["text", true],
};
async function preflight(client) {
  const table = await client.query(`select c.relrowsecurity,c.relkind,
    exists(select 1 from pg_policy p where p.polrelid=c.oid) policy_access,
    exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) public_access
    from pg_class c where c.oid=to_regclass('public.workspace_onboarding_profiles')`);
  if (table.rowCount !== 1 || !table.rows[0].relrowsecurity || table.rows[0].relkind !== "r" || (table.rows[0].public_access || table.rows[0].policy_access)) throw new OnboardingPersistenceError();
  const access = await client.query(`select rolname from pg_roles where rolname=any($1::text[]) and
    (has_table_privilege(oid,'public.workspace_onboarding_profiles','select,insert,update,delete,truncate,references,trigger') or
    has_any_column_privilege(oid,'public.workspace_onboarding_profiles','select,insert,update,references'))`, [["anon", "authenticated", "service_role"]]);
  if (access.rowCount) throw new OnboardingPersistenceError();
  const attrs = await client.query(`select attname,format_type(atttypid,atttypmod) type,attnotnull,
    exists(select 1 from aclexplode(attacl) a where a.grantee=0) public_access from pg_attribute
    where attrelid='public.workspace_onboarding_profiles'::regclass and attnum>0 and not attisdropped`);
  if (attrs.rowCount !== Object.keys(columns).length || attrs.rows.some(a => a.public_access || !columns[a.attname] || columns[a.attname][0] !== a.type || columns[a.attname][1] !== a.attnotnull)) throw new OnboardingPersistenceError();
  const constraints = await client.query(`select conname,convalidated,pg_get_constraintdef(oid) definition from pg_constraint
    where conrelid='public.workspace_onboarding_profiles'::regclass`);
  if (constraints.rows.some(c => !c.convalidated)) throw new OnboardingPersistenceError();
  const actual = constraints.rows.map(normalizedConstraint).sort((a,b) => a.name.localeCompare(b.name));
  if (JSON.stringify(actual) === JSON.stringify(professionalContract.constraints)) return { professional: true };
  if (JSON.stringify(actual) === JSON.stringify(contract.constraints)) return { professional: false };
  throw new OnboardingPersistenceError();
}
module.exports = { preflight };
