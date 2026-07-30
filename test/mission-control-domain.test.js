const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  EvidencePackSchema,
  FindingSchema,
  InMemoryMissionControlRepository,
  ReviewSchema,
} = require("../src/mission-control");

const createdAt = "2026-07-29T22:30:48.000Z";

describe("Mission Control schemas", () => {
  it("validates the required Review contract", () => {
    const review = {
      review_id: "review_001",
      review_type: "monthly",
      status: "ready",
      created_at: createdAt,
      evidence_pack_id: "evidence_pack_001",
    };

    assert.deepEqual(ReviewSchema.parse(review), review);
    assert.equal(
      ReviewSchema.safeParse({ ...review, review_type: "annual" }).success,
      false
    );
  });

  it("validates the required EvidencePack contract", () => {
    const evidencePack = {
      evidence_pack_id: "evidence_pack_001",
      created_at: createdAt,
      source_refs: ["github:commit:aefcb18", "github:issue:1"],
      snapshot_version: "v1",
      checksum: "sha256:example",
    };

    assert.deepEqual(EvidencePackSchema.parse(evidencePack), evidencePack);
    assert.equal(
      EvidencePackSchema.safeParse({
        ...evidencePack,
        source_refs: "github:issue:1",
      }).success,
      false
    );
  });

  it("requires the v1 Finding identity and decision-input fields", () => {
    const finding = {
      finding_id: "finding_001",
      review_id: "review_001",
      created_at: createdAt,
      reviewer_role: "Competitive strategist",
      provider: "test-provider",
      title: "A test finding",
      description: "The complete finding description.",
      severity: "medium",
      confidence: 0.75,
      status: "open",
    };

    assert.deepEqual(FindingSchema.parse(finding), finding);
    const { provider, ...withoutProvider } = finding;
    assert.equal(FindingSchema.safeParse(withoutProvider).success, false);
    assert.equal(provider, "test-provider");
  });
});

describe("InMemoryMissionControlRepository", () => {
  it("stores defensive copies behind the repository interface", () => {
    const repository = new InMemoryMissionControlRepository();
    const review = {
      review_id: "review_001",
      review_type: "event",
      status: "draft",
      created_at: createdAt,
      evidence_pack_id: "evidence_pack_001",
    };

    repository.createReview(review);
    review.status = "failed";

    const stored = repository.getReview("review_001");
    assert.equal(stored.status, "draft");
    stored.status = "completed";
    assert.equal(repository.getReview("review_001").status, "draft");
  });
});
