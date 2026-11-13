// Operator policy only. No provider prices, FX rate lookup or default fee assumptions.
const ref = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const amount = value => Number.isSafeInteger(value) && value >= 0;
const positive = value => amount(value) && value > 0;
function requiredExposure(estimate, now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const a = estimate?.authority;
  if (!a || !['GBP','USD'].includes(a.native_currency) || !positive(a.native_bound_minor) ||
      !amount(a.fees_gbp_minor) || estimate.currency !== 'GBP') return null;
  let numerator = 1n, denominator = 1n;
  if (a.native_currency === 'GBP') {
    // GBP pence -> GBP pence is identity, explicitly no currency conversion.
    if (a.fx !== null) return null;
  } else {
    const fx = a.fx;
    if (!fx || fx.from !== 'USD' || fx.to !== 'GBP' || !positive(fx.numerator) || !positive(fx.denominator) ||
        !ref(fx.source_ref) || !ref(fx.version) || !Number.isFinite(Date.parse(fx.valid_until)) ||
        Date.parse(fx.valid_until) <= now.getTime()) return null;
    numerator = BigInt(fx.numerator); denominator = BigInt(fx.denominator);
  }
  const native = BigInt(a.native_bound_minor) * numerator;
  return (native + denominator - 1n) / denominator + BigInt(a.fees_gbp_minor);
}
function approvedEstimate(estimate, now) {
  const required = requiredExposure(estimate, now);
  return required !== null && positive(estimate.upper_bound_minor) && required <= BigInt(estimate.upper_bound_minor);
}
module.exports = { requiredExposure, approvedEstimate };
