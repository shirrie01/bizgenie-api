const { approvedEstimate } = require('./estimateAuthority');
// Internal, operator-configured boundary. Not wired to any live provider or worker.
const { randomUUID, createHash } = require('node:crypto');
class SpendError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const deny = code => { throw new SpendError(code); };
const text = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k,normalize(value[k])])) : value;
const policyHash = p => createHash('sha256').update(JSON.stringify(normalize({version:p.version,source_ref:p.source_ref,
  currency:p.currency,cap_minor:p.cap_minor,customer_limit:p.customer_limit,valid_from:p.valid_from.toISOString(),
  valid_until:p.valid_until.toISOString(),estimates:p.estimates}))).digest('hex');
class MonthlyProviderSpend {
  constructor({ pool, enabled = false } = {}) {
    this.pool = pool;
    // Explicit boolean only: environment strings must be parsed by a reviewed operator composition.
    this.enabled = enabled === true;
  }
  async transaction(fn) {
    if (!this.enabled || !this.pool) deny('PROVIDER_SPEND_DISABLED');
    let client;
    try {
      client = await this.pool.connect();
      await client.query('begin');
      await client.query("set local lock_timeout='1000ms'");
      await client.query("set local statement_timeout='3000ms'");
      await client.query("select pg_advisory_xact_lock(hashtextextended('provider-spend.aggregate-month.v1',0))");
      const schema = await client.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
        has_table_privilege(current_user,c.oid,'SELECT') as can_read,
        has_table_privilege(current_user,c.oid,'DELETE') as can_delete,
        has_table_privilege(current_user,c.oid,'INSERT') or has_table_privilege(current_user,c.oid,'UPDATE') as can_write
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
        and c.relname=any($1::text[])`, [['provider_spend_policy','provider_spend_customers','provider_spend_reservations']]);
      if (schema.rows.length !== 3 || schema.rows.some(r => !r.relrowsecurity || !r.relforcerowsecurity || !r.can_read || r.can_delete || (r.relname !== 'provider_spend_reservations' && r.can_write) || (r.relname === 'provider_spend_reservations' && !r.can_write))) deny('PROVIDER_SPEND_SCHEMA_UNSAFE');
      const value = await fn(client);
      await client.query('commit');
      return value;
    } catch (error) {
      try { await client?.query('rollback'); } catch {}
      if (error instanceof SpendError) throw error;
      // No database detail, credentials or connection strings escape.
      throw new SpendError('PROVIDER_SPEND_UNAVAILABLE');
    } finally { client?.release(); }
  }
  async policy(client) {
    const result = await client.query(`select *,clock_timestamp() as db_now,
      to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-01') as month
      from public.provider_spend_policy where singleton=true`);
    const p = result.rows[0];
    if (!p || !p.enabled || p.currency !== 'GBP' || p.cap_minor !== 10000 || p.customer_limit !== 10 ||
      !text(p.version) || !text(p.source_ref) || !(p.valid_from <= p.db_now && p.valid_until > p.db_now) ||
      p.valid_until - p.valid_from > 32 * 86400000 || !p.estimates || typeof p.estimates !== 'object') deny('PROVIDER_SPEND_POLICY_UNAVAILABLE');
    if ((await client.query("select 1 from public.provider_spend_reservations where state='breach' limit 1")).rowCount) deny('PROVIDER_SPEND_BREACH');
    if ((await client.query('select 1 from public.provider_spend_reservations where month>$1 limit 1',[p.month])).rowCount) deny('PROVIDER_SPEND_CLOCK_UNSAFE');
    return p;
  }
  async reserve({ id, tenantId, operation, estimateVersion, currency = 'GBP' } = {}) {
    if (![id,tenantId,operation,estimateVersion].every(text) || currency !== 'GBP') deny('PROVIDER_SPEND_INVALID_REQUEST');
    return this.transaction(async client => {
      const p = await this.policy(client);
      const cohort = await client.query(`select tenant_id from public.provider_spend_customers where active=true`);
      if (cohort.rows.length > 10 || !cohort.rows.some(r => r.tenant_id === tenantId)) deny('PROVIDER_SPEND_CUSTOMER_HOLD');
      const prior = (await client.query('select * from public.provider_spend_reservations where id=$1 for update',[id])).rows[0];
      if (prior) {
        if (prior.tenant_id !== tenantId || prior.operation !== operation || prior.estimate_version !== estimateVersion || prior.currency !== currency) deny('PROVIDER_SPEND_IDEMPOTENCY_CONFLICT');
        return { id, state: prior.state, month: prior.month, reservedMinor: prior.bound_minor, replay: true };
      }
      const estimate = p.estimates[operation];
      if (!estimate || !approvedEstimate(estimate,p.db_now) || estimate.version !== estimateVersion || !text(estimate.source_ref) || estimate.currency !== 'GBP' ||
        !integer(estimate.upper_bound_minor) || estimate.upper_bound_minor < 1 || estimate.upper_bound_minor > 10000 ||
        !Number.isFinite(Date.parse(estimate.valid_until)) || Date.parse(estimate.valid_until) <= p.db_now.getTime()) deny('PROVIDER_SPEND_ESTIMATE_UNAVAILABLE');
      const sum = (await client.query(`select coalesce(sum(bound_minor),0)::text as exposure
        from public.provider_spend_reservations where state<>'cancelled' and (month=$1 or (month<$1 and (state in ('dispatching','uncertain','breach') or settled_month=$1)))`,[p.month])).rows[0];
      if (BigInt(sum.exposure) + BigInt(estimate.upper_bound_minor) > 10000n) deny('PROVIDER_SPEND_CAP_EXHAUSTED');
      await client.query(`insert into public.provider_spend_reservations
        (id,tenant_id,operation,estimate_version,currency,policy_version,month,bound_minor,state,policy_hash)
        values($1,$2,$3,$4,'GBP',$5,$6,$7,'reserved',$8)`,[id,tenantId,operation,estimateVersion,p.version,p.month,estimate.upper_bound_minor,policyHash(p)]);
      return { id, state: 'reserved', month: p.month, reservedMinor: estimate.upper_bound_minor, replay: false };
    });
  }
  async start({ id, tenantId } = {}) {
    if (![id,tenantId].every(text)) deny('PROVIDER_SPEND_INVALID_REQUEST');
    return this.transaction(async client => {
      const p = await this.policy(client);
      const row = (await client.query('select * from public.provider_spend_reservations where id=$1 and tenant_id=$2 for update',[id,tenantId])).rows[0];
      if (!row || row.state !== 'reserved') deny('PROVIDER_SPEND_DISPATCH_HELD');
      // Recheck current operator cohort and pricing, including at a month rollover.
      const member = await client.query('select 1 from public.provider_spend_customers where tenant_id=$1 and active=true',[tenantId]);
      const estimate = p.estimates[row.operation];
      if (!member.rowCount || row.month !== p.month || row.policy_version !== p.version || row.policy_hash !== policyHash(p) || !estimate || !approvedEstimate(estimate,p.db_now) || estimate.version !== row.estimate_version || estimate.currency !== 'GBP' || estimate.upper_bound_minor !== row.bound_minor || !text(estimate.source_ref) || !(Date.parse(estimate.valid_until) > p.db_now.getTime())) deny('PROVIDER_SPEND_DISPATCH_HELD');
      const token = randomUUID();
      await client.query("update public.provider_spend_reservations set state='dispatching',dispatch_token=$2,updated_at=clock_timestamp() where id=$1",[id,token]);
      return { id, token };
    });
  }
  async cancel({ id, tenantId } = {}) {
    if (![id,tenantId].every(text)) deny('PROVIDER_SPEND_INVALID_REQUEST');
    return this.transaction(async client => {
      const row = (await client.query('select * from public.provider_spend_reservations where id=$1 and tenant_id=$2 for update',[id,tenantId])).rows[0];
      if (!row || !['reserved','cancelled'].includes(row.state)) deny('PROVIDER_SPEND_DISPATCH_HELD');
      await client.query("update public.provider_spend_reservations set state='cancelled',updated_at=clock_timestamp() where id=$1",[id]);
      return { id, state:'cancelled' };
    });
  }
  async settle({ id, tenantId, token, actualMinor = null, outcome = 'uncertain', evidenceRef = null, currency = 'GBP' } = {}) {
    if (currency !== 'GBP' || ![id,tenantId].every(text) || typeof token !== 'string' || !['uncertain','settled'].includes(outcome) || (actualMinor !== null && !integer(actualMinor)) || (outcome === 'settled' && (actualMinor === null || !text(evidenceRef))) || (outcome === 'uncertain' && (actualMinor !== null || evidenceRef !== null))) deny('PROVIDER_SPEND_INVALID_REQUEST');
    const result = await this.transaction(async client => {
      // Old-month settlement does not depend on new policy availability, and never frees exposure.
      const row = (await client.query('select * from public.provider_spend_reservations where id=$1 and tenant_id=$2 for update',[id,tenantId])).rows[0];
      if (!row || row.dispatch_token !== token || !['dispatching','uncertain','settled','breach'].includes(row.state)) deny('PROVIDER_SPEND_DISPATCH_HELD');
      if (row.state === 'breach') return { id, state:'breach', replay:true };
      if (actualMinor > row.bound_minor) {
        await client.query("update public.provider_spend_reservations set state='breach',actual_minor=$2,evidence_ref=$3,updated_at=clock_timestamp() where id=$1",[id,actualMinor,evidenceRef]);
        return { id, state:'breach', replay:false };
      }
      if (row.state === 'settled') {
        if (outcome !== 'settled' || Number(row.actual_minor) !== actualMinor || row.evidence_ref !== evidenceRef) deny('PROVIDER_SPEND_IDEMPOTENCY_CONFLICT');
        return { id, state:'settled', replay:true };
      }
      const state = row.state === 'breach' || actualMinor > row.bound_minor ? 'breach' : outcome;
      await client.query(`update public.provider_spend_reservations set state=$2,actual_minor=$3,evidence_ref=$4,settled_month=case when $2='settled' then to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-01') else settled_month end,updated_at=clock_timestamp() where id=$1`,[id,state,actualMinor,evidenceRef]);
      return { id, state, replay:false };
    });
    if (result.state === 'breach') deny('PROVIDER_SPEND_BREACH');
    return result;
  }
  async executePaid(input, dispatch) {
    if (typeof dispatch !== 'function') deny('PROVIDER_SPEND_INVALID_REQUEST');
    await this.reserve(input);
    const permit = await this.start(input);
    try {
      const result = await dispatch();
      // A successful HTTP response is not an authoritative final bill: retain the entire bound.
      await this.settle({ ...permit, tenantId:input.tenantId, outcome:'uncertain' });
      return result;
    } catch (error) {
      try { await this.settle({ ...permit, tenantId:input.tenantId, outcome:'uncertain' }); } catch {}
      throw error;
    }
  }
}
module.exports = { MonthlyProviderSpend, SpendError };
