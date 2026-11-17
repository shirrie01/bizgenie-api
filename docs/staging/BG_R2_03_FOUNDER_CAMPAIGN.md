# BG-R2-03 — one founder campaign root, source/test only

17 November2026. Parent API main c023184c16ef11d5feb78792349e51b0f52b45a3. Step7 ACCEPTED and all R1 artifacts/private manifests remain unchanged. Authorisations API257 comment6963481493 and Claude review6963455332 were supplied by founder; direct GitHub reads returned Forbidden, so no own read/verification is claimed. Independent Claude review is required before release.

## Contract and bounded admission

Existing exact POST /customer/campaigns and its seven-field body are unchanged: tenant_id, project_id, brand_id, name, goal, display_timezone, idempotency_key. Fixed key is `bg-r2-founder-campaign-v1`, independent of recommendation ID and never rotated after retries/timeouts. Pin the hash of ALL SEVEN exact fields, using existing campaigns/schema canonical sorted-key JSON and UTF-8 SHA256. Whitespace/Unicode text is not silently normalised; invalid/unpaired Unicode and scope normalisation ambiguities are rejected. Extra fields or a different key cannot pass. A recommendation_id is not added to the strict API request.

Default-OFF BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT requires existing approved private founder ID and explicit binding BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID/PROJECT_ID/BRAND_ID/BODY_SHA256. Strict true/false. Missing/malformed binding or coexistence with broad writes/bootstrap/draft/generation/social/Stripe OR founderVideo fails startup. No provider permission is inherited. Existing founder onboarding and Step7 recommendation flags may remain independently enabled for the same approved founder.

The exact route only defers the general gate. Verified customer identity, per-user rate accounting, valid trusted scope and equality of body/trusted/bound tenant/project/brand are required before permission and IAM/upstream access. Only the approved founder's exact pinned seven-field intent is forwarded. It cannot use another key, recommendation, body or tenant to create another root. Existing16KiB JSON/CORS/time/concurrency/private-header controls stay intact. Every other campaign/content-item write remains blocked.

Underlying API owner/project/approved-brand and transactional authorisation checks, PostgreSQL advisory lock and campaign_command_receipts remain unchanged. Their fixed actor/tenant/project/key namespace gives exactly one root for this pinned acceptance binding, including concurrent requests and lost commit responses. Different intent with same key conflicts. This is NOT a lifetime cap after future operator reconfiguration/receipt deletion; changing binding or key policy requires separate approval. No new database schema, migration, SQL function or billing logic is added.

## Offline private body hashing and separate profile

Operator derives seven-field body from the ACCEPTED recommendation's create_campaign_payload and verified founder session scope, adds the fixed key and saves it privately outside git. Do not use an arbitrary/new recommendation or print its content. Run existing-source helper `node scripts/staging/hash-founder-campaign-body.js <private-body-file>` locally/offline: output is body_sha256 only; failures generic. The helper validates shape/key, not provenance of the accepted recommendation; independent review must tie input to the actual accepted Step7 record. No real UUID/scope/hash/keys are committed in fixtures.

Separate validate-founder-campaign-release.js delegates unchanged Step7/R1 profiles and requires founderCampaignApproval, campaignAcceptanceBindingEvidence and campaignRepositoryAcceptanceEvidence plus their original image/rollback/upstream/identity references. New example defaults OFF with unresolved approval placeholders. Original validators/private locked manifests are not edited. No real R2 manifest is populated/validated here. Real source merge, build/digest readback, configured binding and deployment remain separately approved gates; current image/Step7 acceptance does not prove new R2 code deployed.

## WEB dependent branch (R2 only, not GJ WEB leg)

WEB bg-r2-03-root-campaign uses VITE_FOUNDER_CAMPAIGN_ROOT_API + exact-serving-revision founderCampaignRoot capability evidence; unlisted/absent defaults OFF. No capability/workflow setting is enabled. In this narrow mode, existing Create campaign posts the root only, with fixed key, then truthfully says suggested content was not added; normal flow remains unchanged. No content-item POST or generation call. An ambiguous response performs only scoped GET campaign discovery; a similar-looking listed campaign is NEVER accepted as proof of this command. UI retains unconfirmed intent; explicit retry replays exact same body/key and relies on authoritative API receipt result. Changed unconfirmed intent fails closed. Late results cannot apply after workspace scope changes. No automatic POST retry or key rotation.

## Review and verification

API focused bridge/profile/Step7/onboarding/campaign regressions and full suite are recorded in checkpoint. Real existing disposable PostgreSQL campaign suite includes one added fixed-key regression: committed response lost, five concurrent cross-instance retries, one receipt/root, no items and changed-intent conflict. All SQL is existing disposable test-fixture setup; no shared DB, migration application or manual connected SQL. Synthetic tests cover non-founder/mismatched/absent scope, altered key/payload, wrong route, cap/rate/config conflicts and helper redaction.

This API PR is separate from BG-GJ-02. Companion WEB commit is supplied as an independent branch/compare; no third PR automatically created under the request for two API draft PRs. Do not merge/release until Claude review and hosted exact-head checks. Public launch NO-GO.

Local verification: API focused39/39 PASS; full1139 PASS,1 SKIP,0 FAIL. Existing disposable PostgreSQL campaign suite31/31 PASS, including new fixed-key lost-commit/concurrent replay test. WEB focused57/57 PASS; full1595 PASS,52 SKIP,0 FAIL; production build PASS. Hosted results are not inferred; see handoff for exact pushed commits and permission blockers. No paid/live/customer calls.
