'use strict';
// BG-COMMERCIAL-LAUNCH Phase 3: the £99 / 60-credit launch plan is representable by the server-owned catalogue configuration and every deviation fails closed.
// The record below is a CANDIDATE FIXTURE (placeholder Stripe test price id, tax and terms wording unresolved): it is NOT an approved catalogue and creates nothing in Stripe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CommercialCatalog } = require('../src/billing/commercialCatalog');

const now = () => new Date('2026-12-01T12:00:00Z');
const policy = { policy_id: 'paid-beta-standard-v1', plan_code: 'standard', policy_version: 1, status: 'active', included_monthly_credits: 60, bolt_on_eligible: false, effective_from: '2026-12-01T00:00:00Z', effective_to: null, execution_costs: { 'text.generate': 1 } };
const plan = { plan_code: 'standard', plan_version: 1, amount_minor: 9900, currency: 'GBP', billing_cadence: 'month', tax: { presentation: 'inclusive', jurisdiction: 'GB', wording: 'CANDIDATE: VAT treatment unresolved' }, credit_grant_cadence: 'month', included_credits: 60, policy_id: policy.policy_id, entitlement_codes: ['standard.access'], effective_from: policy.effective_from, effective_to: null, terms: { version: 'candidate.v0', url: 'https://example.test/terms', cancellation_url: 'https://example.test/cancel', refund_url: 'https://example.test/refund' }, approval: { decision: 'CANDIDATE-NOT-APPROVED', source: 'https://github.com/shirrie01/bizgenie-api/issues/191', approved_at: policy.effective_from }, stripe: { mode: 'test', price_id: 'price_TESTPLACEHOLDER' } };
const make = (p = plan, pol = policy, mode = 'test') => new CommercialCatalog({ plans: [p], policies: [pol], mode, now });

test('the launch plan (GBP 99.00 per month, 60 credits per month) is representable and read back unchanged without Stripe identifiers', () => {
  const out = make().read(); assert.equal(out.plans.length, 1); const p = out.plans[0];
  assert.equal(p.amount_minor, 9900); assert.equal(p.currency, 'GBP'); assert.equal(p.billing_cadence, 'month'); assert.equal(p.included_credits, 60); assert.equal(p.credit_grant_cadence, 'month'); assert.equal(p.stripe, undefined);
  assert.deepEqual(make().stripeMapping('standard'), { priceId: 'price_TESTPLACEHOLDER', policyId: 'paid-beta-standard-v1', planVersion: 1 });
});
test('every deviation from the approved mapping fails closed: credits, policy, mode, price id reuse, currency, window, status', () => {
  for (const [name, mk] of Object.entries({
    credits59: () => make({ ...plan, included_credits: 59 }), credits61: () => make({ ...plan, included_credits: 61 }), policyCredits: () => make(plan, { ...policy, included_monthly_credits: 61 }), policyInactive: () => make(plan, { ...policy, status: 'draft' }),
    wrongPlan: () => make({ ...plan, plan_code: 'pro' }), liveKeyInTestCatalogue: () => make({ ...plan, stripe: { mode: 'live', price_id: 'price_X' } }), liveCatalogueWithTestPrice: () => make(plan, policy, 'live'), lowercaseCurrency: () => make({ ...plan, currency: 'gbp' }), negative: () => make({ ...plan, amount_minor: -1 }),
    badPriceId: () => make({ ...plan, stripe: { mode: 'test', price_id: 'not_a_price' } }), noApproval: () => make({ ...plan, approval: undefined }), noTerms: () => make({ ...plan, terms: undefined }), unknownField: () => make({ ...plan, trial_days: 7 }), httpTerms: () => make({ ...plan, terms: { ...plan.terms, url: 'http://example.test/t' } }),
  })) assert.throws(mk, undefined, name);
  assert.throws(() => new CommercialCatalog({ plans: [plan, { ...plan, plan_code: 'pro', policy_id: 'p2' }], policies: [policy], mode: 'test', now }));
  assert.throws(() => make({ ...plan, effective_from: '2027-01-01T00:00:00Z' }).read()); // not yet effective: nothing is offered
  assert.throws(() => make({ ...plan, effective_to: '2026-11-30T00:00:00Z' }).read());
  assert.throws(() => new CommercialCatalog({ plans: [], policies: [], mode: 'test', now }));
});
test('no price, plan or allowance is hard-coded in source: the catalogue is server-owned injection only', () => {
  const dir = path.join(__dirname, '..', 'src', 'billing'); const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) && files.push(path.join(d, e.name)); })(dir);
  for (const f of files) { const s = fs.readFileSync(f, 'utf8'); assert.doesNotMatch(s, /amount_minor\s*:\s*9900|price_[A-Za-z0-9]{8,}/, f); }
});
