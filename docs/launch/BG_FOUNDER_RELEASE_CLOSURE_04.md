# Founder release closure 04 — isolated integration candidate

Status: SOURCE CANDIDATE, NOT A DEPLOYMENT APPROVAL. Public launch NO-GO.

## Source and integration

API base `20951d143bcbcb140bb160f5b81f4e86f329345b`; integrate, in order, #264 `90ca1b29bcc269c0792a11a59455d475913c2bcf`, #265 `569060dfa8d5fdb1b69816eb07a2c8d57838c730`, #266 `2aa522ba84dc0927062297251f50e521577c54ec`. WEB base `50666b81d148828c754537ce8f5cf20c7b25dec9`; integrate #92 `700c4f129a53b1407c0aa39d59a97bd25b1b6d4e`, then #93 `898d36f221ed551153603551e2272f8aba1972d9`. Normal merges on isolated branches preserve ancestry. No main merge or staging change.

The founder supplied exact-head hosted CI PASS for those five parent candidates. This does not prove CI on the new integration heads. Record new push SHAs and workflow conclusions separately.

## Narrow bridge delta

All three added settings default OFF, accept only explicit boolean text in the entrypoint, and need a separately approved serving configuration:

| Setting | Exact admission | Required binding |
|---|---|---|
| BG_BRIDGE_ALLOW_FOUNDER_COPY_EDITING | POST /customer/campaigns/:campaign/variants/:variant/revisions | existing founder draft scope, exact campaign; backend revision/CAS, owner authorisation, immutable media and idempotency unchanged |
| BG_BRIDGE_ALLOW_FOUNDER_SOCIAL_CONNECTIONS | POST /customer/social/oauth-intents, /customer/social/oauth-complete, /customer/social/connections/:connection/refresh or /disconnect | existing founder draft identity and trusted tenant/project/brand, matching body; backend account ownership and token vault |
| BG_BRIDGE_ALLOW_FOUNDER_VIDEO_ATTACHMENT | POST /customer/creative-jobs/quoted:quote/attach (colon or encoded colon) | exact existing founder-video identity/scope; strict three-field scope body; backend rechecks job/quote campaign/variant binding inside command transaction |

All new write admissions have the existing 16 KiB body cap and verified customer authentication, per-user rate accounting and scope checks before IAM/upstream. Queries, suffixes, alternative methods and unrelated writes are denied. OPTIONS does not authorise a write. The existing eight draft routes, onboarding and recommendation permissions retain their original conditions. GET/HEAD media and plan retrieval remain backend-authorised; no new public media URL.

Do not enable BG_BRIDGE_ALLOW_WRITES, BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP, BG_BRIDGE_ALLOW_DRAFT_WORKFLOW, BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION, BG_BRIDGE_ALLOW_SOCIAL_WRITES or BG_BRIDGE_ALLOW_STRIPE_CHECKOUT. Paid provider dispatch and social publication are never implied by connection or attachment admission.

OAuth: the WEB registered callback receives the provider code and performs authenticated oauth-complete with existing state/PKCE. Anonymous API callback relay remains outside the bridge. Portal redirect registration, scopes, refresh availability, vault configuration and real callback delivery require separate operator evidence/approval; a mock OAuth exchange is not live connectivity.

Separate offline envelope validator: `node scripts/staging/validate-founder-release04.js PRIVATE_ENVELOPE.json`. It clones and delegates to the unchanged prior validator, strips only the three new settings for that delegation, then validates the actual bridge target. `draft_connections` requires existing founder-draft campaign pins and explicit copy/social admission. `video` requires existing one-job pricing, runtime, entitlement and rollback evidence; copy/social remain OFF. A syntactically accepted evidence reference is not independently verified authority. Never invent evidence to obtain a validator PASS. Existing private manifests remain unchanged.

## Fonzo acceptance, in order

Every stage below needs recorded real browser evidence after a separately approved deployment. Automated doubles are not hosted acceptance.

1. Sign in with existing founder account; discover the same workspace, never create a duplicate.
2. Load Fonzo Brand Brain and factual wholesale acquisition goal; save and reload only under approved founder onboarding scope.
3. Receive rights-approved genuine artwork for Classic Cola, Lemon & Lime, Mango, Orange Crush and Blue Raspberry plus original transparent logo. State today: AWAITING APPROVED UPLOAD. Use existing customer media intake/rights validation through an approved scope; no invented package art or hosted-asset claim. The new flags do not admit asset upload writes.
4. Create one campaign using existing seven-field hash pin and fixed idempotency contract. Lost response: GET/replay same key, never a new campaign key.
5. GET /customer/campaigns/:campaign/content-plan; inspect seven factual posts, five image slots and three video slots. No price, generation or publication implied by a plan.
6. Add content drafts once; retry same key. Reload and compare campaign/version/revisions. The synthetic PostgreSQL Fonzo fixture exercises this boundary and synthetic media, not real brand quality.
7. Obtain a current binding-specific quote and explicit consent. Image execution and multiple-video scope require their own authorised budget/route profile; the one-video profile is not a blanket campaign provider permission.
8. Attach successful media to original campaign variant/revision; GET authenticated preview. Verify correct bytes, ownership, type, playback and durable state; no public URLs inferred.
9. Save bounded copy correction: new revision, old history preserved, active approval revoked and schedule cancelled. Stale base conflicts without side effects. Re-review/preview acknowledge before approval.
10. Schedule approved variants, reload calendar, sign out/in and verify persistence. Scheduling is not publication.
11. Connect/reconnect/renew the approved social account under founder-only lifecycle scope. Do not dispatch or publish. LinkedIn refresh is unavailable unless genuinely supported; present reconnection truthfully.
12. Manual publishing and measurements are readiness checks only. Their write routes are not newly admitted. Do not fabricate published state, performance or measurable acquisition results.

## Private Fonzo binding prerequisite

The accepted Fairway campaign/scope must not be silently relabelled Fonzo. Before a real Fonzo campaign write, use the existing accepted private evidence to identify the intended Fonzo brand and exact seven-field body/pins. The root bridge currently fixes `bg-r2-founder-campaign-v1`; campaign idempotency is scoped by existing actor/tenant/project/brand authority. If that same scope/key already created the accepted campaign, changing the payload must conflict, not produce a second campaign. Reuse the accepted campaign only with explicit product approval, or separately approve the minimum new scope/key contract; do not reset idempotency or enable broad campaign writes. The local Fonzo fixture cannot establish private runtime scope or clear a spent creation key. This executor did not inspect private live records or reopen ownership checks.

## One consolidated runtime evidence procedure (read-only; operator required)

Use the existing authorised operator and private candidates; never obtain new credentials, create jobs or substitute SQL Editor for application-pool proof. Reuse accepted BG-017C role/15-table/preflight evidence; do not rerun that gate. Inspect only newly required dependencies:

1. Record API, worker and bridge exact serving images/source provenance, pinned target/audience, normal traffic and rollback revision/image. Read flag names/status only. Current metadata was not accessible to this executor; historical accepted metadata is not a fresh readback.
2. Through an already authorised application-pool session (no secret extraction), in BEGIN READ ONLY with bounded statement/lock timeouts, read catalog/migration history for `20261115120000_create_provider_spend_ledger.sql` and its actual three spend tables, policies and runtime grants. Use the migration as the exact relation/column authority. Record effective current/session role, superuser/BYPASSRLS/parent memberships, forced RLS and policy applicability. Dedicated `bizgenie_provider_spend_runtime` must satisfy existing source requirements; historical `postgres` campaign evidence does not establish this. ROLLBACK/release. If no authorised session exists: NOT RUN; obtain separate scoped approval, do not invent a probe endpoint.
3. Read existing policy/cohort/pricing/FX validity and approved authority, submit and status upper bounds. The first-ten-customer monthly aggregate cap must be 10000p; founder lifetime 500p includes one submit and every permitted status observation. Unknown/expired prices, FX or cohort fail closed. No policy seeding/reset is authorised. Check 25-second DB-time minimum and maximum ten observations; no resubmission, no uncertain exposure release.
4. Confirm current founder entitlement, credit availability and expiry through existing authenticated GET billing state. Historical 100-credit funding PASS is retained; it is not current unexpired entitlement or permission to spend. One successful video costs five credits; an ambiguous result may retain reservation/exposure. No new grant/refund is authorised.
5. Read worker configuration/readiness, exact Veo Fast model `veo-3.1-fast-generate-001`, region `us-central1`, existing bucket/toolchain and permission evidence without a provider call. Source technical profile: one 4-second 720p 9:16 silent AI video, no supplied assets. A running worker is required. Confirm storage/private retrieval and exact approved campaign/variant binding from private records. No write-based bucket/model test without approval.
6. Complete private release envelopes with genuine approvals/operator/legal/rollback references, immutable images and source pins; execute existing offline validators only when mandatory evidence is complete. Capture redacted results. Missing runtime evidence remains HOLD, not a test failure or migration authorisation.

## Premium commercial pilot — design only

Read the detailed provider-versus-implemented capability matrix in BG_FOUNDER_LAUNCH_CLOSURE_03.md. Preserve its limitations: current customer AI quote rejects reference assets; hybrid rendering is a fixture, not a production compositor; no finished multi-shot advert or exact pack/logo guarantee. Current four-second technical output is not premium commercial acceptance.

For a separately approved pilot, pin one genuine rights-checked Fonzo asset hash/version and original logo/font, one factual hero shot/storyboard, target model's verified reference-image/duration support and one bounded attempt. Reuse rights loader, quote lineage and spend reservation rather than inventing a new pipeline. A future admitted reference-asset quote path and a real production compositor require their own scoped source approval; neither is implemented by this integration.

Compose unchanged product pixels/logo, deterministic typography/CTA and transitions over an accepted cinematic background with an approved real renderer. Pin timeline, fonts, assets, renderer and preview profile. Inspect every frame for pack geometry, spelling, logo/flavour accuracy, hallucinated claims, artefacts, crop, readability and playback. Founder creative signoff is required in addition to technical checks. Reject unusable work without silently retrying or recycling budget.

Cost per usable commercial is UNKNOWN until authoritative per-model prices, FX, finite shot/rejection limits, observations and rendering charges are approved: sum every generated/rejected attempt + status exposure + composition/storage charges, divided by accepted deliverables. Five-credit pricing and synthetic fixture costs do not establish GBP production cost. The existing 500p single-job cap cannot authorise three finished videos or a multi-shot rejection programme. Reference footage is inspiration only; no redistribution or third-party branding reuse.

## Release dependency and rollback

1. Independently review new API/WEB integration heads; obtain fresh exact-head hosted CI. Merge only after explicit source authority/protections; API before WEB. No original draft is superseded/closed here.
2. Accept runtime evidence and any genuinely missing spend migration/policy/role with separate precise approval; never automatically apply migrations or seed policies. Existing campaign/onboarding schema PASS remains locked.
3. Build API/worker and bridge immutable images from accepted new source only after build approval. Existing image cannot be claimed to contain these changes. Read back registry digest/provenance. Preserve existing upstream privacy/IAM and rollback.
4. Prepare founder `draft_connections` profile, private pins and actual serving capability manifest; deploy staging API/worker, bridge and manual WEB staging in independently approved order. Read-only checks before enabling any founder write. WEB profile `bridge-founder-release04` admits copy only with its existing UI flag AND verified serving manifest. Default shipped manifest remains empty. Analytics/billing management remain unavailable.
5. Exercise non-paid persistence and private previews. Then separately approve the one-job video phase/configuration and current maximum cost. Existing draft and video profiles are intentionally incompatible; never broaden global flags to combine them. Restore prior founder-draft profile after the bounded attempt only under approval.
6. Abort on wrong image/pins/identity/tenant, unexpected traffic/IAM/config drift, denied private access, budget ambiguity, duplicate work, secret exposure, or output mislabelling. Restore only the explicitly recorded pre-release revision/configuration if traffic still matches the owned change; do not overwrite intervening operator changes. Preserve original API traffic/tags and immutable rollback digests. Exact current rollback metadata requires operator readback; no invented deploy commands.

Sprint10C temporary-secret cleanup remains HOLD. No denied-region inventory retry, resource deletion or grant removal occurred. Any residual risk deferral requires explicit founder acceptance; this document does not waive cleanup.

Indicative remaining effort: independent source/CI review 1–2 hours; consolidated operator evidence 1–2 hours if access/policies exist; approved immutable builds/reversible staging release 1–2 hours; genuine asset intake and non-paid Fonzo browser acceptance 1–2 hours; one separately approved technical video attempt 30–60 minutes plus provider latency. Premium compositor/reference pilot is a separate scoped design/approval, not included in this estimate. Public launch remains NO-GO until genuine customer quality, spend and runtime gates pass.

## Local verification evidence

Node 22.23.3. Full API: 1485/1485 PASS, zero skips/failures, PostgreSQL 17 in an isolated throwaway local container. New bridge/release-validator cases: 15/15 PASS; existing/new founder bridge focus: 38/38 PASS. Golden Journey v1: 87/87 PASS in six reported stages; independent curated suites are not a chained hosted E2E. No live credentials/providers were used. WEB evidence is recorded on its integration branch and in the redacted handoff checkpoint. Accepted original operator journals, private manifests and staging databases were not edited.
