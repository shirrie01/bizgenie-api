const {
  DuplicateIdError,
  ReviewNotFoundError,
} = require("./errors");

class MissionControlRepository {
  createReview(_review) {
    throw new Error("MissionControlRepository.createReview is not implemented");
  }

  getReview(_reviewId) {
    throw new Error("MissionControlRepository.getReview is not implemented");
  }

  addFinding(_finding) {
    throw new Error("MissionControlRepository.addFinding is not implemented");
  }

  listFindings(_reviewId) {
    throw new Error("MissionControlRepository.listFindings is not implemented");
  }

  saveEvidencePack(_evidencePack) {
    throw new Error(
      "MissionControlRepository.saveEvidencePack is not implemented"
    );
  }

  getEvidencePack(_evidencePackId) {
    throw new Error(
      "MissionControlRepository.getEvidencePack is not implemented"
    );
  }
}

class InMemoryMissionControlRepository extends MissionControlRepository {
  constructor() {
    super();
    this.reviews = new Map();
    this.findings = new Map();
    this.evidencePacks = new Map();
  }

  createReview(review) {
    if (this.reviews.has(review.review_id)) {
      throw new DuplicateIdError("Review", review.review_id);
    }

    const storedReview = structuredClone(review);
    this.reviews.set(storedReview.review_id, storedReview);
    this.findings.set(storedReview.review_id, []);
    return structuredClone(storedReview);
  }

  getReview(reviewId) {
    const review = this.reviews.get(reviewId);
    return review ? structuredClone(review) : null;
  }

  addFinding(finding) {
    if (!this.reviews.has(finding.review_id)) {
      throw new ReviewNotFoundError(finding.review_id);
    }

    const findings = this.findings.get(finding.review_id);
    if (findings.some((item) => item.finding_id === finding.finding_id)) {
      throw new DuplicateIdError("Finding", finding.finding_id);
    }

    const storedFinding = structuredClone(finding);
    findings.push(storedFinding);
    return structuredClone(storedFinding);
  }

  listFindings(reviewId) {
    if (!this.reviews.has(reviewId)) {
      throw new ReviewNotFoundError(reviewId);
    }

    return structuredClone(this.findings.get(reviewId));
  }

  saveEvidencePack(evidencePack) {
    if (this.evidencePacks.has(evidencePack.evidence_pack_id)) {
      throw new DuplicateIdError(
        "EvidencePack",
        evidencePack.evidence_pack_id
      );
    }

    const storedEvidencePack = structuredClone(evidencePack);
    this.evidencePacks.set(
      storedEvidencePack.evidence_pack_id,
      storedEvidencePack
    );
    return structuredClone(storedEvidencePack);
  }

  getEvidencePack(evidencePackId) {
    const evidencePack = this.evidencePacks.get(evidencePackId);
    return evidencePack ? structuredClone(evidencePack) : null;
  }
}

module.exports = {
  InMemoryMissionControlRepository,
  MissionControlRepository,
};
