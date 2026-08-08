function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class FakeBrandBrainPool {
  constructor({ records = new Map(), failure = null } = {}) {
    this.records = records;
    this.failure = failure;
    this.queries = [];
    this.ended = false;
  }

  async query(text, values = []) {
    this.queries.push({ text, values: clone(values) });
    if (this.failure) {
      throw this.failure;
    }
    if (text.includes("LIMIT 0")) {
      return { rowCount: 0, rows: [] };
    }

    if (text.includes("INSERT INTO public.brand_brains")) {
      const [
        brand_id,
        project_id,
        name,
        identity,
        voice,
        audience,
        commercial,
        competitors,
        visual,
        version,
        status,
        created_at,
        updated_at,
      ] = values;
      const existing = this.records.get(brand_id);
      if (existing && existing.project_id !== project_id) {
        return { rowCount: 0, rows: [] };
      }
      const row = {
        brand_id,
        project_id,
        name,
        identity,
        voice,
        audience,
        commercial,
        competitors,
        visual,
        version,
        status,
        created_at: existing?.created_at ?? created_at,
        updated_at,
      };
      this.records.set(brand_id, clone(row));
      return { rowCount: 1, rows: [clone(row)] };
    }

    const projectScoped = text.includes("WHERE project_id = $1");
    const brandId = projectScoped ? values[1] : values[0];
    const row = this.records.get(brandId);
    if (!row || (projectScoped && row.project_id !== values[0])) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 1, rows: [clone(row)] };
  }

  async end() {
    this.ended = true;
  }
}

module.exports = { FakeBrandBrainPool };
