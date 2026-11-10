# Engagement Intelligence MVP — implementation contract (W04A)

Status: DRAFT, founder-directed; **not** merged, deployed or product-proven.
Authority: #191 master register, #128 launch acceptance, #196 Learning Brain, #203 implementation, #202 Product Lab.
Base API SHA: ddcc26cb4111303f0c8fbf9745db5fed1e40ca6f.

## Purpose
BizGenie optimises meaningful business outcomes, not post count. The initial deterministic engine must return one of CONTINUE, EXPERIMENT, REDUCE_FREQUENCY, PAUSE, INSUFFICIENT_DATA with explicit evidence and customer review. It must never auto-post or auto-pause from a recommendation.

## Evidence model
Every input must be scoped to tenant, brand, campaign, approved revision, platform, destination and objective. Preserve source kind: SIMULATED, CUSTOMER_ATTESTED or PLATFORM_VERIFIED. Store observed-at and collected-at timestamps, creative family, hook, format, CTA, reach/impressions when available, interactions by kind, outbound clicks, qualified actions, conversions, spend and post URL/provider receipt when available. Missing is UNKNOWN, not zero. Do not infer sales from likes.

## Policy acceptance
1. Insufficient sample or absent trustworthy denominator -> INSUFFICIENT_DATA, not a confident winner/loser.
2. Seven repetitive low-value posts -> do not prescribe seven more; prefer a controlled concept/offer experiment when evidence allows.
3. Engagement without attributable business outcomes -> report engagement only, not sales or ROI.
4. Strong qualified action with adequate coverage -> propose a measured follow-up test, not automatic scaling.
5. Declining comparable qualified-action rates and repeated creative families -> possible fatigue, with uncertainty and alternate causes.
6. No cross-platform raw engagement aggregation without metric definitions and normalization; separate organic and paid.
7. Respect opt-in, rights, safeguarding, tenant/brand boundaries and source provenance.
8. Customer may review/override any cadence recommendation; no autonomous posting, pause or platform account mutation.

## API output proposal
```json
{
  "decision": "INSUFFICIENT_DATA",
  "objective": "qualified_retailer_enquiries",
  "reason_codes": ["MISSING_EXPOSURE", "LOW_SAMPLE"],
  "evidence_ids": [],
  "coverage": {"status": "incomplete"},
  "recommended_test": "Test one distinct retailer-demonstration hook",
  "requires_customer_review": true
}
```
Values above are illustrative only. The implementation must reuse canonical campaign IDs and schema; do not create a competing campaign authority.

## Product Lab
Fonzo launch first, Fairway B2B alongside; Bubblo prelaunch interest 4–6 weeks later using opt-in flavour interest and waitlist; WOW Charity only with permission. Start with two scenarios x two text drafts x four brands (16 drafts maximum). Synthetic evaluations must never be represented as real performance. Text-first, no provider spend without founder-approved cap.

## Engineering start sequence
A. Inspect `src/campaigns/goalRecommendation.js`, measurement persistence and campaign schedule schema; record exact paths and test fixtures.
B. Implement pure decision policy behind disabled feature flag, independent of live OAuth; tests for low sample, zero exposure, missingness, high vanity metrics, good qualified outcomes, tenant separation, creative repetition and conflicting evidence.
C. Wire policy to existing scoped measurement/learning flow; no migrations without approval.
D. Add customer-facing evidence/rationale panel, manual override and founder Product Lab proofs.
E. Review, CI, PR, founder acceptance and register update.

## Non-authorisations
This contract authorises no deployment, production traffic change, paid media generation, third-party account activation, schema migration or automatic posting.
