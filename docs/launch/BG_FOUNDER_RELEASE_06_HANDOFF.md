# BG-FOUNDER-RELEASE-06 — authoritative staging release handoff

25 Nov 2026. Read-only audit and documentation. **Nothing here is approval to merge, build, deploy, migrate, spend, connect an account or publish.** Public launch and paid video remain NO-GO. Sprint10C temporary-secret cleanup remains HOLD. API #267, WEB #94 and the five parent PRs were not modified. No private identifier, credential or secret value appears in this document.

Evidence classes used below: **VERIFIED** (read directly this session) · **SOURCE** (read in exact-head source) · **HISTORICAL** (older founder/operator record, not a fresh readback) · **NOT VERIFIED** (no access from this session; shortest authorised procedure given).

## 0. Access actually available to this session
| Resource | Result |
|---|---|
| GitHub (repos, PRs, #191, CI) | VERIFIED read; PRs/comments via REST |
| Mission Control workbook | Readable through the Drive connector (sampled rows only); **not writable here** (`canEdit:false`; connector has no cell write). No register was edited. Register text below is for an operator with write access |
| Google Cloud (Cloud Run, Artifact Registry, Secret Manager, logs) | **No credentialed account** (`gcloud auth list`: none). Staging inventory NOT VERIFIED. No attempt to bypass region policy or IAM |
| Application-pool read-only database session | None established. A Supabase connector exists but is **not** the accepted bounded application-pool procedure and was not used. Spend-runtime evidence NOT VERIFIED |
| Public DNS/HTTP for `staging-app` / `staging-api` / `getbizgenie.com` | Container cannot resolve external hosts: **not evidence either way** |

## 1. Canonical status (classification A–G)
**A. Verified and locked PASS (do not reopen):** Tenant A paid Golden Journey (27 Aug); R1/Step7 and R2 accepted checkpoints; funding 100 credits verified (historic); TLS 29/29; restricted BG-017C founder diagnostic (#191 `7120849278`) — scoped to comparison only, **not** isolation or commercial readiness; BYPASSRLS limitation retained.
**B. Source accepted:** API #267 `ecf573df…` (source merge only, independent review #191 `7148150913`).
**C. Source awaiting acceptance:** WEB #94 `b893433a…` — one bounded W1 correction assigned to Codex; after it, new exact-head CI and re-review. #265/#93 (social) are inside #267/#94 and share their status.
**D. Tests passed, no hosted proof of a customer journey:** API CI run 45514272513 (PG17, Golden Journey) and WEB Frontend/accessibility runs are green on the *old* heads; PostgreSQL-with-doubles Fonzo fixture (synthetic media). None is a deployed journey.
**E. Needs fresh runtime evidence:** serving images/digests/traffic/tags/rollback; flag states; spend schema, role, policy, cohort, price, FX, entitlement; worker; storage; callback host; Fonzo private binding.
**F. Needs explicit founder approval:** see §13.
**G. External provider dependencies:** LinkedIn app/products, TikTok app/review/sandbox, legal pages; **no provider approval or genuine connection exists** (see BG_SOCIAL_LAUNCH_CLOSURE_01 in #267).

## 2. Exact source SHAs
| Item | SHA | State |
|---|---|---|
| API main | `20951d143bcbcb140bb160f5b81f4e86f329345b` | unchanged since the review (VERIFIED) |
| WEB main | `50666b81d148828c754537ce8f5cf20c7b25dec9` | unchanged (VERIFIED) |
| API #267 (combined) | `ecf573df32096065b98b5b8f03530c9d1b6f1fa8` | **source accepted**, draft, mergeable clean |
| parents | #264 `90ca1b29…`, #265 `569060df…`, #266 `2aa522ba…` | preserved byte-identical in #267 (reviewed) |
| WEB #94 (combined) | `b893433ae5679194ec15dbc48992596c1fa7e84d` | **FIX REQUIRED (W1)**, draft, mergeable clean |
| WEB parents | #92 `700c4f12…`, #93 `898d36f2…` | preserved in #94 |
| Merge order | API #267 → WEB #94 (after W1 + CI) | no merge authorised |
Neither the running API, worker, bridge nor Studio contains this source. An existing image cannot be claimed to carry it.

## 3. Staging inventory
**NOT VERIFIED (no credentialed cloud access).** Last recorded facts (HISTORICAL; use only to know what to compare against):
- Project `bizgenie-backend`, region `europe-west1` (the only region reachable; `me-central2` is denied by organisation policy — do not retry or work around). Last CAI inventory (24 Nov): 10 Cloud Run services, 175 revisions, all `europe-west1`; not authoritative proof of absence.
- API service `bizgenie-api-staging`; founder-recorded normal traffic **`00029-wtc` 100%**, tags `f1fc2f51` and `bg017c-final` retained (#191, 24 Nov). Earlier: `00030-pob` (tag `f1fc2f51`) once at 0%.
- Bridge service `bizgenie-studio-bridge-staging`; last recorded serving revision `…-00002-dgz` (R1 Step7 preflight); current serving mapping UNKNOWN. Studio: GitHub Pages / Cloudflare Pages; `staging-app.getbizgenie.com` custom domain **not evidenced**.
- Sprint10C: two temporary secret aliases and grants remain, preserved; do not touch.
**Shortest authorised read-only procedure (operator, one pass, `europe-west1` only):**
1. `gcloud run services describe <svc> --project=bizgenie-backend --region=europe-west1 --format=json` for `bizgenie-api-staging`, the worker (service or job, name UNKNOWN) and `bizgenie-studio-bridge-staging`; extract only `status.traffic` (revision, percent, tag), `status.latestReadyRevisionName`, env var **names** (never values), serviceAccount, ingress. Pipe through `jq` that drops env values.
2. `gcloud run revisions describe <rev> …` for the serving and rollback revisions → `status.imageDigest`. Record digest, not tags.
3. Artifact Registry digest/provenance read for each recorded digest. 4. DNS TXT/CNAME and TLS for `staging-app`/`getbizgenie.com` from an unrestricted network.
Record into #191 as redacted tables. If any call is denied, record DENIED and stop; do not widen access.

## 4. Provider spending evidence
Contract read (SOURCE): `supabase/migrations/20261115120000_create_provider_spend_ledger.sql`.
| Requirement | Source says | Evidence |
|---|---|---|
| Tables | `provider_spend_policy` (singleton), `provider_spend_customers` (slots 1–10), `provider_spend_reservations`; **refuses to run if any exist** | applied? **NOT VERIFIED** (17 Nov evidence: not live in staging) |
| Role | `bizgenie_provider_spend_runtime`: NOLOGIN, NOINHERIT, no super/BYPASSRLS/createrole/createdb/replication, **no parent memberships**; no membership granted — an operator must separately approve a dedicated login's SET ROLE | NOT VERIFIED |
| RLS | enabled **and forced** on all three tables; policies only for the runtime role; `anon`/`authenticated`/`service_role` revoked | NOT VERIFIED. Historic 15-table diagnostic (role `postgres`, BYPASSRLS) is **not** proof of this role |
| Policy | `cap_minor` = 10000 (£100), `customer_limit` = 10, currency GBP, validity window, estimates object, `enabled` default **false**; **nothing seeded** | no policy/cohort row verified |
| Founder one-job | `founderVideo.js`: ≤ 500p lifetime, `submit upper_bound + 10 × status upper_bound ≤ 500`, 25 s minimum between observations, no resubmission | SOURCE only |
| Price / FX | `estimateAuthority.js` + release validator require approved, unexpired price and FX authority with pricing unit (`second` submit, `request` status) | NOT VERIFIED (cost per usable commercial UNKNOWN) |
| Model/profile | `veo-3.1-fast-generate-001`, `us-central1`, 4 s, 720p, 9:16, silent, no supplied assets | SOURCE |
| Worker | must be running; bubblewrap isolation (`VIDEO_INSPECTION_ISOLATION=bubblewrap`) required by the video profile; earlier doc says hardened isolation was not established under CI container profiles | worker/isolation **NOT VERIFIED** |
| Storage | `VIDEO_PROVIDER_OUTPUT_STORAGE_URI=gs://…`, private retrieval | NOT VERIFIED |
| Credits | five credits per successful video; entitlement/expiry must be read from authenticated billing state; the historic 100-credit funding is not current entitlement | NOT VERIFIED |
**Accepted evidence:** none of the above is accepted for the spend role. **Outstanding:** all rows marked NOT VERIFIED.
**Bounded proof (only if an authorised application-pool session already exists):** one `BEGIN READ ONLY` with bounded statement and lock timeouts; read `pg_roles` attributes + memberships for the effective and session role, `pg_class.relforcerowsecurity`, `pg_policies`, table grants, `supabase_migrations` history row for this migration, then the three tables' row counts and the single policy row's non-sensitive columns; `ROLLBACK`. No `SET ROLE` unless separately approved; no mutation; no SQL Editor substitution. If no session exists: **NOT RUN** — request scoped approval; do not invent a probe endpoint or credentials.
Note: the Phase B API environment is only valid with a policy whose `version` equals `FOUNDER_VIDEO_SPEND_POLICY_VERSION`; the migration deliberately seeds none.

## 5. Fonzo identity and campaign contract
| Element | Status |
|---|---|
| Accepted Fairway campaign | untouched; must stay so |
| Fonzo brand/tenant/project private tuple | **MISSING** (no evidence one exists) and **BLOCKED BY ACCESS** (private records not readable here) |
| Route to create a Fonzo scope | API has `POST /customer/workspace/brands` → `createAdditionalWorkspace` (a Fonzo workspace is created in `test/customer-workspace.test.js`). **The founder bridge does not admit it** (`/workspace/brands` and `/workspace/select` are asserted denied in `studio-bridge-founder-draft.test.js`) → **MISSING in bridge** |
| Root body | seven fields: `tenant_id, project_id, brand_id, name, goal, display_timezone, idempotency_key` with the fixed key `bg-r2-founder-campaign-v1`; pinned by SHA-256 of all seven (`scripts/staging/hash-founder-campaign-body.js`); derived from an **accepted recommendation** for that scope |
| Fonzo hash / pins | **MISSING** |
**Idempotency finding (SOURCE, `postgresRepository.js` ~L111-115):** command receipts are keyed `(tenant, project, actor, idempotency_key)` — brand is **not** part of the key. A Fonzo root under the **same tenant, project and founder** with the fixed key hits `IDEMPOTENCY_KEY_CONFLICT` (different intent) — it cannot overwrite Fairway, but it also cannot succeed. Therefore Fonzo needs **a different tenant/project (a new additional workspace)** or a separately approved second key contract. Do not reuse or reset the spent key.
**Draft pins need the campaign id** (`BG_BRIDGE_FOUNDER_DRAFT_CAMPAIGN_ID`), which exists only after the root write ⇒ **two bridge revisions are required (A1 then A2)**; A2 must keep root/onboarding/recommendation flags true (validator requires it).
**Non-destructive approval procedure (no write until step 7):**
1. Founder decision D1 (§13): Fonzo scope strategy. 2. If an additional workspace is chosen and the bridge cannot admit it: approve the narrow bridge permission in §6/§13 (source work), independently reviewed. 3. Operator-private record: Fonzo `{tenant, project, brand}` with founder auth user; evidence reference to an independent readback (no ids in GitHub). 4. Save Fonzo Brand Brain in that scope through the existing onboarding route; obtain the accepted recommendation. 5. Offline: build the seven-field body privately; `node scripts/staging/hash-founder-campaign-body.js <private-file>` → `body_sha256`. 6. Read-only check that no receipt exists for `(tenant, project, founder, bg-r2-founder-campaign-v1)`; **if one exists, STOP**. 7. Validator `validate-founder-campaign-release.js` then A1 deployment approval; POST once; a lost response replays the **same** body/key via GET discovery only. 8. Record campaign id privately → A2 pins (`validate-founder-release04.js`, profile `draft_connections`). Never print identifiers.

## 6. Genuine Fonzo asset intake (no upload performed; assets are not in BizGenie)
Existing route (SOURCE, `src/media-intake`): `POST /customer/assets/uploads` (init) → `PUT /customer/assets/uploads/:id/bytes` → `POST /customer/assets/:id/complete`; list/preview are GET.
| Item | Contract |
|---|---|
| Permission | workspace **owner**; scope tenant/project/brand; bridge founder identity |
| Types / size | `image/png`, `image/jpeg`, `image/webp`, `video/mp4`; **≤ 33,554,432 bytes (32 MiB)** each; exact declared bytes; magic-byte check |
| Rights | `rights_confirmed: true` literal (customer attestation only; `rights_evidence_kind: customer_attestation`) against a server rights policy (`MEDIA_RIGHTS_POLICY_VERSION` + `MEDIA_RIGHTS_POLICY_STATEMENT`); allowed uses default `campaign.preview`, `image.generate.reference`, `video.generate.reference` |
| Hashes | server computes SHA-256 and generation; read back from storage and compared; founder should record SHA-256 of each source file offline for later comparison |
| Inspection | quarantine → `complete` runs a real malware scan (clamd) or, in isolated staging only, structural inspection with `MEDIA_INTAKE_ALLOW_UNSCANNED=true` (labelled UNSCANNED) |
| Idempotency / limits | `idempotency_key`; max 20 pending per project |
| Brand linkage | asset row carries tenant/project/brand; `source_kind='reference'` |
| Reuse | `referenceForGeneration` allows reuse by quote only when rights and sha/generation match |
| Preview | `GET /customer/assets/:id/preview` (authenticated) |
**Is intake admitted by the founder bridge? NO.** The routes are in the read/forward allow-list, but every founder profile (and #267's three new flags) does not admit asset upload writes (doc §Fonzo step 3: "The new flags do not admit asset upload writes"), and `allowWrites` cannot coexist with founder profiles. **Intake is BLOCKED.**
**Also (SOURCE): uploaded assets cannot yet be used as campaign creatives.** `creativePreview.js:31` and `mediaPreviewAsset.js` accept only `source_kind === 'generated'` assets for a variant preview; no admitted founder route attaches a `reference` asset to a revision, and the founder video path rejects supplied assets. Phase A can therefore prove **upload, rights, hash, scan, brand-scoped storage and authenticated preview of the genuine artwork — not its use inside a campaign or video.** No original Fonzo video footage exists.
**Narrow approval plan:** new default-OFF bridge permission (e.g. `BG_BRIDGE_ALLOW_FOUNDER_ASSET_INTAKE`) admitting only those three POST/PUT routes, founder identity + pinned scope, body cap per route (32 MiB for bytes only), no DELETE/revoke; explicit validator profile and tests mirroring the three existing release-04 flags. Est. 0.5–1 day source + independent review. Runtime prerequisites for the API revision: `MEDIA_INTAKE_ENABLED=true`, `MEDIA_STORAGE_ENABLED=true`, rights policy variables, a scanner decision (D3). Note: **`MEDIA_INTAKE_ENABLED` must be false/absent in the Phase B API revision** (see §9).

## 7. Phases
**Phase A — non-paid founder experience (two bridge revisions, one API revision, one WEB build)**
A1: login → discover founder workspace → Fonzo scope (D1) → Fonzo Brand Brain → recommendation → root campaign (once).
A2: genuine asset intake (once §6 is approved) → `GET …/content-plan` → add drafts → copy edit (new revision, approval revoked, schedule cancelled) → review/preview-acknowledge/approve → schedule → calendar → LinkedIn connection status/OAuth readiness (§9; TikTok deferred unless G6).
**Phase B — one separately authorised video attempt:** separate API revision + separate bridge revision (§9); needs everything in §4, one-job pin to the Fonzo `campaign_id`/`variant_id`, a running worker, then quote → confirm (5 credits) → one submit → attach → authenticated playback → exposure reconciliation → restore Phase A profile. Quality caveats (founder-supplied, #191 23:22): no reference images, no brand compositor; a 4 s technical clip is **not** a Fonzo commercial.

## 8. Evidence still missing before any founder write (checklist for the operator)
1. §3 inventory + digests + rollback readback. 2. Flag **names** and states for API, worker, bridge, WEB manifest. 3. Private Fonzo tuple/hash/binding (§5). 4. Callback host: `staging-app.getbizgenie.com` DNS/TLS/Pages custom domain and that `/customer/social/oauth/callback/linkedin` serves the Studio SPA. 5. Provider portals: LinkedIn app + products + redirect registered exactly; legal URLs live. 6. Storage bucket, malware scanner or D3 decision, rights wording. 7. Token-vault key secret exists in Secret Manager (name only) and D5. 8. Phase B only: §4 rows.

## 9. Feature-flag compatibility (SOURCE)
| Setting | Phase A bridge A1 | Phase A bridge A2 | Phase B bridge |
|---|---|---|---|
| `BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING` / `…_RECOMMENDATIONS` / `…_CAMPAIGN_ROOT` (+root pins) | true | true | onboarding true only; root **forbidden** with video |
| `BG_BRIDGE_ALLOW_FOUNDER_DRAFT_WORKFLOW` (+4 pins incl. `CAMPAIGN_ID`) | absent/false | true | **forbidden** (draft config rejects `founderVideo`) |
| `…_COPY_EDITING`, `…_SOCIAL_CONNECTIONS` (new) | false | true (needs draft workflow) | false |
| `…_VIDEO_ATTACHMENT` (new) + `BG_BRIDGE_ALLOW_FOUNDER_VIDEO` (+pins, approval ref) | false | false | true (identity must equal video identity) |
| `ALLOW_WRITES`, `WORKSPACE_BOOTSTRAP`, `DRAFT_WORKFLOW`, `GENERATION_CONFIRMATION`, `SOCIAL_WRITES`, `STRIPE_CHECKOUT` | false/absent in all profiles (config throws otherwise) |
| Asset intake permission | not yet existing (§6) | requires §6 approval | not applicable |
| Additional-workspace permission | requires D1/§5 approval | – | – |
**API:** Phase A — `MEDIA_INTAKE_ENABLED`, `MEDIA_STORAGE_ENABLED`, `SOCIAL_PUBLISHING_ENABLED` with `SOCIAL_PLATFORMS=linkedin`, `BIZGENIE_ENVIRONMENT=staging`, token-vault key variables (staging-only env provider; production provider does not exist), `LINKEDIN_*`, `LINKEDIN_REDIRECT_URI` = the staging Studio URI, `FOUNDER_VIDEO_ACCEPTANCE_ENABLED` absent/false. Phase B — `FOUNDER_VIDEO_ACCEPTANCE_ENABLED=true` requires `QUOTED_GENERATION`, `VIDEO_GENERATION`, `MEDIA_STORAGE`, `BILLING_DURABLE` true and **`MEDIA_INTAKE`, `SOCIAL_PUBLISHING`, `IMAGE_GENERATION`, `STRIPE_BILLING`, `LEARNING`, `STRATEGY_WORKFLOWS`, `PRODUCTION_ACTIVATION` false**. **Intake/social (A) and video (B) therefore cannot share an API revision** — by design; never broaden flags to combine them.
**TikTok in Phase A:** the composition refuses to register TikTok without video generation + inspector + `TIKTOK_UPLOAD_ORIGINS/REVIEW_REF/CHUNK_BYTES` (gap G6 in BG_SOCIAL_LAUNCH_CLOSURE_01) → incompatible with Phase A. Phase A OAuth is **LinkedIn only** (D6).
**WEB:** `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION`, a manifest entry for the exact serving pair; per-feature flags `VITE_CONTENT_PLAN_API`, `VITE_COPY_EDIT_API`, `VITE_SOCIAL_ACCOUNTS_API`, `VITE_FOUNDER_CAMPAIGN_ROOT_API`, `VITE_WORKSPACE_CALENDAR_API`; list `mediaIntake` capability **only after** the bridge admits it. Shipped manifest is empty ⇒ everything OFF by default. After W1 the TikTok draft control is hidden under this profile.

## 10. Traffic and rollback safeguards
Immutable digests only; deploy each new revision with **no traffic** and a tag, read back digest/provenance, smoke through the tag, then shift; record before/after traffic table. Rollback = restore only the explicitly recorded pre-release revision/configuration **if traffic still matches the owned change**; never overwrite intervening operator changes; preserve `00029-wtc` traffic/tags and the `f1fc2f51`/`bg017c-final` tags. Phase A→B and B→A transitions are each a separate approved change; restore the Phase A profile after the bounded attempt. Exact current rollback revision/digest: NOT VERIFIED (§3). No invented deploy commands.

## 11. Security exclusions
No new tenant data writes outside founder pins; no `allowWrites`, bootstrap, generic draft workflow, generation confirmation, social dispatch/publication, Stripe; no anonymous OAuth relay; no public media URLs; no IAM/org-policy/DB-role change; no secret creation here; Sprint10C secrets untouched; the env token-vault key provider is staging-only (production refuses it); runtime DB role bypasses RLS (accepted limitation, retained); customer-attested rights only; assets UNSCANNED if D3 chooses structural-only.

## 12. Exact stop conditions
Wrong image digest/source SHA/pins/identity/tenant; traffic, IAM or config drift not owned by the change; flag set outside §9 (including a draft+video or intake+video combination); receipt already exists for the Fonzo key; any write hitting the Fairway scope; bridge 403 on an expected admitted route or 2xx on a denied one; scanner unavailable/asset `rejected`; policy/price/FX/cohort/entitlement missing, expired or ambiguous; any second submit, resubmission or unexpected provider call; exposure > 500p or credits ≠ expected; secret or private id in any output; mislabelled output (draft shown as published). On stop: freeze, record, do not retry blindly.

## 13. Founder decisions required
D1 Fonzo scope: new additional workspace (needs bridge permission) vs another approved mechanism — **never** the Fairway scope. D2 Approve source work for (a) additional-workspace admission, (b) asset-intake admission (narrow, default OFF, reviewed). D3 Scanner: deploy clamd vs accept isolated-staging UNSCANNED for genuine artwork on a shared staging database. D4 Rights-policy wording/version. D5 Accept the env-provided token-vault key on staging for LinkedIn (and defer production KMS design G7). D6 TikTok in Phase A: defer (recommended) vs fund G6. D7 Phase B: separate go/no-go, one 5-credit attempt, ≤ £5 conditional exposure, current entitlement. D8 Merge authority/order and build approval for API then WEB. D9 Whether Sprint10C HOLD must close first or the residual risk is explicitly accepted.

## 14. Day-one sequence (each step needs its own approval; stop at the first failure)
0. W1 fixed, WEB #94 re-reviewed with new exact-head CI; D1–D9 recorded. 1. Operator evidence pass (§3, §4, §8) → redacted into #191. 2. Approve and merge API #267 (and the §6 / §5 permissions if approved, after review) → WEB #94. 3. Build immutable API + bridge images from accepted source; digest readback. 4. A1: deploy API (Phase A env) and bridge A1 at 0% + tag → smoke → shift → Brand Brain, recommendation, root campaign once → record. 5. A2: bridge A2 with pins; WEB staging build + manifest entry → run the Phase A acceptance gates: login; Fonzo Brain; asset intake (five flavour artworks + transparent logo) with recorded hashes; plan; drafts; copy edit; approval; schedule; calendar; LinkedIn consent/status/disconnect (no dispatch). 6. Founder sign-off for Phase A; restore/hold. 7. Phase B only after D7 and §4 evidence: deploy video API + bridge B, one attempt, attach, playback, reconcile, restore Phase A profile. 8. Record every step in #191 and Mission Control.
**Phase A acceptance gates:** correct identity; Fonzo-only scope; Fairway untouched (campaign list/version unchanged); each asset `ready`, SHA-256 equal to the founder's, brand-scoped, previews only to the owner; plan has 7 posts/5 image/3 video slots, claims per Brand Brain only; copy edit preserves history and revokes approval; schedule persists across sign-out/in; LinkedIn connected identity correct, no publishing possible; zero credits consumed, zero provider calls.
**Phase B acceptance gates:** policy/cohort/price/FX valid; exactly one submit; ≤ 10 status observations ≥ 25 s apart; ≤ 500p; 5 credits; attach to the pinned variant/revision once; authenticated playback bytes/type/duration valid; exposure recorded; no auto-retry; profile restored.

## 15. Remaining work and estimates (engineering, excluding approvals and provider waits)
| Item | Estimate |
|---|---|
| W1 WEB fix + CI + re-review (Codex) | 0.5–1 h |
| Bridge: additional-workspace admission + validator + tests + review | 0.5–1 day |
| Bridge: asset-intake admission + validator + tests + review | 0.5–1 day |
| Operator evidence pass (§3, §4, §8) | 1–2 h, if access exists |
| Immutable builds + A1/A2 staged release | 2–3 h |
| Phase A browser acceptance (incl. genuine asset intake) | 1–2 h |
| LinkedIn app/product setup + legal pages (founder/external) | founder time; provider review UNKNOWN |
| TikTok enablement (G6 decoupling + sandbox + review) | 0.5–1 day + provider review UNKNOWN — deferred (D6) |
| Phase B attempt (after evidence) | 0.5–1 h + provider latency |
| Using genuine artwork *inside* campaigns/videos (reference-asset binding, compositor) | separate scoped design/approval; **not** in this release |
Production token-vault KMS (G7) ~1 day + review: not needed for staging acceptance if D5 is accepted; required before any customer data in production.
