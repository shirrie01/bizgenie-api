const { isDeepStrictEqual } = require('node:util');
const { BrandBrainError, BrandBrainOwnershipError } = require('./errors');
function denied() { return new BrandBrainError(403, 'BRAND_BRAIN_WRITE_FORBIDDEN', 'Current workspace-owner authority is required for business identity changes'); }
function checkWrite({ current, expected, record, role }) {
  if (expected && expected.project_id !== record.project_id) throw new BrandBrainOwnershipError(record.brand_id);
  if (!current) throw denied(); // Admin-key-only identity creation is prohibited.
  if (!isDeepStrictEqual(current, expected)) throw new BrandBrainError(409, 'BRAND_BRAIN_VERSION_CONFLICT', 'Brand Brain changed; reload before saving');
  if (role !== 'owner' && (record.name !== current.name || record.identity?.description !== current.identity?.description)) throw denied();
}
module.exports = { checkWrite, denied };
