# BG-FOUNDER-RELEASE-08 — staging activation packet and real Fonzo customer journey

25 Nov 2026. **PREPARATION ONLY. Nothing in this packet was executed against cloud, database, provider or customer systems.** Public launch, paid video and Stripe remain NO-GO. Sprint10C temporary-secret cleanup remains HOLD (no change, no waiver). No private identifier, credential or token appears here.
Evidence classes: **VERIFIED** (read directly this session) · **SOURCE** (read in exact merged source) · **NOT VERIFIED** (needs credentialed operator access that this session does not have).

## 1. Verdict
| Question | Answer |
|---|---|
| Source ready for controlled activation? | **GO** — API `dfd49116…` and WEB `18119b3f…` are merged and independently accepted; no new defect found. |
| Runtime ready for controlled activation? | **NO-GO until the one operator inventory in §4 passes.** Nothing about the live staging services, digests, traffic, flags, scanner or provider setup can be claimed from here. |
| Can the visible Fonzo journey run end to end today? | **No.** Three genuine blockers (§10): (1) no real malware scanner is deployed, so genuine artwork intake cannot be enabled without a security exception; (2) no approved way yet to make the single Fonzo workspace request (WEB has no call); (3) no evidence a LinkedIn app/products exist. A0 and A1 are not blocked by these. |
| Recommended next step | One approval checkpoint (§11): founder runs the §4 command block, then approves D1–D5 and D6 (invocation). A0 → A1 can then proceed in about half a day; A2 needs the scanner decision. |

## 2. Accepted source and deployment-candidate bindings
| Item | Exact value | State |
|---|---|---|
| API main | `dfd49116a0fe6bde11dbc25ca4599a03b8046999` | VERIFIED (branch head) |
| WEB main | `18119b3fd9eec2283ab4f8910848dfda81c49dc0` | VERIFIED |
| API #267 / #269 / WEB #94 | merged; #269 re-review ACCEPT at `e9d0552d…`; W1 accepted | VERIFIED (PR state) |
| API #268 (Release 06 handoff) | draft, head `101930e29eec168d3ae1f0fb85ee289f77d53761` | VERIFIED; superseded for planning by this packet where they differ |
| Immutable images | **None built or published.** API, worker and bridge images must be built from `dfd49116…` (API) and the WEB bundle from `18119b3f…`; digests are recorded only after an approved build (§6.0). | NOT PRODUCED |
| Private deployment manifests | Templates below; real values are private and must never be committed | NOT PRODUCED (needs verified inventory) |

## 3. What was verified without cloud access (GitHub side)
- **No automatic API deployment exists in source:** the API repository's only workflow is `ci.yml` (tests, image-build checks); GitHub records **0 deployments** for it. Nothing deployed from the merges via GitHub.
- **WEB staging release is manual-only:** `studio-staging-release.yml` has a `workflow_dispatch` trigger only, needs an exact 40-character SHA, `deploy=true` and approval by the `staging-studio` GitHub Environment (required reviewers). The latest recorded WEB deployment is **8 Nov 2026 (`ce8694e1`, environment `staging-studio`)**; none is recorded after the 25 Nov merges. **Not verified:** whether the Cloudflare Pages project has its own Git integration auto-building `main` (a dashboard setting; §4 step 6).
- **CI (VERIFIED):** API main `dfd49116…` push CI **success**; WEB #94 final head `f54e1d01…`: Frontend CI **success on attempt 2** (the controlled rerun of run 45517178944) and App accessibility QA success. A CI pass is not a deployed journey.
- **Cloudflare Git integration is present (VERIFIED, with an unverified consequence):** a `Cloudflare Pages` check runs on WEB PR commits, i.e. the Pages project is connected to the repository. Whether a push to `main` triggers an automatic **production** deployment is a dashboard setting that cannot be read here — **treat the serving Studio build as unknown until §4 step 6** (a later, unreviewed auto-deploy of `18119b3f…` with flags unset would still show every gated feature OFF because the shipped manifest is empty).
- Conclusion: the serving staging API/bridge/Studio are, on the evidence available, **the pre-merge builds**; none of this source (Fonzo workspace, intake, W1, release-04 permissions) is serving yet.

## 4. ONE consolidated read-only inventory (founder runs in Cloud Shell; ~30–45 min)
Rules: `europe-west1` only; never `me-central2`; read-only verbs only; **never** run an unfiltered environment dump; output names/status, not values. Paste the redacted output into #191.
```sh
set -u; P=bizgenie-backend; R=europe-west1
# 1. Services, jobs, traffic, tags, digests, service accounts, flag NAMES (values removed), containers (sidecar visibility)
gcloud run services list --project=$P --region=$R --format='value(metadata.name)'
gcloud run jobs list --project=$P --region=$R --format='value(metadata.name)'
for S in bizgenie-api-staging bizgenie-studio-bridge-staging; do
  echo "== $S"; gcloud run services describe $S --project=$P --region=$R --format=json | jq '{url:.status.url, ingress:.metadata.annotations["run.googleapis.com/ingress"], traffic:.status.traffic, latestReady:.status.latestReadyRevisionName, sa:.spec.template.spec.serviceAccountName, containers:[.spec.template.spec.containers[]|{name,image,env:[.env[]?|{name,fromSecret:(.valueFrom!=null)}]}]}'
  gcloud run revisions list --service=$S --project=$P --region=$R --limit=6 --format='table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)'
  gcloud run services get-iam-policy $S --project=$P --region=$R --format=json | jq '.bindings'
done
# 2. Digest and source provenance for each SERVING and ROLLBACK revision (set the names from step 1)
for REV in $API_SERVING_REV $API_ROLLBACK_REV $BRIDGE_SERVING_REV $BRIDGE_ROLLBACK_REV; do gcloud run revisions describe $REV --project=$P --region=$R --format='value(metadata.name,status.imageDigest)'; done
# 3. Registry digests and tags (existing approved repository only)
gcloud artifacts docker images list europe-west1-docker.pkg.dev/$P/cloud-run-source-deploy --include-tags --format='table(package,version,tags,updateTime)' --limit=20
# 4. Secrets present BY NAME and newest version state (no payloads)
gcloud secrets list --project=$P --format='value(name)'; for N in $(gcloud secrets list --project=$P --format='value(name)' | grep -Ei 'social|linkedin|tiktok|token|clam|media'); do echo "$N: $(gcloud secrets versions list $N --project=$P --limit=1 --format='value(state,createTime)')"; done
# 5. Storage readiness (metadata only)
gcloud storage buckets list --project=$P --format='table(name,location,uniform_bucket_level_access,public_access_prevention)'
# 6. DNS, TLS, callback host (public, harmless) and Cloudflare Pages
for H in staging-app.getbizgenie.com staging-api.getbizgenie.com getbizgenie.com; do echo "$H: $(dig +short CNAME $H | head -1) $(dig +short A $H | head -2 | tr '\n' ' ')"; done
curl -sS -o /dev/null -w "callback path HTTP %{http_code}\n" https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin
# Cloudflare: Workers & Pages -> bizgenie-studio-staging -> Deployments (active deployment id, commit, aliases, previous deployment = rollback) and Settings -> Builds (is automatic production deployment ON for main?)
#   or, from a WEB checkout with existing authorised tooling:  PAGES_PROJECT=bizgenie-studio-staging node scripts/staging/cloudflare-previous-deployment.mjs
# 7. Org-policy / Sprint10C state: read only
gcloud secrets list --project=$P --format='value(name)' | grep -Ei 'bg017c|s09b|temporary' ; gcloud run services list --project=$P --region=$R --format='value(metadata.name)' | grep -Ei 'bg017c|diagnostic'
```
Application-pool read-only session (the founder's **already authorised** route; no new credentials; **do not** `SET ROLE`; set `FOUNDER_AUTH_USER` locally, it is never printed):
```sql
\set ON_ERROR_STOP on
begin read only; set local statement_timeout='5s'; set local lock_timeout='1s';
select current_user as effective, session_user as session,
  (select rolsuper from pg_roles where rolname=current_user) as is_super, (select rolbypassrls from pg_roles where rolname=current_user) as bypass_rls, version();
-- Workspace and campaign state: counts and short hashes only
select left(encode(sha256(p.project_id::bytea),'hex'),8) as project_h, p.name as project_name, b.status as brand_status,
  (select count(*) from campaigns c where c.project_id=p.project_id) as campaigns,
  (select count(*) from campaign_command_receipts r where r.project_id=p.project_id and r.idempotency_key='bg-r2-founder-campaign-v1') as fixed_key_receipts
from tenant_memberships m join projects p on p.tenant_id=m.tenant_id join brand_brains b on b.project_id=p.project_id
where m.auth_user_id=:'FOUNDER_AUTH_USER'::uuid order by p.created_at;
-- Spend ledger and runtime role (existence, RLS, policy; no financial data)
select to_regclass('public.provider_spend_policy') is not null as has_spend \gset
select :'has_spend' as spend_tables_present;
\if :has_spend
select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('provider_spend_policy','provider_spend_customers','provider_spend_reservations') order by 1;
select rolname, rolcanlogin, rolinherit, rolsuper, rolbypassrls, (select count(*) from pg_auth_members m where m.member=r.oid) as parent_memberships from pg_roles r where rolname='bizgenie_provider_spend_runtime';
select version, enabled, cap_minor, customer_limit, valid_from, valid_until, jsonb_object_keys(estimates) as estimate_keys from provider_spend_policy;
select (select count(*) from provider_spend_customers) as cohort_rows, (select count(*) from provider_spend_reservations) as reservations;
\endif
-- Entitlement validity for the founder tenant (credit balance: read it in the Studio billing state, not here)
select e.status, e.reference_period_end, e.included_monthly_credit_grant from tenant_entitlements e join tenant_memberships m on m.tenant_id=e.tenant_id where m.auth_user_id=:'FOUNDER_AUTH_USER'::uuid and m.role='owner';
select to_regclass('public.customer_media_intakes') is not null as intake_table_present;
rollback;
```
Return to the programme: the **pass/fail rubric** is §9 (stop conditions). Items that must read as follows before any write: API and bridge serving digests recorded and equal to the intended rollback pair; traffic 100% on one revision; no unexpected tags; bridge service account has only the invoker role on the private API; `ALLOW_*` broad flags false/absent; Fairway project has exactly **one** fixed-key receipt; no Fonzo project exists; spend tables either absent (then Phase B stays blocked) or role/RLS as the migration states; Sprint10C temporary secrets still present and untouched.

## 5. A0 → A1 → A2 readiness
| Step | Source | Runtime prerequisite | Status |
|---|---|---|---|
| **A0 Fonzo workspace** | READY (merged: durable idempotency, bridge permission default OFF, validator `workspace`) | verified inventory; D1, D2, D6; bridge revision with the A0 profile; API revision that includes `dfd49116…` | READY pending inventory + approvals |
| **A1 Brand Brain + campaign** | READY (existing onboarding / recommendation / campaign-root; body hashing helper; validator `validate-founder-campaign-release.js`) | A0 done; Fonzo private tuple read back independently; accepted recommendation; body hash | READY pending A0 |
| **A2 customer-visible workflow** | READY (draft, copy, social, intake; validator `fonzo_a2`) | A1 campaign id; **real scanner (D3)**; rights policy (D4); storage bucket; LinkedIn app (for the connection step); WEB build + manifest | **BLOCKED on scanner and provider setup** |
### A0 — exact configuration (private manifest, values never committed)
- **Bridge env (revision A0):** `BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE=true`; `BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID=<founder owner tenant>`; `BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY=fonzo.workspace.v1` (one key, never rotated for retries); `BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME=Fonzo`; `BG_BRIDGE_FOUNDER_AUTH_USER_ID`; target/audience/revision/source/review pins as in `bridge-founder-onboarding-release.example.json`; **every other founder and broad flag false/absent** (startup fails otherwise).
- **Validate (offline):** `node scripts/staging/validate-founder-release07.js /secure/a0.json` with `profile:"workspace"`, three **distinct** GitHub-comment evidence references (`approvalRef`, `independentScopeEvidenceRef`, `rollbackEvidenceRef`) and the private `protectedScope` (Fairway tuple + campaign id). A valid reference is not proof: a reviewer reads each.
- **Invocation (D6, recommended):** the founder, from Cloud Shell, with their own session token typed at a hidden prompt, sends the **one** pinned request to the bridge. The token is never stored or echoed.
```sh
# FUTURE, ONLY AFTER APPROVAL. BRIDGE_URL = the verified bridge URL from §4. Body is exactly the pinned body.
read -rs -p "Founder session access token (hidden): " TOKEN; echo
curl -sS -X POST "$BRIDGE_URL/customer/workspace/brands" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"tenant_id":"<founder owner tenant>","idempotency_key":"fonzo.workspace.v1","business_name":"Fonzo"}' | jq '{status, requires_session_refresh}' ; unset TOKEN
```
  Replay-safe: sending it again (lost response, restart, second operator) returns the **same** workspace. Do not use any other key. Output ids stay private.
- **Safe scope recovery before creation:** read-only `GET $BRIDGE_URL/customer/workspace` (same token) lists the workspaces (private); confirm Fairway is listed and Fonzo is not. After creation the founder identity's trusted scope is Fonzo and the Fairway-pinned bridge profile stops matching it; **returning to Fairway needs `select`, which is deliberately not admitted** — so the plan is: do all Fonzo work, then restore the previous bridge revision for Fairway work only under a new, scoped approval (D1 consequence). No broad selection permission is introduced.
- **Acceptance:** 200 with a workspace; Fairway snapshot unchanged (§4 SQL: Fairway campaigns and fixed-key receipts equal before/after); exactly one new project; replay returns the same project hash.
### A1 — exact configuration
Bridge revision A1: `…ONBOARDING=true`, `…RECOMMENDATIONS=true`, `…CAMPAIGN_ROOT=true` with `BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID/PROJECT_ID/BRAND_ID` = the **new** Fonzo tuple read back independently, and `…BODY_SHA256`; nothing else. Sequence in the Studio as the founder: sign in → Fonzo workspace → save Fonzo Brand Brain (genuine business facts; draft in `test/fixtures/fonzo-acceptance.js` limits claims to what the founder supplied: sugar-free UK soft drinks, 330ml cans, five flavours; **founder to confirm every sentence before saving**) → request campaign recommendation → accept → build the seven-field body privately (`tenant_id, project_id, brand_id, name, goal, display_timezone, idempotency_key=bg-r2-founder-campaign-v1`) → `node scripts/staging/hash-founder-campaign-body.js <private file>` → validate with `validate-founder-campaign-release.js` → one campaign write. The fixed key is namespaced by (tenant, project, actor): the new project makes it unspent; the harness proves Fairway's key stays untouched. Lost response → GET discovery and replay the same body/key only.
### A2 — exact configuration
Bridge revision A2: A1 flags + `…DRAFT_WORKFLOW=true` (+ four pins incl. the new `CAMPAIGN_ID`), `…COPY_EDITING=true`, `…SOCIAL_CONNECTIONS=true`, `…ASSET_INTAKE=true` (+ `BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID/PROJECT_ID/BRAND_ID` = the Fonzo tuple). Validate with `validate-founder-release07.js` `profile:"fonzo_a2"` (A1 root pins and body hash must equal A2's; campaign id new; Fonzo project/brand differ from Fairway).
**API revision (Phase A):** keep existing staging values; add `MEDIA_STORAGE_ENABLED=true` + bucket, `MEDIA_INTAKE_ENABLED=true`, `MEDIA_RIGHTS_POLICY_VERSION=fonzo-staging-rights.v1`, `MEDIA_RIGHTS_POLICY_STATEMENT=<D4 text>`, `MALWARE_SCANNER=clamd`, `MALWARE_SCANNER_HOST`/`PORT` (§10), `SOCIAL_PUBLISHING_ENABLED=true`, `SOCIAL_PLATFORMS=linkedin`, `SOCIAL_TOKEN_KEY_ID` + `SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64` (from Secret Manager, new 32-byte key), `LINKEDIN_CLIENT_ID/SECRET` (Secret Manager), `LINKEDIN_REDIRECT_URI=https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin`, `LINKEDIN_APP_REVIEW_APPROVED=true` **only** when the portal shows the products granted, `LINKEDIN_OAUTH_REVIEW_REF`; `FOUNDER_VIDEO_ACCEPTANCE_ENABLED` absent/false; `BIZGENIE_ENVIRONMENT=staging`. TikTok is **not** enabled (gap G6; needs video runtime).
**WEB:** build from `18119b3f…` with `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION`, a manifest entry for that exact pair (capabilities `contentPlan`, `copyRevisions`, `workspaceCalendar`, `social`, `mediaIntake`, `founderCampaignRoot` only), and flags `VITE_CONTENT_PLAN_API`, `VITE_COPY_EDIT_API`, `VITE_WORKSPACE_CALENDAR_API`, `VITE_SOCIAL_ACCOUNTS_API`, `VITE_CUSTOMER_MEDIA_INTAKE_API`, `VITE_FOUNDER_CAMPAIGN_ROOT_API`, `VITE_SOCIAL_PROVIDERS=linkedin`. Deploy only via the manual `studio-staging-release.yml` with the exact SHA and environment approval; the previous Pages deployment is the rollback.
### Visible journey and acceptance (no external publishing)
| # | Step | Evidence required |
|---|---|---|
| 1 | Founder authentication | signed in as the founder (private) |
| 2 | Fonzo workspace | workspace named Fonzo selected; Fairway untouched |
| 3 | Brand Brain | saved, reload shows it |
| 4 | Campaign recommendation | accepted recommendation |
| 5 | Seven-day plan | `GET …/content-plan`: 7 posts, 5 image slots, 3 video slots; claims only from Brand Brain |
| 6 | Draft content | drafts persist; replay adds nothing |
| 7 | **Genuine artwork intake + authenticated preview** | the five flavour files and transparent logo (supplied by the founder, not synthetic); each asset `ready`; founder-recorded SHA-256 equals the stored SHA-256 (§6 note); preview only to the founder; **shown as "uploaded reference", never as generated creative** |
| 8 | Copy edit | new revision; history kept; approval revoked; stale base conflicts |
| 9 | Review and approval | preview acknowledgement then approval |
| 10 | Schedule and calendar | persists across sign-out/in; scheduling is not publication |
| 11 | LinkedIn connection lifecycle | connect → identity → renew/status → disconnect; **no dispatch/publish** |
Hosted acceptance uses **only** the supplied artwork. The automated harness's synthetic fixture is never accepted as hosted evidence. Uploaded files are rights-attested references; they cannot yet be used inside a campaign creative or a generation (SOURCE), so the visible result of step 7 is intake, preview and a truthful "reference asset" label, not branded creative.

## 6. Build and release candidates (all FUTURE and approval-gated)
0. **Build** from the exact SHAs, from `git archive` (never a dirty directory): API/worker image from API `dfd49116…`; bridge image from API `dfd49116…` (`Dockerfile.studio-bridge`); run `scripts/staging/smoke-studio-bridge.sh` on the bridge image; publish to the existing `cloud-run-source-deploy` repository; **record `image@sha256` for each** and read the digest back from the registry. WEB: manual workflow with the exact WEB SHA (`deploy=false` first = build/verify only).
1. Deploy each new revision with **no traffic and a tag**; smoke through the tag; then, per step, shift traffic. Record before/after traffic tables. Rollback = the recorded previous revision/digest (§8).
2. Per profile, one bridge revision at a time: A0 → (rollback to previous) → A1 → A2. Do not combine with the Phase B video profile.
**SHA-256 note:** the API stores the SHA-256 server-side and does not return it in the customer view. The founder records the SHA-256 of each source file offline (`sha256sum`); an operator compares it with `customer_media_intakes.sha256` in a bounded read-only query by asset id. This avoids changing the customer API.

## 7. Founder decisions — exact wording and consequences
| ID | Decision (answer YES/NO in #191) | Consequence |
|---|---|---|
| **D1** | "I approve creating ONE separate Fonzo workspace (project + brand) inside my existing owner tenant, using the pinned key `fonzo.workspace.v1`, via the founder-only bridge permission, and I accept that my founder identity's active scope then becomes Fonzo." | Irreversible in practice: there is **no delete operation**; removal would need a separately approved operator action. Fairway data and campaign are untouched, but Fairway-pinned bridge revisions stop matching your identity; switching back needs a separate `select` approval. Replays are safe. |
| **D2** | "I approve the narrow default-OFF bridge permissions for the workspace request and for asset intake (pinned to the Fonzo scope), and I do not approve any broad workspace selection, write, delete or revoke permission." | Exactly the merged source; no broader write path. |
| **D3** | "Genuine artwork may be uploaded only when a real malware scanner is running; I do NOT approve the unscanned bypass." | **Blocks A2 intake** until a clamd service exists and is verified fresh (§10). Fails closed meanwhile. Accepting unscanned mode instead would be a separate, explicit security exception (not recommended: staging data is shared). |
| **D4** | "I confirm Fonzo owns, or has licensed to BizGenie for marketing use, every file I upload, and I approve the rights statement in the API configuration." Proposed statement: *"I confirm I own, or am licensed to use, this file for marketing this brand on BizGenie, and that it contains no third-party material I do not have permission to use."* | Customer attestation only (recorded as `customer_attestation`). Note the existing policy also marks uploads usable as **reference for image/video generation**; nothing generates from them in Phase A. |
| **D5** | "I accept the existing staging token vault (AES-256-GCM, key from Secret Manager via the staging-only environment key provider) for LinkedIn tokens in the shared staging database, as a staging-only exception; production needs the KMS design." | The environment key provider is documented as for *disposable isolated* staging; this staging database is shared and the runtime role bypasses RLS. Security verification before YES: key only in Secret Manager, not logged, rotation = new key id (old tokens unusable → reconnect), LinkedIn tokens expire in about 60 days. |
| **D6** | "I will make the single A0 workspace request myself from Cloud Shell with my own session token (hidden prompt), using the pinned body; no token is stored or pasted into chat." | Acceptable invocation without new WEB code. A WEB button is optional later work. |
| D7 | (Phase B only, separate checkpoint) §9. | — |
Not covered by any of the above: external publishing, Stripe, TikTok, paid generation, `select`, cleanup of Sprint10C.

## 8. Rollback
| Layer | Rollback |
|---|---|
| Bridge | restore traffic to the recorded previous bridge revision (digest recorded in §4/§6); the A0/A1/A2 revisions are tagged and kept |
| API | restore traffic to the recorded previous API revision; the idempotency field is additive, older revisions refuse it (nothing created) |
| WEB | Cloudflare Pages: roll back to the previous deployment id recorded in §4 |
| Data | Fairway: untouched by design. Fonzo workspace/campaign/assets: **not deletable through any admitted route**; leave in place or remove only by a separately approved operator action. Uploaded assets can be revoked/deleted only through routes that are not admitted in these profiles |
| Founder scope | after Fonzo work, return to Fairway work by deploying the previous Fairway profile **and** (if the identity must change scope) a separately approved `select`; recovery procedure in `BG_FOUNDER_RELEASE_07.md` §2 |
Rule: roll back only the explicitly recorded change, only if traffic still matches the owned change.

## 9. Phase B (prepared, not executed) — and stop conditions
Phase B needs its own API revision and bridge profile (video attachment, one-job pin); media intake, social publishing, image generation, Stripe and learning must be **off** in that API revision; draft and video bridge profiles cannot be combined. Verify before any approval (all NOT VERIFIED today): spend migration applied and role `bizgenie_provider_spend_runtime` (NOLOGIN, no memberships, forced RLS) with a dedicated approved login; policy row (£100 monthly cohort cap = 10000p, ten customers) and the founder cohort slot; current price and FX authority (`estimateAuthority`); founder entitlement unexpired and ≥ 5 credits; worker running with bubblewrap isolation; private bucket (`VIDEO_PROVIDER_OUTPUT_STORAGE_URI`); attachment and authenticated playback; a drill that restores the Phase A profile. Retain the **single four-second, 720p, 9:16, silent technical test**: one submit, ≤ 10 status observations ≥ 25 s apart, 5 credits, ≤ £5 (500p) conditional exposure, separate approval. It is **not** a finished Fonzo advertisement and uses no uploaded artwork (supplied assets are rejected on that path).
**Shortest path to premium creative (engineering estimates, each needs scoped approval):** (1) reference-assisted *image* hero shot — the customer quote path already accepts supplied reference assets (`creativeAdapter` → image reference assets, rights `image.generate.reference`); the founder bridge admits none of it, so a narrow founder image-quote/confirm permission with its own budget cap and its own price/FX evidence: ~1–2 days + review; (2) deterministic branding and composition (exact pack/logo pixels, typography, CTA, transitions) — a production compositor does not exist (fixture only): ~3–5 days plus design approval; (3) multi-clip assembly and preview/approval of finished video: ~2–3 days; (4) quality acceptance by the founder on real Fonzo output with all attempts costed (cost per usable commercial is UNKNOWN until measured). Do not expand the 500p one-job cap to three commercials.
**Stop conditions (any one halts execution):** inventory shows a digest, traffic or tag that does not match the plan; a Fonzo project already exists or Fairway fixed-key receipts ≠ 1; any broad flag true; bridge/API 403/2xx on a route not in the profile; scanner unavailable or stale; asset `rejected` or SHA-256 mismatch; a second workspace for the pinned key; token or private id in any output; Sprint10C artefacts changed; any unexpected provider call or credit movement.

## 10. Genuinely blocking issues
1. **No real malware scanner.** `MALWARE_SCANNER=clamd` needs a ClamAV daemon reachable over TCP (INSTREAM; the adapter refuses stale signatures older than 72 h and fails closed). Source shows none deployed. Shortest path (to be verified and approved, an infrastructure change): run a pinned `clamav` image as a **sidecar container in the API Cloud Run revision** so `MALWARE_SCANNER_HOST=127.0.0.1`, with signature updates working from the revision's egress. Estimated 0.5 day to prepare and review the revision spec, 1–2 h to deploy and prove an infected-test-file and stale-signature refusal. Until then, intake stays OFF (A0/A1 are unaffected).
2. **No approved invocation for A0** — resolved by D6 (no code).
3. **LinkedIn app/products not evidenced** — founder portal work (OpenID Connect + Share on LinkedIn, redirect URL, legal pages); the LinkedIn connection step (11) waits on it; steps 1–10 do not. Provider docs hosts could not be read from the build container; items marked CONFIRM in `BG_SOCIAL_LAUNCH_CLOSURE_01.md` remain to be confirmed in the portal.
4. **Inventory not performed** — needs one credentialed run of §4.
Not blocking but noted: uploaded artwork cannot be a campaign creative yet (by design); WEB has no workspace-create button; `select` not admitted; TikTok deferred; token-vault exception (D5).

## 11. Single activation approval checkpoint
Founder actions, in order: (a) run §4 and paste redacted output into #191 (~30–45 min); (b) answer D1–D6; (c) approve builds (§6.0). Then execute with an operator: A0 (~45 min incl. bridge revision, one request, readback) → A1 (~1–1.5 h) → [scanner sidecar approved/prepared] → A2 (~2 h) → browser acceptance of steps 1–11 (~1–2 h; step 11 after LinkedIn setup). Realistic elapsed time once approvals exist: **A0+A1 about half a day; full visible journey about 1–1.5 days** (scanner and LinkedIn setup being the long poles). Phase B afterwards: 30–60 min plus provider latency, after its own evidence and approval.

## 12. Governance payload (Mission Control write access was not available; nothing below is claimed recorded)
Checkpoint id `BG-RELEASE08-ACTIVATION-PREP-20261125`. Source of truth links: this document, API `dfd49116…`, WEB `18119b3f…`, #191.
| Tab | Row text |
|---|---|
| DASHBOARD / CONFIG | Current BG task → BG-RELEASE08 (activation prep); target: controlled founder staging activation; NO-GO until §4 inventory passes |
| CURRENT_STATUS | "Founder staging activation packet" — SOURCE GO / RUNTIME NO-GO; evidence: this doc + #191 comment; verified: no automatic deploy in API repo, WEB release manual-only, last WEB deployment 8 Nov `ce8694e1`; next: operator §4 |
| PHASE_PLAN | A0 → A1 → A2 → Phase B (separate); status: prepared |
| LAUNCH_BLOCKERS | add: real malware scanner absent (P0 for intake); LinkedIn app/products unevidenced; operator inventory outstanding; keep Sprint10C HOLD |
| TASK_REGISTER | BG-RELEASE08: PREPARED; deps D1–D6, inventory; next action: founder runs §4 |
| TECHNICAL_DEBT | WEB lacks workspace-create call; `select` not admitted; env token-vault key (staging only); production KMS; uploaded reference assets not usable as creative |
| VERSION_REGISTER | API main `dfd49116`; WEB main `18119b3f`; no deployed image digests recorded yet |
| SOURCE_REGISTRY | link this packet and #191 comment |
| EVIDENCE_REGISTER | GitHub-side deployment evidence (0 API deployments; WEB 8 Nov); no cloud evidence |
| SESSION_LOG / EOD_REPORT | preparation only; nothing executed |
| DECISION_LOG | pending D1–D6 (not decided) |
| AUDIT_LOG | access limits: no credentialed cloud account; Mission Control read-only |
| CHECKPOINT_INDEX | BG-RELEASE08-ACTIVATION-PREP-20261125 |
| LOCK_REGISTER, BACKUP_REGISTER, ACTIVE_CLOSURE | no change (ACTIVE_CLOSURE BG-017C cleanup HOLD unchanged; accepted PASS records untouched) |
