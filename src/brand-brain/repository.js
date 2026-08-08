const { BrandBrainOwnershipError } = require("./errors");

class BrandBrainRepository {
  getByBrandId(_brandId) {
    throw new Error("BrandBrainRepository.getByBrandId is not implemented");
  }

  getByProjectAndBrand(_projectId, _brandId) {
    throw new Error(
      "BrandBrainRepository.getByProjectAndBrand is not implemented"
    );
  }

  upsert(_record) {
    throw new Error("BrandBrainRepository.upsert is not implemented");
  }
}

class InMemoryBrandBrainRepository extends BrandBrainRepository {
  constructor() {
    super();
    this.records = new Map();
  }

  getByBrandId(brandId) {
    const record = this.records.get(brandId);
    return record ? structuredClone(record) : null;
  }

  getByProjectAndBrand(projectId, brandId) {
    const record = this.records.get(brandId);
    if (!record || record.project_id !== projectId) {
      return null;
    }
    return structuredClone(record);
  }

  upsert(record) {
    const existing = this.records.get(record.brand_id);
    if (existing && existing.project_id !== record.project_id) {
      throw new BrandBrainOwnershipError(record.brand_id);
    }

    const stored = structuredClone(record);
    this.records.set(stored.brand_id, stored);
    return structuredClone(stored);
  }
}

module.exports = {
  BrandBrainRepository,
  InMemoryBrandBrainRepository,
};
