# BG-FOUNDER-RELEASE-08 — final operator readiness and Fonzo activation packet

25 Nov 2026 (revision 2, after independent review `#270` comment 7172089095 and #191 comments 7172088275 / 7172108434). **PREPARATION ONLY: nothing here was executed against cloud, database, provider, social or customer systems.** No deployment, workspace, upload, connection, dispatch, paid generation, Stripe change, IAM change or security bypass is authorised by this document. Sprint10C temporary-secret cleanup remains HOLD. Public launch and paid video remain NO-GO.
Evidence classes: **VERIFIED** (read directly) · **SOURCE** (read in merged source) · **NOT VERIFIED** (needs credentialed operator access).

## 1. Verdict
| Question | Answer |
|---|---|
| Source | **GO.** API main `dfd49116a0fe6bde11dbc25ca4599a03b8046999` and WEB main `18119b3fd9eec2283ab4f8910848dfda81c49dc0` are merged and independently accepted. No new defect. |
| Runtime | **NO-GO until the §4 inventory passes.** Live Cloud Run, digests, traffic, flags, scanner and database state are NOT VERIFIED. |
| Serving Studio | **Not the merged source.** The active Cloudflare Pages deployment is the 8 Nov build (§3). Nothing from the merges is serving anywhere on the evidence available. |
| Controlled activation | **GO to request approval now; GO to execute A0/A1 after the inventory passes and §5 is answered.** A2 intake waits on the scanner (§9); the LinkedIn step waits on the callback host and LinkedIn app (§10). |

## 2. Source and deployment-candidate bindings
| Item | Exact value | State |
|---|---|---|
| API main / WEB main | `dfd49116a0fe6bde11dbc25ca4599a03b8046999` / `18119b3fd9eec2283ab4f8910848dfda81c49dc0` | VERIFIED merged |
| API #267, #269; WEB #94 (W1) | merged, source-accepted | VERIFIED |
| API #268 (Release 06 handoff) | draft, head `101930e29eec168d3ae1f0fb85ee289f77d53761` | superseded where it differs from this packet |
| **Serving WEB (Cloudflare Pages)** | project `bizgenie-studio-staging`, deployment `e312dee7-f3d4-44e8-be5f-e615db91b7e6`, commit **`ce8694e1c5cc47849d8f2b9f8b7bf7169949248e`** (8 Nov) | VERIFIED (independent connector readback, #191 7172088275). **Not** the accepted main |
| Serving API / bridge / worker | revision, digest, traffic, tags | NOT VERIFIED (§4) |
| Images and manifests | none built or published; built only from the SHAs above after approval E1; private manifests hold real values and are never committed | NOT PRODUCED |

## 3. Verified evidence (no cloud access needed; not repeated)
- **Cloudflare Pages (VERIFIED, #191 7172088275):** production branch `main`; `latest_deployment` and `canonical_deployment` are both `e312dee7-f3d4-44e8-be5f-e615db91b7e6`, created `2026-11-08T22:17:05Z`, environment `production`, source commit `ce8694e1c5cc47849d8f2b9f8b7bf7169949248e`, successful; the project lists only **three** deployments, newest 8 Nov; the project has **no Git source object** (`source:null`), so no Git-based automatic deployment is established, and the PR "Cloudflare Pages" checks do not prove one; the project's **custom-domain list is empty**; the authenticated account has **no managed `getbizgenie.com` zone**.
  **Consequences:** (a) no automatic deployment followed the merges; (b) merged WEB main is not serving; (c) `staging-app.getbizgenie.com` is not attached to this Pages project (DNS lives elsewhere), which matters only for the LinkedIn callback (§10); (d) the Studio is currently reachable at the project's `pages.dev` host, which the bridge also permits as an origin.
- **GitHub:** API repo has no deploy workflow and 0 recorded deployments; WEB staging release is `workflow_dispatch`-only behind the `staging-studio` environment reviewers (last recorded WEB deployment 8 Nov `ce8694e1`). CI: API main push success; WEB final head Frontend CI success on attempt 2 (controlled rerun) and accessibility success.
- **Scanner:** *source/recorded evidence shows no scanner and no ClamAV service* (an observation about the repository and the Release 05 record); the **live** state is NOT VERIFIED until §4 prints the API revision's containers and `MALWARE_SCANNER*` names.

## 4. ONE consolidated read-only inventory (founder, Cloud Shell, about 30–45 minutes)
One complete block. It pins `bizgenie-backend` / `europe-west1` and refuses any other region, never calls `me-central2`, uses read-only verbs only, prints **names, states, digests, counts and 8-character hashes only** (no values, tokens, emails, service URLs or private identifiers), assigns every revision variable from observed output before use (validated, `set -u` safe), skips the SQL phase with a clear message unless you have already exported `APP_DB_URL` and `FOUNDER_AUTH_USER` from your own authorised route, and sets the session read-only. It was tested here against stubbed `gcloud` output, a fresh `env -i` shell and a local database built from the repository migrations (data path, spend-tables-absent path, bad inputs, read-only guard, no identifier leakage).
```bash
#!/usr/bin/env bash
# BG-RELEASE08 consolidated READ-ONLY inventory v2. Run in Cloud Shell as the founder's already-authorised account. Changes nothing.
# Prints names, states, digests and counts only: no secret values, tokens, emails, URLs or private identifiers (identifiers appear as 8-character hashes).
# Everything is pinned to project bizgenie-backend / region europe-west1. Any failing step prints "FAILED:" and the script continues.
set -uo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; BRIDGE_SVC=bizgenie-studio-bridge-staging
API_SERVING=""; API_ROLLBACK=""; BRIDGE_SERVING=""; BRIDGE_ROLLBACK=""      # assigned from observed output below (never from memory)
FAILED=0; fail() { echo "FAILED: $*"; FAILED=$((FAILED+1)); }
hash8() { printf %s "$1" | sha256sum | cut -c1-8; }
[ "$R" = "europe-west1" ] || { echo "REFUSED: region must be europe-west1"; exit 1; }
for t in gcloud jq curl sha256sum; do command -v "$t" >/dev/null 2>&1 || { echo "MISSING TOOL: $t"; exit 1; }; done
[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)" ] || { echo "NO ACTIVE gcloud ACCOUNT: log in with your existing account, then rerun"; exit 1; }
valid_rev() { [[ "$1" =~ ^[a-z0-9-]{3,100}$ ]]; }
echo "### PHASE 1 - services (region $R)"
gcloud run services list --project="$P" --region="$R" --format='value(metadata.name)' || fail "services list"
gcloud run jobs list --project="$P" --region="$R" --format='value(metadata.name)' || fail "jobs list"
for S in "$API_SVC" "$BRIDGE_SVC"; do
  echo "== service $S"
  J=$(gcloud run services describe "$S" --project="$P" --region="$R" --format=json 2>/dev/null) || J=""
  if [ -z "$J" ]; then fail "describe $S"; continue; fi
  LATEST=$(jq -r '.status.latestReadyRevisionName // ""' <<<"$J")
  SERVING=$(jq -r --arg l "$LATEST" '[.status.traffic[]? | select((.percent // 0) > 0) | (.revisionName // (if .latestRevision == true then $l else empty end))] | unique | join(" ")' <<<"$J")
  jq '{url:(if (.status.url // "") == "" then "none" else "present" end), ingress:(.metadata.annotations["run.googleapis.com/ingress"] // "unset"), traffic:[.status.traffic[]? | {revision:(.revisionName // "LATEST"), percent, tag:(.tag // null)}], latestReady:.status.latestReadyRevisionName, serviceAccount:((.spec.template.spec.serviceAccountName // "default") | split("@")[0]), containers:[.spec.template.spec.containers[]? | {name, image, envNames:[.env[]? | .name], envFromSecretNames:[.env[]? | select(.valueFrom != null) | .name]}]}' <<<"$J"
  echo "serving revision(s): ${SERVING:-NONE}"
  REVS=$(gcloud run revisions list --service="$S" --project="$P" --region="$R" --limit=8 --format=json 2>/dev/null) || REVS="[]"
  jq -r '.[] | [.metadata.name, ((.status.conditions // [])[] | select(.type == "Ready") | .status), .metadata.creationTimestamp] | @tsv' <<<"$REVS"
  # Rollback CANDIDATE = newest Ready revision that is not serving. It is a candidate only: the founder confirms it is the last known-good one.
  CAND=$(jq -r --arg serving "$SERVING" '[.[] | .metadata.name as $n | select(((.status.conditions // [])[] | select(.type == "Ready") | .status) == "True") | select(($serving | split(" ") | index($n)) == null)] | sort_by(.metadata.creationTimestamp) | reverse | .[0].metadata.name // ""' <<<"$REVS")
  first="${SERVING%% *}"
  if [ "$S" = "$API_SVC" ]; then API_SERVING="$first"; API_ROLLBACK="$CAND"; else BRIDGE_SERVING="$first"; BRIDGE_ROLLBACK="$CAND"; fi
  echo "IAM (members redacted):"
  gcloud run services get-iam-policy "$S" --project="$P" --region="$R" --format=json 2>/dev/null | jq '[.bindings[]? | {role, members:[.members[] | if startswith("user:") then "user:<redacted>" elif startswith("serviceAccount:") then ("serviceAccount:" + (sub("serviceAccount:";"") | split("@")[0])) else . end]}]' || fail "iam $S"
done
echo "### PHASE 2 - digests and flag-name checks for the revisions observed above"
for pair in "API_SERVING:$API_SERVING" "API_ROLLBACK_CANDIDATE:$API_ROLLBACK" "BRIDGE_SERVING:$BRIDGE_SERVING" "BRIDGE_ROLLBACK_CANDIDATE:$BRIDGE_ROLLBACK"; do
  label="${pair%%:*}"; rev="${pair#*:}"
  if [ -z "$rev" ]; then echo "$label: NONE OBSERVED"; continue; fi
  if ! valid_rev "$rev"; then fail "$label has an unexpected name"; continue; fi
  echo "$label: $rev"
  gcloud run revisions describe "$rev" --project="$P" --region="$R" --format=json 2>/dev/null | jq '{imageDigest:.status.imageDigest, created:.metadata.creationTimestamp, containers:[.spec.containers[]? | {name, image, memory:.resources.limits.memory, cpu:.resources.limits.cpu}], envNames:[.spec.containers[]?.env[]? | .name] | unique}' || fail "describe revision $rev"
done
if [ -n "$API_SERVING" ] && valid_rev "$API_SERVING"; then
  echo "### API flag-name checks (names only): scanner bypass names must be ABSENT; this prints which of the watched names exist"
  gcloud run revisions describe "$API_SERVING" --project="$P" --region="$R" --format=json 2>/dev/null | jq -r '[.spec.containers[]?.env[]? | .name] | unique | map(select(test("^(MEDIA_INTAKE_ALLOW_UNSCANNED|MEDIA_INTAKE_STRUCTURAL_INSPECTION|MALWARE_SCANNER.*|MEDIA_INTAKE_ENABLED|MEDIA_STORAGE_ENABLED|SOCIAL_PUBLISHING_ENABLED|SOCIAL_PLATFORMS|FOUNDER_VIDEO_ACCEPTANCE_ENABLED|VIDEO_GENERATION_ENABLED|STRIPE_BILLING_ENABLED|SOCIAL_TOKEN_.*|LINKEDIN_.*|TIKTOK_.*)$"))) | .[]' || fail "api flag names"
fi
if [ -n "$BRIDGE_SERVING" ] && valid_rev "$BRIDGE_SERVING"; then
  echo "### Bridge permission settings (names and true/false only)"
  gcloud run revisions describe "$BRIDGE_SERVING" --project="$P" --region="$R" --format=json 2>/dev/null | jq -r '[.spec.containers[]?.env[]? | select(.name | test("^BG_BRIDGE_(ALLOW_.*)$")) | "\(.name)=\(if (.value // "") == "true" then "true" elif (.value // "") == "false" then "false" elif .valueFrom != null then "from-secret" else "set" end)"] | sort | .[]' || fail "bridge flags"
fi
echo "### PHASE 3 - registry digests, secrets (names/state), storage (metadata), Sprint10C artefact names"
gcloud artifacts docker images list "europe-west1-docker.pkg.dev/$P/cloud-run-source-deploy" --include-tags --limit=25 --format=json 2>/dev/null | jq -r '.[] | [(.package | split("/") | last), (.version | .[0:19]), ((.tags // []) | join(",")), .updateTime] | @tsv' || fail "artifact registry list"
for N in $(gcloud secrets list --project="$P" --format='value(name)' 2>/dev/null | grep -Ei 'social|linkedin|tiktok|token|clam|media|bg017c|s09b|temporary' || true); do
  echo "secret ${N##*/}: $(gcloud secrets versions list "${N##*/}" --project="$P" --limit=1 --format='value(state,createTime)' 2>/dev/null)"
done
gcloud storage buckets list --project="$P" --format='table(name,location,uniform_bucket_level_access,public_access_prevention)' 2>/dev/null || fail "buckets"
echo "### PHASE 4 - public DNS and callback host (no authentication)"
for H in staging-app.getbizgenie.com staging-api.getbizgenie.com getbizgenie.com; do
  if command -v dig >/dev/null 2>&1; then echo "$H CNAME=$(dig +short CNAME "$H" | head -1) A=$(dig +short A "$H" | head -2 | tr '\n' ' ')"; else echo "$H $(getent hosts "$H" | head -1 | awk '{print $1}')"; fi
done
echo "callback path: HTTP $(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin 2>/dev/null || echo unreachable)"
echo "pages.dev: HTTP $(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://bizgenie-studio-staging.pages.dev/ 2>/dev/null || echo unreachable)"
echo "### PHASE 5 - application-pool read-only SQL (skipped unless APP_DB_URL and FOUNDER_AUTH_USER were exported by YOUR existing authorised route)"
if [ -z "${APP_DB_URL:-}" ] || [ -z "${FOUNDER_AUTH_USER:-}" ]; then
  echo "SQL SKIPPED: export APP_DB_URL and FOUNDER_AUTH_USER first (neither is printed), then rerun this block"
elif ! [[ "$FOUNDER_AUTH_USER" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "SQL SKIPPED: FOUNDER_AUTH_USER is not a UUID"
elif ! command -v psql >/dev/null 2>&1; then
  echo "SQL SKIPPED: psql is not installed"
else
  SQL=$(mktemp); trap 'rm -f "$SQL"' EXIT
  cat >"$SQL" <<'SQL'
\set ON_ERROR_STOP on
\pset footer off
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
-- prerequisites: server version (built-in sha256 needs 11+) and the sha256 function itself
select current_setting('server_version_num')::int >= 110000 as version_ok \gset
\if :version_ok
select left(encode(sha256('probe'::bytea), 'hex'), 8) as sha256_probe;
select current_user as effective_role, session_user as session_role, (select rolsuper from pg_roles where rolname = current_user) as is_superuser, (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls;
select (to_regclass('public.tenant_memberships') is not null and to_regclass('public.projects') is not null and to_regclass('public.brand_brains') is not null
  and to_regclass('public.campaigns') is not null and to_regclass('public.campaign_command_receipts') is not null and to_regclass('public.tenant_entitlements') is not null) as core_ok \gset
\if :core_ok
select left(encode(sha256(p.project_id::bytea), 'hex'), 8) as project_h, p.name as project_name, b.status as brand_status,
  (select count(*) from public.campaigns c where c.project_id = p.project_id) as campaigns,
  (select count(*) from public.campaign_command_receipts r where r.project_id = p.project_id and r.idempotency_key = 'bg-r2-founder-campaign-v1') as fixed_key_receipts
from public.tenant_memberships m join public.projects p on p.tenant_id = m.tenant_id join public.brand_brains b on b.project_id = p.project_id
where m.auth_user_id = :'FOUNDER_AUTH_USER'::uuid order by p.created_at;
select e.status as entitlement_status, e.reference_period_end, e.included_monthly_credit_grant
from public.tenant_entitlements e join public.tenant_memberships m on m.tenant_id = e.tenant_id where m.auth_user_id = :'FOUNDER_AUTH_USER'::uuid and m.role = 'owner';
\else
\echo CORE TABLES MISSING: stop and report
\endif
select to_regclass('public.customer_media_intakes') is not null as intake_table_present;
select to_regclass('public.provider_spend_policy') is not null and to_regclass('public.provider_spend_customers') is not null and to_regclass('public.provider_spend_reservations') is not null as has_spend \gset
select :'has_spend' as spend_tables_present;
\if :has_spend
select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('provider_spend_policy', 'provider_spend_customers', 'provider_spend_reservations') order by 1;
select r.rolname, r.rolcanlogin, r.rolinherit, r.rolsuper, r.rolbypassrls, (select count(*) from pg_auth_members x where x.member = r.oid) as parent_memberships from pg_roles r where r.rolname = 'bizgenie_provider_spend_runtime';
select version, enabled, cap_minor, customer_limit, valid_from, valid_until, (select string_agg(k, ',' order by k) from jsonb_object_keys(estimates) k) as estimate_keys from public.provider_spend_policy;
select (select count(*) from public.provider_spend_customers) as cohort_rows, (select count(*) from public.provider_spend_reservations) as reservations;
\endif
\else
\echo SERVER TOO OLD FOR sha256: stop and report
\endif
rollback;
SQL
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -q -v ON_ERROR_STOP=1 -v FOUNDER_AUTH_USER="$FOUNDER_AUTH_USER" -f "$SQL" "$APP_DB_URL" || fail "sql inventory"
fi
echo "### DONE: $FAILED step(s) failed. Paste everything above into issue #191. Credit balance: read it in the Studio billing state (not here)."
```
**Pass rubric (stop and report if any line fails):** one serving revision per service at 100%; no unexpected tags; the API and bridge serving digests and the two rollback **candidates** recorded (the founder confirms each candidate is the last known-good); bridge `BG_BRIDGE_ALLOW_*` flags false except those you expect; `MEDIA_INTAKE_ALLOW_UNSCANNED` and `MEDIA_INTAKE_STRUCTURAL_INSPECTION` **absent**; the founder owns exactly the Fairway workspace and it has exactly **one** fixed-key receipt; no Fonzo project exists; spend tables either absent (Phase B stays blocked) or role `bizgenie_provider_spend_runtime` NOLOGIN, no parent memberships, forced RLS; Sprint10C secrets still present and untouched; `staging-app` DNS/HTTP result recorded (expected today: not routed to Pages).

## 5. Consolidated approval checkpoint (reply in #191, one line per item)
| ID | Exact wording | Consequence |
|---|---|---|
| **D1** | "I approve creating ONE separate Fonzo workspace (project + brand) inside my existing owner tenant, with the pinned key `fonzo.workspace.v1`, and I accept that my founder identity's active scope then becomes Fonzo until I restore it with the §8 procedure." | No delete operation exists: removal needs a separate operator action. Replays are safe. Fairway data/campaign untouched. **Rolling back the bridge does not restore identity scope** (§8). |
| **D2** | "I approve the narrow default-OFF founder bridge permissions for the workspace request and asset intake, pinned to the Fonzo scope. I do not approve any broad selection, write, delete or revoke permission." | Merged source only. |
| **D3** | "Genuine artwork may be uploaded only while a real malware scanner passes the §9 acceptance; I do NOT approve any unscanned bypass." | A2 intake stays OFF until §9 passes; failing closed meanwhile. |
| **D4** | "I confirm Fonzo owns, or has licensed to BizGenie for marketing use, every file I upload, and I approve this statement: *I confirm I own, or am licensed to use, this file for marketing this brand on BizGenie, and that it contains no third-party material I do not have permission to use.*" | Customer attestation only. Policy also marks uploads usable as references for image/video generation; nothing generates from them in Phase A. |
| **D5** | "I accept the existing staging token vault (AES-256-GCM, environment key from Secret Manager) for LinkedIn tokens in the **shared** staging database as a staging-only exception, after the security checks below pass." | **Not implied by any other approval.** The environment key provider is documented for disposable isolated staging; this database is shared and the runtime role bypasses RLS. Checks before YES: key only in Secret Manager and a new 32-byte value; not logged; key rotation = new key id (existing tokens unusable, reconnect); LinkedIn tokens last about 60 days; production needs the KMS design. If you do not approve, the LinkedIn connection step is skipped and everything else proceeds. |
| **D6** | "I will make the single A0 workspace request and any §8 restore request myself from Cloud Shell, with my own session token typed at a hidden prompt." | No new WEB code. |
Enabling approvals, separate from D1–D6 (each is an infrastructure change): **E1** build and publish images from `dfd49116…` (API/bridge) and run the manual WEB workflow for `18119b3f…`; **E2** deploy new revisions with no traffic and a tag, then shift traffic per step; **E3** create the new Secret Manager secrets named in §10 and grant the runtime service account read access to those secrets only (no other IAM change); **E4** the §9 scanner sidecar revision settings. Not covered by anything: external publishing, Stripe, TikTok, paid generation, `select` through the bridge, Sprint10C cleanup, any unscanned mode.

## 6. Exact activation sequence (each step gates the next; stop on any stop condition)
| # | Step | Owner | Gate / evidence | Time |
|---|---|---|---|---|
| 0 | Run §4; paste output in #191 | Founder | pass rubric | 30–45 min |
| 1 | Answer §5 | Founder | recorded in #191 | 15 min |
| P1 (parallel) | Scanner sidecar: prepare revision spec from §9, independent review | Operator | spec accepted | 0.5 day |
| P2 (parallel) | LinkedIn app + Pages custom domain + DNS (§10) | Founder | portal + DNS evidence | hours to days (external) |
| 2 | E1 builds; record `image@sha256`; WEB `deploy=false` verify | Operator | digests read back | 1–2 h |
| 3 | §8 pre-creation proof (read-only) | Founder | P1–P4 pass | 20 min |
| 4 | **A0** bridge revision (no traffic → tag → shift); one workspace request; readback | Operator + Founder | Fairway snapshot unchanged; one new project; replay returns same | 45 min |
| 5 | **A1** bridge revision: Brand Brain, recommendation, one campaign write | Operator + Founder | campaign id recorded privately; Fonzo tuple independently read back first | 1–1.5 h |
| 6 | **A2**: API revision (intake + scanner sidecar + social), bridge A2, WEB deploy of `18119b3…` with manifest entry for that exact pair | Operator | §9 T1–T3 pass; validator `fonzo_a2` | 2–3 h |
| 7 | Hosted acceptance, journey steps 1–10 (pages.dev origin allowed) | Founder | recorded evidence | 1–2 h |
| 8 | Step 11 LinkedIn lifecycle | Founder | after P2 and D5 | 30 min |
| 9 | Decide Phase B | Founder | separate approval | — |
### Journey (no external publishing; only the founder-supplied artwork is accepted as hosted evidence)
1 sign in · 2 Fonzo workspace · 3 Brand Brain saved and reloaded · 4 campaign recommendation · 5 seven-day plan (7 posts, 5 image slots, 3 video slots; claims only from Brand Brain) · 6 drafts persist, replay adds nothing · 7 the five flavour files and transparent logo upload, each `ready`, founder-recorded SHA-256 equals stored SHA-256, previews only for the founder, labelled **uploaded reference asset**, never generated creative · 8 copy edit (new revision, history kept, approval revoked) · 9 review and approval · 10 schedule and calendar persist across sign-out/in · 11 LinkedIn connect → identity → status/renew → disconnect, no dispatch. Uploaded files cannot yet be a campaign creative or a generation input under any admitted route. SHA-256 check: the founder records `sha256sum` of each file; an operator compares it with `customer_media_intakes.sha256` in a bounded read-only query by asset id.
### A0 / A1 / A2 configuration (private manifests; real values never committed)
- **A0 bridge:** `BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE=true`, `BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID`, `BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY=fonzo.workspace.v1`, `BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME=Fonzo`, `BG_BRIDGE_FOUNDER_AUTH_USER_ID`, plus the pins in `bridge-founder-onboarding-release.example.json`; every other founder/broad flag false. Validate: `node scripts/staging/validate-founder-release07.js /secure/a0.json` (`profile:"workspace"`, three distinct evidence references, private `protectedScope`). A valid reference is not proof; a reviewer reads each.
- **A0 request (D6):**
```bash
# FUTURE, ONLY AFTER D1/D2/D6 AND THE §8 PRE-CREATION PROOF. BRIDGE_URL from the §4 service readback (kept private). The body is exactly the pinned body.
read -rs -p "Founder session access token (hidden): " TOKEN; echo
curl -sS -X POST "$BRIDGE_URL/customer/workspace/brands" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data '{"tenant_id":"<founder owner tenant>","idempotency_key":"fonzo.workspace.v1","business_name":"Fonzo"}' | jq '{status, requires_session_refresh}'; unset TOKEN
```
  Replay-safe: repeating it (lost response, restart, second operator) returns the same workspace; never use another key. The workspace ids stay private. After it, sign out and in (the trusted scope is now Fonzo).
- **A1 bridge:** `…ONBOARDING=true`, `…RECOMMENDATIONS=true`, `…CAMPAIGN_ROOT=true` with `BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID/PROJECT_ID/BRAND_ID` = the Fonzo tuple read back independently, and `…BODY_SHA256`; nothing else. Seven-field body: `tenant_id, project_id, brand_id, name, goal, display_timezone, idempotency_key=bg-r2-founder-campaign-v1` (the fixed key is unspent in the new project; Fairway's stays spent and untouched); hash with `node scripts/staging/hash-founder-campaign-body.js <private file>`; validate with `validate-founder-campaign-release.js`. Brand Brain facts come only from what the founder supplied (sugar-free UK soft drinks, 330ml cans, the five flavours); the founder confirms every sentence before saving. Lost response: GET discovery then replay the same body/key.
- **A2 bridge:** A1 flags + `…DRAFT_WORKFLOW=true` (+ four pins incl. the new campaign id), `…COPY_EDITING=true`, `…SOCIAL_CONNECTIONS=true`, `…ASSET_INTAKE=true` (+ `BG_BRIDGE_FOUNDER_INTAKE_TENANT_ID/PROJECT_ID/BRAND_ID`). Validate with `profile:"fonzo_a2"` (A1 root pins and body hash must equal A2's; new campaign id; Fonzo project/brand differ from Fairway's).
- **A2 API revision:** existing staging values retained, plus `MEDIA_STORAGE_ENABLED=true` + bucket, `MEDIA_INTAKE_ENABLED=true`, `MEDIA_RIGHTS_POLICY_VERSION=fonzo-staging-rights.v1`, `MEDIA_RIGHTS_POLICY_STATEMENT=<D4 text>`, `MALWARE_SCANNER=clamd`, `MALWARE_SCANNER_HOST=127.0.0.1`, `MALWARE_SCANNER_PORT=3310`, and (LinkedIn step only) `SOCIAL_PUBLISHING_ENABLED=true`, `SOCIAL_PLATFORMS=linkedin`, `SOCIAL_TOKEN_KEY_ID` + `SOCIAL_TOKEN_ENCRYPTION_KEY_BASE64` (secret), `LINKEDIN_CLIENT_ID/SECRET` (secrets), `LINKEDIN_REDIRECT_URI`, `LINKEDIN_APP_REVIEW_APPROVED=true` only after the portal shows the products granted, `LINKEDIN_OAUTH_REVIEW_REF`. `FOUNDER_VIDEO_ACCEPTANCE_ENABLED` absent/false; `MEDIA_INTAKE_ALLOW_UNSCANNED` and `MEDIA_INTAKE_STRUCTURAL_INSPECTION` absent. TikTok is not enabled.
- **WEB (manual workflow, exact SHA `18119b3f…`, environment approval):** `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION`, a manifest entry for that exact pair (`contentPlan`, `copyRevisions`, `workspaceCalendar`, `social`, `mediaIntake`, `founderCampaignRoot` only) and `VITE_CONTENT_PLAN_API`, `VITE_COPY_EDIT_API`, `VITE_WORKSPACE_CALENDAR_API`, `VITE_SOCIAL_ACCOUNTS_API`, `VITE_CUSTOMER_MEDIA_INTAKE_API`, `VITE_FOUNDER_CAMPAIGN_ROOT_API`, `VITE_SOCIAL_PROVIDERS=linkedin`. The previous Pages deployment `e312dee7-f3d4-44e8-be5f-e615db91b7e6` is the rollback.

## 7. Builds (E1; FUTURE)
From `git archive` of the exact SHA, never a dirty directory: API/worker image and bridge image (`Dockerfile.studio-bridge`) from `dfd49116…`; run `scripts/staging/smoke-studio-bridge.sh` on the bridge image; publish to the existing `cloud-run-source-deploy` repository; record `image@sha256` and read it back from the registry. WEB: `studio-staging-release.yml` with the exact SHA, `deploy=false` first.

## 8. Returning the founder identity from Fonzo to Fairway (safe, narrow, no new permission)
**Why a bridge rollback is not enough:** the founder's active scope is stored in the Supabase Auth user's `app_metadata` (`tenant_id`, `project_id`, `brand_id`), written by the workspace operation's scope provisioner and read from the session token. Redeploying or rolling back the bridge, API or WEB changes none of it. Only the existing `POST /customer/workspace/select` (same provisioner) or an Auth-admin write changes it. Auth-admin writes need the service credential and are **not** used. `select` is deliberately not admitted by the bridge and is **not** being added.
**Procedure (a): the founder calls the existing API operation directly, once, with their own tokens.** No permission changes; the API enforces that the caller owns the Fairway tuple, and a wrong tuple changes nothing.
*Pre-creation proof (required before A0; read-only):*
- **P1** the §4 inventory shows you already hold `roles/run.invoker` on the private API (or the existing invoker service account you may already impersonate) **and** its ingress allows your Cloud Shell. If either is false, **stop: A0 is blocked**; do not grant yourself anything. Fallback (b) below.
- **P2** record the pre-state: hashes of the three scope claims in your current session token (below prints 8-character hashes only).
- **P3** prove the direct path with a read: `GET $API_URL/customer/workspace` returns 200 and lists Fairway.
- **P4** record the previous Fairway-pinned bridge revision and digest (rollback candidate from §4).
```bash
claims() { local p; p=$(printf %s "$1" | cut -d. -f2 | tr '_-' '/+'); while [ $(( ${#p} % 4 )) -ne 0 ]; do p="${p}="; done; printf %s "$p" | base64 -d 2>/dev/null; }
scope_hashes() { claims "$1" | jq -r '.app_metadata | [.tenant_id,.project_id,.brand_id] | .[]' | while read -r v; do printf %s "$v" | sha256sum | cut -c1-8; done | paste -sd' ' -; }
# P2: before A0. Paste your current session token at the hidden prompt; only hashes are printed. Keep the output as PRE_HASHES.
read -rs -p "Founder session token (hidden): " TOKEN; echo; scope_hashes "$TOKEN"; unset TOKEN
# P3 and R1 need the verified private API service URL (API_URL) from the §4 readback and a Google identity token for it from an account that ALREADY has the invoker role:
#   IDT=$(gcloud auth print-identity-token --audiences="$API_URL")      # if this fails, stop: do not grant anything
# P3:  curl -sS "$API_URL/customer/workspace" -H "Authorization: Bearer $TOKEN" -H "X-Serverless-Authorization: Bearer $IDT" | jq '{status, count:(.workspaces // [] | length)}'
```
*Restore (after Fonzo work; FUTURE, needs D1 and D6):*
```bash
# R1: one request, pinned to the FAIRWAY tuple (kept private in your own shell variables). Wrong tuple = nothing changes.
read -rs -p "Founder session token (hidden): " TOKEN; echo
IDT=$(gcloud auth print-identity-token --audiences="$API_URL")
curl -sS -X POST "$API_URL/customer/workspace/select" -H "Authorization: Bearer $TOKEN" -H "X-Serverless-Authorization: Bearer $IDT" -H 'Content-Type: application/json' \
  --data "{\"tenant_id\":\"$FAIRWAY_TENANT\",\"project_id\":\"$FAIRWAY_PROJECT\",\"brand_id\":\"$FAIRWAY_BRAND\"}" | jq '{status, requires_session_refresh}'
unset TOKEN IDT
# R2: sign out and sign in to the Studio, paste the NEW token, run scope_hashes; it must equal PRE_HASHES. R3: re-run the §4 SQL: Fairway campaigns and fixed-key receipts unchanged.
# R4: restore the recorded previous Fairway-pinned bridge revision for Fairway work.
```
**Fallback (b), only if P1 fails:** a separately reviewed, default-OFF bridge permission admitting exactly `POST /customer/workspace/select` for exactly two pinned tuples (Fairway, Fonzo) for the founder identity only. About 0.5–1 day with tests and review; **not built, not approved, not part of this packet.** If P1 fails, D1 is blocked until (b) is accepted.
**Never:** touch Auth metadata with the service credential; delete the Fonzo workspace to "go back"; assume a bridge rollback restored scope.

## 9. ClamAV scanner specification (for parallel execution; an infrastructure change needing E4)
**Why:** `MALWARE_SCANNER=clamd` makes the API speak clamd's INSTREAM protocol to a daemon outside the process; intake refuses to start without a scanner, and `MEDIA_INTAKE_ALLOW_UNSCANNED` is a staging-only escape hatch that is **not** to be set.
**Design (shortest path): a sidecar container in the API Cloud Run revision**, listening on `127.0.0.1:3310` (containers in a revision share localhost), so `MALWARE_SCANNER_HOST=127.0.0.1`, `MALWARE_SCANNER_PORT=3310`. No new network exposure, no VPC.
| Item | Specification |
|---|---|
| Image (public tag list read 25 Nov) | `clamav/clamav` LTS line **`1.4.7`**: index digest `sha256:ac15046e610610347c459afabea6683a52cd041c7a10adf5f050ebb05525d62d` (linux/amd64 manifest `sha256:ae2405b10591b9a707ff4ae84da4e40c774ee0eecfe61a24316708ce6def79f2`). `stable`/`1.5.5` is index `sha256:64e30c0bf976198024deb3dc6d5cfe2485fb969c0f73549ba0fdb364b9469614` (feature line; not recommended for first use). Tags are mutable and rebuilt often: **deploy only by digest**. |
| Provenance | in Cloud Shell: `docker pull clamav/clamav:1.4.7@sha256:ac15…d62d`, tag and push to `europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/clamav`, read the registry digest back, deploy that. Re-resolve the Docker Hub digest on the day (the line above was read 25 Nov) |
| clamd settings | `TCPSocket 3310`, `TCPAddr 127.0.0.1`, **`StreamMaxLength 33M`**, **`MaxFileSize 33M`**, `MaxScanSize 64M`, **`AlertExceedsMax yes`** (anything over the limit is reported as a hit, never "clean"), `MaxThreads 4`. The clamd default stream limit (25 MiB) would break 25–32 MiB uploads and a default `MaxFileSize` would skip large files silently. Apply through the image's documented `CLAMD_CONF_*` settings or a mounted `clamd.conf`; confirm against the image README at the pinned digest |
| Signatures | official image runs `freshclam` (update daemon, default every hour). Requires outbound HTTPS to the ClamAV mirrors. The adapter reads `VERSION` before every scan and **refuses a database older than 72 h** (`MALWARE_SCANNER_MAX_SIGNATURE_AGE_HOURS`, keep 72). Cloud Run must be **instance-based billing with CPU always allocated** (`--no-cpu-throttling`), otherwise the update daemon starves and the database goes stale |
| Startup / readiness | clamd binds 3310 only after the database is loaded: sidecar **startup probe TCP 3310**, period 10 s, failure threshold 30 (5 min allowance); API container declares a dependency on the sidecar (`run.googleapis.com/container-dependencies`); no traffic shifts until the revision is Ready; first start downloads the database (allow 1–3 min) |
| Resources | sidecar **1 vCPU, 3 GiB** (steady state about 1–1.5 GiB; a signature reload briefly roughly doubles it, so 2 GiB is not enough); `min-instances=1`, `max-instances=2` (each instance runs its own clamd); watch memory for 24 h and adjust |
| Indicative cost (**unverified list prices; confirm in the GCP pricing calculator**) | always-on instance in europe-west1 with CPU always allocated: sidecar about £45–50/month, plus the API container's own always-on allocation (about £40–60) ⇒ **about £2.5–3.5 per day**; a 3-day acceptance window is roughly £10, then scale back (`min-instances=0`, or remove the sidecar revision). Image storage and egress are negligible |
| Fail-closed behaviour (SOURCE) | no scanner configured ⇒ intake does not start; connect refused/timeout ⇒ `SCANNER_CONNECTION_FAILED`/`SCANNER_TIMEOUT`; stale database ⇒ `SCANNER_SIGNATURES_STALE`; any reply other than `stream: OK` or `… FOUND` ⇒ `SCANNER_REPLY_INVALID`; all surface as `INSPECTION_UNAVAILABLE` (503) and the asset **stays quarantined** with no media asset and no preview; a hit ⇒ asset `rejected`; an engine labelled UNSCANNED is refused unless the unscanned flags are set (they must be absent) |
**Acceptance tests (all must pass before D3 intake is enabled):**
- **T1 container contract (before deployment, Cloud Shell, local `docker run` of the pinned image):** `VERSION` shows a database built within 72 h; INSTREAM of a clean sample returns `stream: OK`; the EICAR test string returns `FOUND`; a 32 MiB stream is accepted and 34 MiB is refused.
- **T2 adapter contract (repo checkout at `dfd49116…`, scanner on 127.0.0.1:3310):** the probe below prints five PASS lines (clean, EICAR hit, 32 MiB, stale-database guard, unreachable guard). It was validated here against a protocol double in three modes: healthy (5 PASS), default 25 MiB limit (the 32 MiB check FAILS), stale database (all scan checks FAIL closed).
- **T3 hosted (A2):** (i) a clean founder file reaches `ready`; (ii) on a **tagged, no-traffic** API revision whose `MALWARE_SCANNER_PORT` points at a closed port, `complete` returns 503 `INSPECTION_UNAVAILABLE`, the asset stays `quarantined`, no preview exists; (iii) on the correct revision the same asset then completes (retry-safe); (iv) the unscanned flag names are absent from the serving revision. An infected-file hosted test is not possible with real artwork; T1/T2 plus the automated suite cover it.
```javascript
// BG-RELEASE08 scanner acceptance probe. Run from a checkout of the accepted API SHA against the scanner under test. No secrets; prints only PASS/FAIL lines.
const { createClamdScanner } = require('./src/media-intake/clamdScanner');
const host = process.env.CLAMD_HOST || '127.0.0.1', port = Number(process.env.CLAMD_PORT || 3310);
// The standard EICAR test string, assembled from parts so this file is not itself flagged by scanners. It is harmless.
const EICAR = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', '$H+H*'].join(''));
const make = (extra = {}) => createClamdScanner({ host, port, timeoutMs: 10000, ...extra });
const checks = [
  ['clean bytes -> clean=true, signatures fresh', async () => { const r = await make().scan({ bytes: Buffer.from('fonzo clean test payload') }); if (r.clean !== true || !/^clamd-/.test(r.engine)) throw Error('unexpected result'); }],
  ['EICAR test string -> clean=false (signature hit)', async () => { const r = await make().scan({ bytes: EICAR }); if (r.clean !== false) throw Error('infected sample was not flagged'); }],
  ['32 MiB stream is accepted (StreamMaxLength >= 32 MiB)', async () => { const r = await make({ timeoutMs: 11000 }).scan({ bytes: Buffer.alloc(33554432, 0x41) }); if (r.clean !== true) throw Error('large stream not clean'); }],
  ['stale-signature guard fails closed', async () => { try { await make({ maxSignatureAgeHours: 0.0001 }).scan({ bytes: Buffer.from('x') }); } catch (e) { if (e.code === 'SCANNER_SIGNATURES_STALE') return; throw e; } throw Error('accepted a stale database'); }],
  ['unreachable scanner fails closed', async () => { try { await make({ port: port === 65535 ? 65534 : port + 1, timeoutMs: 2000 }).scan({ bytes: Buffer.from('x') }); } catch (e) { if (['SCANNER_CONNECTION_FAILED', 'SCANNER_TIMEOUT'].includes(e.code)) return; throw e; } throw Error('scanned without a scanner'); }],
];
(async () => { let bad = 0; for (const [name, run] of checks) { try { await run(); console.log('PASS', name); } catch (e) { bad++; console.log('FAIL', name, '-', e.code || e.message); } } process.exit(bad ? 1 : 0); })();
```
Run T2 as: `CLAMD_HOST=127.0.0.1 CLAMD_PORT=3310 node clamd-acceptance.js` from a checkout of the accepted API SHA.

## 10. LinkedIn and callback host — exact founder actions
Provider documentation hosts were not readable from the build container; labels below are the stable ones and every item marked **(confirm)** must be checked in the portal. Nothing here is a provider approval.
1. **Callback host first (needed only for step 11).** Redirect URI must be exactly `https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin` (the API accepts only this staging value). Today the Pages project has no custom domain and the account has no `getbizgenie.com` zone. Actions: Cloudflare → Workers & Pages → `bizgenie-studio-staging` → Custom domains → add `staging-app.getbizgenie.com`; at your current DNS host add the CNAME that Cloudflare shows for it (normally to the project's `pages.dev` host); wait for the certificate; verify with the §4 DNS/HTTP lines (HTTP 200 on the callback path). (confirm)
2. **LinkedIn app.** https://www.linkedin.com/developers/apps → *Create app*: name, the **LinkedIn Page** you administer (the Page admin must verify the app), logo, and the privacy-policy URL if the form asks (live legal pages are a separate dependency). (confirm)
3. **Products tab:** request **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**; note granted or pending. If *Share on LinkedIn* is not granted, LinkedIn refuses the whole request because the app asks for `w_member_social`. (confirm)
4. **Auth tab:** under authorised redirect URLs add the exact URI from step 1 and nothing else; scopes used: `openid profile w_member_social`. (confirm)
5. Copy the Client ID and Client Secret into Cloud Shell variables **without echoing**, then (E3, after approval) store them:
```bash
# FUTURE, after E3. Values are typed at hidden prompts and never printed or committed.
read -rs -p "LinkedIn client secret: " V; echo; printf %s "$V" | gcloud secrets create linkedin-client-secret-staging --project=bizgenie-backend --replication-policy=user-managed --locations=europe-west1 --data-file=-; unset V
read -rs -p "LinkedIn client id: " V; echo;     printf %s "$V" | gcloud secrets create linkedin-client-id-staging     --project=bizgenie-backend --replication-policy=user-managed --locations=europe-west1 --data-file=-; unset V
head -c 32 /dev/urandom | base64 | tr -d '\n' | gcloud secrets create social-token-key-staging --project=bizgenie-backend --replication-policy=user-managed --locations=europe-west1 --data-file=-   # D5 only
```
6. Post a short comment in #191 naming the granted products and the date (no ids); that comment becomes `LINKEDIN_OAUTH_REVIEW_REF`. Set `LINKEDIN_APP_REVIEW_APPROVED=true` only after the portal shows the products granted.
7. Legal pages (Terms, Privacy) live on `getbizgenie.com` before any provider review beyond self-serve products; they are not required for steps 1–10.

## 11. Phase B (prepared, not executed) and the premium path
Separate API revision and bridge profile (media intake, social, image generation, Stripe, learning **off**; draft and video bridge profiles never combined). Verify before any approval (all NOT VERIFIED today): spend migration applied, role `bizgenie_provider_spend_runtime` (NOLOGIN, no memberships, forced RLS) with a separately approved dedicated login; policy row (£100 monthly cohort cap = 10000p, ten customers) and the founder cohort slot; current price and FX authority; entitlement unexpired with at least 5 credits; worker running with bubblewrap isolation; private bucket; attachment and authenticated playback; a drill that restores the Phase A profile. Retained test: one four-second 720p 9:16 silent video, one submit, at most 10 status observations at least 25 s apart, 5 credits, at most £5 (500p), separate approval; it is **not** a finished Fonzo advertisement and uses no uploaded artwork.
**Shortest path to premium (engineering estimates, each needs scoped approval):** reference-assisted image hero shot ≈ 1–2 days (the quote path already accepts reference assets; the founder bridge admits none of it, so a narrow image-quote permission with its own budget cap and price/FX evidence); deterministic branding and composition ≈ 3–5 days (no production compositor exists); multi-clip finished video ≈ 2–3 days; then founder quality acceptance with every attempt costed.

## 12. Rollback and stop conditions
| Layer | Rollback |
|---|---|
| Bridge / API | restore traffic to the recorded previous revision (candidates from §4, confirmed by the founder); new revisions stay tagged |
| WEB | Pages rollback to deployment `e312dee7-f3d4-44e8-be5f-e615db91b7e6` (commit `ce8694e1…`) |
| Founder scope | §8 R1–R4 — **not** a deployment rollback |
| Data | Fairway untouched by design; Fonzo workspace/campaign/assets are not deletable through any admitted route |
Roll back only the explicitly recorded change and only if traffic still matches the owned change.
**Stop conditions:** a digest, traffic or tag that does not match the plan; a Fonzo project already exists, or Fairway fixed-key receipts ≠ 1; any broad flag true; an unscanned flag present; P1–P4 fail; a 403/2xx on a route outside the profile; scanner stale or unavailable, asset `rejected` or SHA-256 mismatch; a second workspace for the pinned key; any token or private id in output; Sprint10C artefacts changed; any provider call or credit movement.

## 13. Remaining genuine blockers only
1. **Operator inventory (§4)** — needs the founder's credentialed run.
2. **P1 direct-invoker proof (§8)** — if it fails, D1 is blocked until fallback (b) is built.
3. **Scanner (§9)** — blocks A2 intake only.
4. **`staging-app` custom domain/DNS and the LinkedIn app (§10)** — block step 11 only.
5. **Founder approvals D1–D6 and E1–E4 (§5).**
Not blockers: A0 invocation (D6); WEB workspace button; TikTok (deferred); legal pages for steps 1–10; Mission Control writes (an independent operator holds write access).

## 14. Estimated time to hosted Fonzo acceptance
Once the inventory has passed and §5 is answered: **A0 + A1 about half a day**; scanner (spec review 0.5 day, deploy and prove 2–3 h) runs in parallel; **hosted acceptance of steps 1–10 about 1 working day from approval**, step 11 when the callback host and LinkedIn app exist (provider and DNS lead time unknown). Phase B afterwards: 30–60 minutes plus provider latency, after its own approval.

## 15. Governance
Mission Control was updated by the independent operator for the Cloudflare readback (`BG-RELEASE08-CF-READBACK-20261125`, 18 tabs, #191 7172108434); this session has no cell-write access and recorded nothing there. Revision-2 payload for an operator: CURRENT_STATUS "Release 08 packet rev 2: runbook corrected, §8 identity-restore, §9 scanner spec, §10 LinkedIn/callback actions; runtime NO-GO pending inventory"; LAUNCH_BLOCKERS add "callback host not routed to Pages (custom domain empty, no CF zone)", "identity scope restore needs P1 direct-invoker proof"; TASK_REGISTER next action "founder runs §4 and answers §5"; DECISION_LOG D1–D6/E1–E4 pending; no change to LOCK_REGISTER, BACKUP_REGISTER, ACTIVE_CLOSURE (BG-017C HOLD) or any accepted PASS.
