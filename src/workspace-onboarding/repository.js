function scopeKey({ tenant_id, project_id, brand_id }) {
  return [tenant_id, project_id, brand_id].join("\u0000");
}

class InMemoryWorkspaceOnboardingRepository {
  constructor() {
    this.records = new Map();
  }

  async get(scope) {
    const found = this.records.get(scopeKey(scope));
    return found ? structuredClone(found) : null;
  }

  // Compare-and-set on profile_version; a loser receives the current record.
  async commit({ scope, expected_version, record }) {
    const key = scopeKey(scope);
    const current = this.records.get(key);
    const currentVersion = current ? current.profile_version : 0;
    if (currentVersion !== expected_version) {
      return { saved: false, record: current ? structuredClone(current) : null };
    }
    this.records.set(key, structuredClone(record));
    return { saved: true, record: structuredClone(record) };
  }
}

module.exports = { InMemoryWorkspaceOnboardingRepository };
