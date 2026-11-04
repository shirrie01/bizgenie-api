# BG-LAUNCH-012 — Backend Launch Completion Report

4 November 2026, Europe/London. **Tested integration candidate; externally verified launch readiness remains BLOCKED. No traffic promotion recommended.**

## 1. Work completed and exact source

Separate branch `bg-launch-012-backend-completion`, based on #226 `f1fc2f51502793d9fb03617f30fd72b5a61c1e2e`. Incorporated the two #227 commits `4d197ce237893eca4b96301436869dca320eb1f9` and `b400d27f7cdd516a772d45873adaa59a70f0c4b8` by cherry-pick on this isolated branch, preserving both original candidates. Resulting integration commits: `56f7fd3` and `7f7ca05`. One social-service conflict was resolved by preserving #226's server-side bound-connection lookup and optional connection_id, staging browser-return allowlist, draft lifecycle and callback configuration while adding #227's reviewed LinkedIn gates, scopes and truthful submission states.

**Tested functional fix SHA: `c532ce2eac4aa59b59369dc55ee9d2022d14a20c`.** Subsequent report/contract/evidence commits do not change tested application/test files; source SHA-256 values are recorded in BG_LAUNCH_012_EVIDENCE.json. Final published head is established by remote Git, not a self-referential document claim.

Remote #226/#227 and Web #65/#66 heads were checked. No superseding code found: #65 `5c0da994260502bacfba2579dbffb37465f4fbc2`; #66 `8367d677e6c1f3bb23d4085334fd0601b5e1b45e`. No frontend branch/file changed. GitHub API authentication is already known invalid/Forbidden; no repeated credential attempts, no hosted-CI claim and no live Mission Control claim. Its current 18-tab contents remain unavailable, not reconstructed from older snapshots.

## 2. Confirmed defect and resolution

**P0 integration blocker: registered LinkedIn connector cannot start through the actual production premium composition.** #227's factory requires its scoped encrypted vault and operation journal, but #226's composition injects that runtime only for TikTok. Registering LinkedIn therefore throws `SOCIAL_TOKEN_VAULT_UNAVAILABLE`, despite adapter unit tests passing.

Reproduced with a new real disposable PostgreSQL composition test: **0/1 passed**, exact error `SOCIAL_TOKEN_VAULT_UNAVAILABLE`, stack at createLinkedInPlatform -> createPremiumComposition. No provider call occurred.

Small correction in `src/activation/premiumComposition.js`: initialize the existing shared key/vault/journal for both supported connectors. Apply TikTok-specific video inspection, approved source, upload review/origin/chunk requirements only when composing TikTok. Cache the shared credential runtime; cache TikTok media additions separately. No replacement vault, provider, schema, route, permission or feature-flag default.

New regressions prove LinkedIn-only OAuth works without video/TikTok configuration, tokens persist encrypted, disconnect is local-only, both connector orders share the correct runtime, TikTok media/policy safeguards remain mandatory, and missing key configuration still fails closed. New TikTok tests reject missing scopes, expired tokens and foreign-tenant credentials before any upload-init request. No assertion weakened, tests skipped or CI changed.

## 3. Actual test evidence

Node 22.23.3; existing local PostgreSQL 17.11, disposable test databases only. No installations, provider credentials, shared migrations, accepted-image regeneration or live requests.

| Run | Result | Scope |
|---|---|---|
| Initial combined social/quote baseline | 76/76 PASS | Existing behavior after conflict resolution, before new composition regression |
| New LinkedIn composition reproduction | 0/1, confirmed FAIL | SOCIAL_TOKEN_VAULT_UNAVAILABLE before repair |
| Same regression after repair | 1/1 PASS | Actual factory/service + encrypted PG persistence; mock HTTPS only |
| Expanded composition/permission regressions | 3/3 PASS | Includes both connector orders and negative key/media/scope/expiry/tenant cases |
| Full `npm test` after functional changes | **1117/1117 PASS** | 138 suites, zero failures/cancelled/skipped; includes actual disposable PG suites |
| Critical social/media/Stripe/PG suite | **144/144 PASS** | Existing adversarial bill/campaign tests plus current connector/streaming tests |
| Exact Web #66 client wire probes | **4/4 PASS** | Backend authorize URL/config + connection/dispatch serializers consumed by exact client source; mocked fetch, no browser/sign-in |
| Source/test JS syntax, index and worker | PASS | Node --check; no code executed against staging |
| Whitespace / JSON parse | PASS | Review artifacts only |
| Hosted CI / deployed E2E | UNKNOWN / NOT RUN | No authorized API/GCP test route; source results are not deployed results |

Commands, source hashes and raw-log hashes are in the companion evidence JSON. Counts overlap. The four frontend probes are additional synthetic wire checks, not a substitute for browser rendering or real Supabase account tests. Logs remain in `/workspace/recovery/bg-launch-012/`.

## 4. Connector completion/readiness matrix

| Capability | Code candidate | External gate / honest limit |
|---|---|---|
| LinkedIn OAuth authorization/code exchange/UserInfo | Implemented, now composes through real durable runtime | Actual app credentials/review/config + separately approved staging connection still required |
| LinkedIn identity/tenant binding | Authenticated UserInfo subject; owner/state/internal verifier; encrypted account-scoped vault | No decoded-unverified ID token/email identity; no inferred person URN |
| LinkedIn expiry/reconnect/disconnect | Enforced, superseded references retired; local invalidation explicit | No unverified refresh or remote-revoke operation |
| LinkedIn text transport | Implemented but disabled by default | Current reviewed Posts version, member-author mapping and access evidence absent; no publishing activation |
| LinkedIn image/video/company/analytics | Disabled | No approved/verified current contract or permission; portal scope names are not authority |
| LinkedIn actual publication confirmation | Disabled | No verified member-read/status contract under actual grants; 201 remains accepted_unverified |
| TikTok Web OAuth/refresh/revoke | Implemented and scoped; reviewed staging callback preserved | Existing reviewed app/key/config and separately authorized live test |
| TikTok FILE_UPLOAD inbox draft | Implemented with generation/digest/rights binding, no bearer forwarding to upload URL | Reviewed upload origin/chunk policy, durable key/schema and isolated staging media prerequisites |
| TikTok retry/recovery | Durable operation identity, no blind init/PUT replay | Lost responses may require external reconciliation; no claim of provider exactly-once |
| TikTok status | SEND_TO_USER_INBOX -> uploaded/creator action; PUBLISH_COMPLETE -> creator completed, visibility unverified | Never creates verified public publication or fabricated URL |
| TikTok Direct Post | Disabled | video.publish not requested or assumed |

### Official documentation boundary

Available official SDK heads were reverified through native Git: Python `6331e52f5ea59b326447efa67a9bf925ed2d9ec7` (20 November 2023), JavaScript `e4a1fae1f829b370a339477a071d8affe0f6fd3b` (23 March 2023). Sources: official linkedin-developers/linkedin-api-python-client README/auth utilities and linkedin-api-js-client constants/auth/create-posts example. These support historical OAuth/UserInfo/header/body handling, **not** a current Posts API version, current read grants or OIDC-sub-to-person-URN equivalence. Existing Microsoft Learn 403 limitation was not repeatedly probed. No old 202302 API version, r_liteprofile assumption, invented revocation endpoint or unsupported refresh entitlement introduced.

LinkedIn requested scopes remain openid/profile/w_member_social (email portal scope unused). Callback remains `https://getbizgenie.com/customer/social/oauth/callback/linkedin`; no deployment/public verification claimed. TikTok callback defaults to corresponding getbizgenie.com path; only #226's reviewed staging-api.getbizgenie.com override retained. No callback/secret/portal configuration changed.

## 5. Video backend readiness

Verified by the existing real composition/worker tests with deterministic HTTPS/provider/storage stand-ins, never paid Veo: configured durations 4/6/8 seconds, aspect 9:16 or 16:9, normal/premium model selection, profile-bound quote and exact confirmation cap, queued -> claimed -> calling -> recovery_required -> succeeded/failed transitions, fenced pre-call cancellation, polling/restart without duplicate submit, invalid output/inspection failure remaining private and fail-closed, definitive failure releasing once without charge.

The production output gate requires inspected H.264 MP4 consistent with bound dimensions/aspect/duration; tests cover VP9, truncated/corrupt, wrong length/aspect and inspector outage. Runtime/provider support is not invented from fixture success. Private retrieval uses rights/tenant/revision checks and generation-pinned storage reads, not public or unrestricted signed URLs. Metadata does not authorize a later byte read after revocation. The legacy video GET can settle billing and was not used as a live/read-only probe.

Ambiguous provider outcome keeps a reservation and blocks unsafe resubmission; this is not a proven failure/refund. Only definitive failure releases it. No cost amount or credit allowance was invented: quotes use existing approved database commercial policies, and a missing/stale policy fails closed. Fixture credit amounts are not pricing canon. In-flight revocation cannot retract already delivered bytes; aggregate egress must still be verified operationally.

## 6. Billing and credit integrity

Full and focused tests exercised mocked Stripe signature/event handling, event replay/deduplication, failed-claim retry, idempotent entitlements, cancellation/deletion/past-due/invoice-failure behavior, PostgreSQL concurrency/rollback, insufficient-credit refusal, exactly-once quote reservation and settlement, definitive failure release, tenant isolation, restart reconciliation without duplicate debit/provider submit, cancellation fencing, and journal-backed reconciliation.

No billing code, policy, amount, entitlement rules, ledger authority or financial migrations changed. Append-only PostgreSQL financial state remains authoritative. Tests prove local invariants, not live Stripe setup, current real balances or provider invoice reconciliation. No new Stripe event/charge/subscription/webhook was sent.

## 7. Customer API and Claude handoff

Machine-readable handoff: `docs/contracts/BG_LAUNCH_012_CUSTOMER_API.json` (`bizgenie.customer-launch.v1`). It covers auth/session/scope, onboarding/Brand Brain, campaigns, quote/confirm/status, existing asset attachment and authenticated media, review/ack/approval/schedule, calendar, social lifecycle/capabilities, credits/catalog and typed errors. This is an implementation-derived integration map, not a replacement for full Zod schemas or a newly invented endpoint.

For Claude #66:

- #227 + this composition fix are required alongside #226. Do not apply the historical BG_SOCIAL_002_WEB65_SOCIAL_CLIENT.patch to Web #66: that frontend work is already implemented. Its actual web client accepted both authorize URL contracts, typed LinkedIn connection capability fields and TikTok uploaded state in four synthetic wire probes.
- `oauth_protocol=linkedin_oidc_web`, `provider_pkce_required=false` accompany LinkedIn web intents. Internal S256 verifier/state remains mandatory. Do not send unsupported provider PKCE parameters. Preserve #226 optional server-resolved connection_id; do not expose destination_key to the browser.
- LinkedIn connection exposes display_name, status, expiry/version, capabilities and filtered granted_scopes. Missing/unavailable capability never implies permission. OAuth consent is separate from publishing consent.
- Uploaded TikTok draft != published. LinkedIn submitted/accepted_unverified/submission_unknown != published. Do not invent URLs/evidence or label local-only disconnect remote removal.
- Generation succeeded != approved; attach original existing output using version-bound service, then review/render/same-actor acknowledge/current approval. 409 requires reload/review, never silent rebase. Lost write response requires checking existing state/idempotency, never blind replacement.
- Existing 403 Brand Brain identity restriction, 404 foreign resources, 409 stale versions/quotes, 422 unsupported/permissions, 503 unavailable/ambiguous execution remain distinct. Full editable Brand Brain save and onboarding CAS/idempotency are preserved; no preferences written into Brand Brain.

No new environment variables or migrations. Existing #224/#226 private social runtime/schema/key prerequisites still apply; tests use disposable local migrations only. LinkedIn-only composition no longer requires TikTok upload variables or video flags. TikTok requirements remain unchanged. Production environment-key fallback is still prohibited; approved durable key management must be supplied before production use.

## 8. Release/security assessment and remaining blockers

| Priority | Remaining gate | Owner / action |
|---|---|---|
| P0 fixed in candidate | LinkedIn startup lacks encrypted runtime | Review c532ce2 and new reproduction/regressions; do not deploy automatically |
| P0 external | Isolated revision identity/tag/digest/source/traffic, staging credentials/schema/RLS, backup/restore evidence, authenticated positive + foreign-tenant E2E unverified here | Existing authorized operator uses BG-LAUNCH-009B package; do not repeat completed migrations or infer absent resources |
| P0 external | LinkedIn current Posts version/author relation/access/status-read evidence missing | Reviewer with current official documentation/app access supplies evidence; keep publishing disabled until separately approved |
| P0 external | Actual GitHub CI/current Issue #128/#191 and live 18-tab Mission Control not readable with current API credential | Existing authorized access reconciles this exact candidate; do not create broader credentials |
| P1 | Env key provider staging-only; real key recovery/retention and production least privilege | Existing founder-approved operations gate, no new key/KMS design or IAM changes here |
| P1 | Snapshot media revocation and deployment-wide egress ceiling not equivalent to instant/global revocation | Carry existing bounded exposure and operational limit evidence; no speculative infrastructure |
| P1 | Unknown provider outcome/held credit and post submission need safe reconciliation | Keep stable provider identity/fencing; never release/debit/repost based on a timeout alone |
| P2 | Legacy video GET not read-only; /health unsupported at baseline | Keep excluded from read-only acceptance; 404 is not health PASS; no new feature |

Code candidate is ready for review and later isolated hosted testing, not founder acceptance, staging promotion or launch authorization. Production, 00029-wtc traffic and zero-traffic staging target were not touched.

## 9. Proposed canonical updates — not posted

Update only existing BG-LAUNCH-012/backend integration checkpoint records after reading current row IDs/headers. TASK_REGISTER: tested candidate/composition defect fixed; external gates open. EVIDENCE_REGISTER/CHECKPOINT_INDEX: exact baseline/fix/final remote SHAs, reproduction FAIL -> fixed PASS, 1117 full + 144 critical + 4 web wire checks, scopes/limits, hosted CI UNKNOWN. SESSION_LOG/AUDIT_LOG/EOD_REPORT: isolated branch, no live changes, actual publication/write result only. LAUNCH_BLOCKERS/CURRENT_STATUS/PHASE_PLAN: remain RED/NO-GO; no traffic promotion. TECHNICAL_DEBT: reference existing media/egress/credential/recovery items, no duplicate IDs. BACKUP_REGISTER: no new live backup/restore evidence, preserve existing records. No silent edits to locks/decisions/canon/pricing. No claim any register/comment was updated.

## 10. Review and next founder gate

Draft should target `bg-launch-005-integration` (#226), showing #227 integration plus the minimal composition repair. #226/#227 remain separate and unmodified. Native Git publishing is available; API draft/CI access is known unavailable, so supply branch comparison and prepared body rather than retry invalid credentials. This branch contains #227's changes: do not apply #227 again separately onto this candidate.

Next safe engineering action: review the isolated diff and hosted exact-head CI through existing authorized GitHub access. Next founder-controlled operational action: explicitly approve deployment/testing prerequisites in the already-isolated staging environment after confirming identity, credential isolation and recovery; this report does not authorize that deployment. Real OAuth, publishing and paid video have separate gates and were not exercised.
