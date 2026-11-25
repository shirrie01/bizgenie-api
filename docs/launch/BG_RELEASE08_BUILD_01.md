# BG-RELEASE08-BUILD-01 — E1 build execution, A0 readiness and scanner revision (operator runbook)

25 Nov 2026. Authority: #191 comment 7175314064 (E1 approved, E2 approved, E3 **deferred**, E4 approved, D1–D6 retained with D5 deferred). Governing runbook: `BG_FOUNDER_RELEASE_08_ACTIVATION.md` at `220f57b5…` §5–§9. **Locked source:** API and bridge `dfd49116a0fe6bde11dbc25ca4599a03b8046999`; WEB `18119b3fd9eec2283ab4f8910848dfda81c49dc0`. No LinkedIn secrets, token vault, TikTok, Stripe, publishing, paid generation, broad IAM, Auth-admin writes, unscanned upload or Sprint10C change is performed or enabled by anything below.

## 1. What was executed here and what was not
| Item | Result | Evidence class |
|---|---|---|
| E1 published images | **NOT EXECUTED.** This session has no credentialed Google Cloud account, so nothing was pushed to Artifact Registry and no real `image@sha256` exists yet. The ONE consolidated script is §3; every digest printed by tests below is a stub value and must not be used | — |
| Exact-SHA export | `git archive dfd49116…` into a clean directory; no `.git`; secret scan clean (private-key/cloud/GitHub/Slack/Stripe-live patterns) | VERIFIED locally |
| **Bridge image** (`Dockerfile.studio-bridge`) | built locally from that export (local daemon, sandbox CA shim only, not publishable); **`scripts/staging/smoke-studio-bridge.sh`: PASS** (non-root, preflight before auth, no-token denial, origin denial, write gate) | VERIFIED locally |
| **A0-configured bridge container** (same build, A0 env) | the §6 smoke checks all PASS against it: preflight 204, foreign origin 403, no token 401, bootstrap 403, asset write 403, **workspace permission active (401 at auth, not 403)** | VERIFIED locally |
| **API/worker image** (`Dockerfile`) | local build **not possible here**: the Debian archive hosts are outside this sandbox's network allowance, so the pinned media toolchain (`ffmpeg 7:5.1.9-0+deb12u1`, `bubblewrap 0.8.0-2+deb12u1`) could not be verified. **Risk:** the Dockerfile fails closed if Debian has superseded those pins. The §3 script checks this first and stops before any build or push | NOT VERIFIED |
| WEB `studio-staging-release.yml`, `deploy=false` for `18119b3f…` | **PASS** — run `45707139253`: `build-verify` success (checked-out commit equals requested SHA, `npm test` **1622 passed / 52 skipped**, build, `smoke-pages: PASS`), `deploy` job **skipped**; artifact `studio-staging-dist-18119b3fd9eec2283ab4f8910848dfda81c49dc0` retained 30 days (its dist sha256 is in the run's step summary). Nothing was deployed | VERIFIED (hosted) |
| A0 manifest builder + Release 07 validator | script tested with synthetic ids and stubbed cloud reads: **success path** returns `OFFLINE_FOUNDER_WORKSPACE07_VALIDATED_NOT_DEPLOYMENT_APPROVAL`; **four fail-closed paths** (bridge digest drift, wrong fingerprint, missing/untagged API revision, reused evidence) stop. The REAL private manifest was **not** produced: the private ids and the tagged API revision do not exist for this session | VERIFIED (script), real manifest NOT PRODUCED |
| Scanner revision spec | patch tool tested on a sample export; refusals proven (§7) | VERIFIED (tool) |

## 2. Genuine blockers and the single next action
1. **E1 needs your credentialed Cloud Shell** (§3). It is one script, one paste.
2. **Pinned toolchain availability** — decided by §3 step 3 in about one minute. If the pins are gone the script stops with the archive output; building from another commit or editing the pins needs a new reviewed change, which this authorisation does not cover.
3. **WEB cannot yet present the Fonzo journey from the accepted source (found while inspecting the exact workflow).** `studio-staging-release.yml` always builds with `VITE_SOCIAL_PROVIDERS=tiktok`, sets `VITE_API_ROUTE_LIMITS=bridge-v1` for the bridge origin (which blocks copy editing), and does **not** set `VITE_API_ROUTE_LIMITS=bridge-founder-release04`, `VITE_API_SOURCE_SHA`, `VITE_API_SERVING_REVISION`, `VITE_COPY_EDIT_API`, `VITE_CONTENT_PLAN_API`, `VITE_CUSTOMER_MEDIA_INTAKE_API` or `VITE_FOUNDER_CAMPAIGN_ROOT_API`; and `src/premium/apiCompatibility.js` ships an empty manifest, so every gated feature stays OFF. Deploying `18119b3f…` as is would change nothing the founder can use. A0 (curl) is **not** affected; A1 onwards needs the Studio. **Minimal fix (not built; needs your authorisation and independent review, about 0.5 day):** (a) a `route_profile` workflow input (default empty = today's behaviour) that, for the bridge origin, sets the release04 profile, the two API identity variables and the feature flags above with `VITE_SOCIAL_PROVIDERS=` empty (LinkedIn deferred); (b) one manifest entry for the exact pair (API SHA `dfd49116…`, the new API revision name) with capabilities `contentPlan`, `copyRevisions`, `workspaceCalendar`, `founderCampaignRoot` (and `mediaIntake` only after A2). The WEB SHA to deploy then differs from `18119b3f…`; this is intentional and must be an accepted merge, not a floating build.
4. Not blockers: deferred E3 items; scanner (E4) only gates artwork intake; Sprint10C stays HOLD.
**Single next founder action:** open Cloud Shell, paste the §3 script, and paste its `E1 RESULT` block into #191.

## 3. E1 — ONE consolidated build, smoke, publish and digest-readback script (tested)
Tested here end to end (real git export of the exact SHA, real bridge build, real smoke test; registry, digest and the API build simulated): success path prints the result block; superseded-toolchain path **stops before building or pushing**; a provenance mismatch stops. It never deploys or touches traffic; it pushes **only** unique `release08-e1-…` tags to the existing `cloud-run-source-deploy` repository and reads the digests back from the registry.
```bash
#!/usr/bin/env bash
# BG-RELEASE08-BUILD-01 / E1 — build, smoke-test, publish and read back the accepted API/worker and Studio-bridge images. ONE script, Cloud Shell.
# Authorised scope (E1 only): exact SHAs, unique release tags, existing cloud-run-source-deploy repository in europe-west1. It does NOT deploy, shift traffic,
# create secrets, change IAM, touch the database, or run the WEB deploy. Nothing secret is read, printed or baked in; it prints image references and digests only.
# Any failed check stops the script BEFORE anything is pushed (publishing is the last step).
set -euo pipefail
P=bizgenie-backend; R=europe-west1; REPO="europe-west1-docker.pkg.dev/$P/cloud-run-source-deploy"
API_SHA=dfd49116a0fe6bde11dbc25ca4599a03b8046999
WEB_SHA=18119b3fd9eec2283ab4f8910848dfda81c49dc0
GIT_URL=https://github.com/shirrie01/bizgenie-api.git
BASE_IMAGE='node:22-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d'
TS=$(date -u +%Y%m%d%H%M%S); TAG="release08-e1-${API_SHA:0:8}-$TS"
API_IMG="$REPO/bizgenie-api:$TAG"; BRIDGE_IMG="$REPO/bizgenie-studio-bridge:$TAG"
say() { printf '\n== %s\n' "$*"; }; die() { echo "STOP: $*" >&2; exit 1; }
[ "$R" = europe-west1 ] || die "region must be europe-west1"
for t in gcloud git docker jq tar sha256sum; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)" ] || die "no active gcloud account: log in with your existing account"
docker info >/dev/null 2>&1 || die "docker daemon not reachable"

say "1/8 export the EXACT accepted commit into a clean directory (no floating main, no working tree, no .git)"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
git clone --quiet --no-checkout "$GIT_URL" "$W/repo"
git -C "$W/repo" cat-file -e "$API_SHA^{commit}" || die "commit $API_SHA not found"
[ "$(git -C "$W/repo" rev-parse "$API_SHA^{commit}")" = "$API_SHA" ] || die "SHA readback mismatch"
git -C "$W/repo" merge-base --is-ancestor "$API_SHA" origin/main || die "$API_SHA is not an ancestor of origin/main"
mkdir "$W/src"; git -C "$W/repo" archive "$API_SHA" | tar -x -C "$W/src"
[ ! -e "$W/src/.git" ] || die "export contains .git"
echo "source SHA readback: $(git -C "$W/repo" rev-parse "$API_SHA^{commit}")"
echo "export tree hash:    $(git -C "$W/repo" rev-parse "$API_SHA^{tree}")"

say "2/8 secret scan of the export (private keys, cloud/GitHub/Slack/Stripe live keys)"
if grep -rIlE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bap]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}' "$W/src"; then die "possible secret in source export"; fi
echo "clean"

say "3/8 pinned media-toolchain precheck (the API Dockerfile fails closed when Debian has superseded the pinned packages)"
FF=$(jq -r .ffmpeg_package "$W/src/runtime/video-inspection-toolchain.v1.json"); BW=$(jq -r .bubblewrap_package "$W/src/runtime/video-inspection-toolchain.v1.json")
POLICY=$(docker run --rm "$BASE_IMAGE" sh -c 'apt-get update -qq >/dev/null 2>&1; apt-cache policy ffmpeg bubblewrap') || die "could not query the Debian archive"
echo "$POLICY" | grep -F -q "$FF" && echo "$POLICY" | grep -F -q "$BW" || { echo "$POLICY" | grep -E '^(ffmpeg|bubblewrap):|Candidate' ; die "pinned toolchain ($FF / $BW) is no longer in the archive: the API image cannot be built from this exact SHA. Report this output; do NOT edit the pins or build from another commit without a new review"; }
echo "pins available: ffmpeg=$FF bubblewrap=$BW"

LABELS=(--label "org.opencontainers.image.revision=$API_SHA" --label "org.opencontainers.image.source=https://github.com/shirrie01/bizgenie-api" --label "bg.release=BG-RELEASE08-E1" --label "bg.web.sha=$WEB_SHA")
say "4/8 build the API/worker image with the repository Dockerfile (unmodified)"
( cd "$W/src" && docker build --pull=false "${LABELS[@]}" -f Dockerfile -t "$API_IMG" . )
say "5/8 build the Studio bridge image with Dockerfile.studio-bridge (unmodified)"
( cd "$W/src" && docker build --pull=false "${LABELS[@]}" -f Dockerfile.studio-bridge -t "$BRIDGE_IMG" . )

say "6/8 bridge container smoke test (scripts/staging/smoke-studio-bridge.sh from the SAME export)"
bash "$W/src/scripts/staging/smoke-studio-bridge.sh" "$BRIDGE_IMG" || die "bridge smoke test failed; nothing was pushed"
say "6b/8 API image sanity: non-root, media toolchain present, no secret files"
docker run --rm --entrypoint sh "$API_IMG" -c 'test "$(id -u)" != 0 && command -v ffprobe >/dev/null && command -v bwrap >/dev/null && ! ls -a /app | grep -E "^\.env|^\.git$|^\.npmrc$|^\.netrc$" && echo "api image sanity OK"' || die "API image sanity failed; nothing was pushed"

say "7/8 publish (unique tags; existing repository only) and read the immutable digests back from the registry"
gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet >/dev/null 2>&1
docker push "$API_IMG" >/dev/null; docker push "$BRIDGE_IMG" >/dev/null
digest() { gcloud artifacts docker images describe "$1" --project="$P" --format='value(image_summary.digest)'; }
API_DIGEST=$(digest "$API_IMG"); BRIDGE_DIGEST=$(digest "$BRIDGE_IMG")
[[ "$API_DIGEST" =~ ^sha256:[a-f0-9]{64}$ && "$BRIDGE_DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] || die "registry digest readback failed"
API_REF="$REPO/bizgenie-api@$API_DIGEST"; BRIDGE_REF="$REPO/bizgenie-studio-bridge@$BRIDGE_DIGEST"

say "8/8 provenance: pull by digest and compare the embedded revision label with the accepted commit"
for ref in "$API_REF" "$BRIDGE_REF"; do
  docker pull -q "$ref" >/dev/null
  rev=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$ref")
  [ "$rev" = "$API_SHA" ] || die "provenance mismatch for $ref ($rev)"
done
echo
echo "================ E1 RESULT: PASS ================"
echo "source SHA (API + bridge): $API_SHA"
echo "WEB SHA (not deployed here): $WEB_SHA"
echo "API/worker image : $API_REF"
echo "Studio bridge    : $BRIDGE_REF"
echo "tags             : $TAG"
echo "bridge smoke     : PASS"
echo "provenance label : revision=$API_SHA on both images"
echo "Paste the block between the === lines into issue #191. Nothing was deployed; no traffic changed."
```

## 4. A0 — sequence (each step gates the next; the founder personally makes the workspace request)
| # | Step | Command / gate |
|---|---|---|
| 1 | E1 | §3 → `API_REF`, `BRIDGE_REF` |
| 2 | API revision, **no traffic**, tagged (`a0-dfd49116`) | `bash a0-deploy.sh api` (§5). The bridge reaches the API through the tagged URL, so API serving traffic never changes |
| 3 | Post the tag-to-revision readback in #191 | gives `EV_TAG` |
| 4 | Private manifest + validation | `bash a0-prepare.sh` (§5): baseline guards, hidden prompts, fingerprints, Release 07 validator |
| 5 | Bridge A0 revision, **no traffic**, tagged | `bash a0-deploy.sh bridge` |
| 6 | Smoke on the tagged bridge | `bash a0-smoke.sh` (§6) must print `A0 SMOKE: PASS` |
| 7 | **A0 readiness checkpoint — STOP.** Evidence in #191 (image digests, tag readbacks, smoke, validation status, rollback digests) | founder confirms |
| 8 | The only traffic change | `bash a0-deploy.sh shift-bridge` |
| 9 | Founder's single workspace request (`BG_FOUNDER_RELEASE_08_ACTIVATION.md` §6 A0 request; hidden-prompt token; key `fonzo.workspace.v1`) | founder |
**Rollback targets (recorded, digest-checked by the scripts):** bridge `bizgenie-studio-bridge-staging-step7-c023184c` `sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18`; API `bizgenie-api-staging-00029-wtc` `sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2`; Studio Pages `e312dee7-f3d4-44e8-be5f-e615db91b7e6` (`ce8694e1c5cc47849d8f2b9f8b7bf7169949248e`). Nothing is deleted. Bridge rollback: `bash a0-deploy.sh rollback-bridge`. **Rollback never restores identity scope**: after Fonzo creation use the activation runbook §8 restore (recovery fingerprints: founder `d5a6f5ec`, tenant `7129d2ba`, project `b321c195`, brand `01e15c41`).
**Safeguards built into the scripts:** abort if the serving bridge/API drifted from the recorded revisions or digests; abort if a new revision would inherit a latest template whose env names differ from the serving one; abort if the serving bridge has secret-backed env (the env file replaces all variables); abort if the tagged API revision is not Ready-at-0%, not tagged, or its digest differs from `API_REF`; verify serving traffic is unchanged after each tagged deploy and print the exact rollback command if it is not; the single traffic change is a separate command.

## 5. A0 scripts
**`a0-prepare.sh`** — builds and validates the private manifest (read-only on cloud; writes two private mode-600 files outside git; prints statuses and 8-character hashes only):
```bash
#!/usr/bin/env bash
# BG-RELEASE08 A0 — build and VALIDATE the private workspace-activation manifest. Cloud Shell. READ-ONLY on cloud: it deploys nothing and changes no traffic.
# Writes only two private files (mode 600, outside git): ~/.bg-private/a0-manifest.json and ~/.bg-private/a0-bridge-env.yaml. Prints statuses and 8-character hashes only.
# Run AFTER the E1 images exist and the new API revision has been deployed WITH NO TRAFFIC under a tag (section 2 of the runbook).
# Required exports (none are secret; the private ids are asked for at hidden prompts):
#   API_REF BRIDGE_REF             image@sha256 references printed by the E1 script
#   NEW_API_REVISION NEW_API_TAG   the no-traffic, tagged API revision (e.g. bizgenie-api-staging-00032-abc, a0-dfd49116)
#   EV_APPROVAL EV_SCOPE EV_ROLLBACK EV_TAG   four DISTINCT GitHub issue-comment URLs (approval; independent scope readback; rollback readback; tag-to-revision readback)
set -euo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; BRIDGE_SVC=bizgenie-studio-bridge-staging
API_SHA=dfd49116a0fe6bde11dbc25ca4599a03b8046999
BASE_BRIDGE_REV=bizgenie-studio-bridge-staging-step7-c023184c; BASE_BRIDGE_DIGEST=sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18
BASE_API_REV=bizgenie-api-staging-00029-wtc;                  BASE_API_DIGEST=sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2
HF=${EXPECT_FOUNDER_H:-d5a6f5ec}; HT=${EXPECT_TENANT_H:-7129d2ba}; HP=${EXPECT_PROJECT_H:-b321c195}; HB=${EXPECT_BRAND_H:-01e15c41}   # recorded fingerprints = first 8 hex of sha256 of the value
die() { echo "STOP: $*" >&2; exit 1; }; say() { printf '\n== %s\n' "$*"; }
h8() { printf %s "$1" | sha256sum | cut -c1-8; }
for t in gcloud git jq node npm sha256sum tar; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)" ] || die "no active gcloud account"
: "${API_REF:?}" "${BRIDGE_REF:?}" "${NEW_API_REVISION:?}" "${NEW_API_TAG:?}" "${EV_APPROVAL:?}" "${EV_SCOPE:?}" "${EV_ROLLBACK:?}" "${EV_TAG:?}"
REF_RE='^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/[a-z0-9_-]+@sha256:[a-f0-9]{64}$'
[[ "$API_REF" =~ $REF_RE && "$BRIDGE_REF" =~ $REF_RE ]] || die "API_REF/BRIDGE_REF must be image@sha256 references in cloud-run-source-deploy"
[[ "$BRIDGE_REF" == */bizgenie-studio-bridge@sha256:* ]] || die "BRIDGE_REF must be the bizgenie-studio-bridge image"
[[ "$NEW_API_REVISION" =~ ^bizgenie-api-staging-[0-9]{5}-[a-z0-9]{3}$ ]] || die "NEW_API_REVISION must look like bizgenie-api-staging-NNNNN-xxx"
[[ "$NEW_API_TAG" =~ ^[a-z][a-z0-9-]{1,40}$ ]] || die "NEW_API_TAG is not a valid Cloud Run tag"
EVRE='^https://github\.com/shirrie01/bizgenie-api/(issues|pull)/[0-9]+#issuecomment-[0-9]+$'
for e in "$EV_APPROVAL" "$EV_SCOPE" "$EV_ROLLBACK" "$EV_TAG"; do [[ "$e" =~ $EVRE ]] || die "evidence references must be GitHub issue-comment URLs"; done
[ "$(printf '%s\n' "$EV_APPROVAL" "$EV_SCOPE" "$EV_ROLLBACK" "$EV_TAG" | sort -u | wc -l)" = 4 ] || die "the four evidence references must be distinct"

say "1/6 baseline safeguards (read-only): the serving bridge and API must still be the recorded rollback targets"
BJ=$(gcloud run services describe "$BRIDGE_SVC" --project="$P" --region="$R" --format=json); AJ=$(gcloud run services describe "$API_SVC" --project="$P" --region="$R" --format=json)
serving() { jq -r --arg l "$(jq -r '.status.latestReadyRevisionName // ""' <<<"$1")" '[.status.traffic[]? | select((.percent // 0) > 0) | (.revisionName // (if .latestRevision == true then $l else empty end))] | unique | join(" ")' <<<"$1"; }
[ "$(serving "$BJ")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision is not $BASE_BRIDGE_REV (drift): re-run the inventory"
[ "$(serving "$AJ")" = "$BASE_API_REV" ] || die "API serving revision is not $BASE_API_REV (drift): re-run the inventory"
dig_of() { gcloud run revisions describe "$1" --project="$P" --region="$R" --format='value(status.imageDigest)'; }
[ "$(dig_of "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "bridge rollback digest differs from the recorded one"
[ "$(dig_of "$BASE_API_REV")" = "$BASE_API_DIGEST" ] || die "API rollback digest differs from the recorded one"
BREV=$(gcloud run revisions describe "$BASE_BRIDGE_REV" --project="$P" --region="$R" --format=json)
[ "$(jq '[.spec.containers[]?.env[]? | select(.valueFrom != null)] | length' <<<"$BREV")" = 0 ] || die "the serving bridge has secret-backed env vars: a full env replacement would drop them; handle manually"
echo "bridge $BASE_BRIDGE_REV and API $BASE_API_REV are serving and match the recorded digests"

say "2/6 the new API revision: Ready, tagged, 0% traffic, image equals API_REF"
[ "$(dig_of "$NEW_API_REVISION")" = "${API_REF##*@}" ] || die "NEW_API_REVISION image digest differs from API_REF"
jq -e --arg r "$NEW_API_REVISION" --arg t "$NEW_API_TAG" '[.status.traffic[]? | select(.revisionName == $r and .tag == $t and ((.percent // 0) == 0))] | length == 1' <<<"$AJ" >/dev/null || die "revision is not tagged $NEW_API_TAG at 0% traffic"
TARGET_URL=$(jq -r --arg t "$NEW_API_TAG" '[.status.traffic[]? | select(.tag == $t) | .url][0] // ""' <<<"$AJ"); AUDIENCE=$(jq -r '.status.url // ""' <<<"$AJ")
[[ "$TARGET_URL" =~ ^https://[a-z0-9-]+---bizgenie-api-staging-[a-z0-9-]+\.a\.run\.app$ && "$AUDIENCE" =~ ^https://bizgenie-api-staging-[a-z0-9-]+\.a\.run\.app$ ]] || die "tagged URL / audience not in the expected form"
echo "tagged upstream URL: present (not printed); revision $NEW_API_REVISION"

say "3/6 private identifiers (hidden prompts; checked against the recorded fingerprints; never printed)"
ask() { local v; read -rs -p "$1: " v; echo >&2; printf %s "$v"; }
UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
FOUNDER=$(ask "Founder auth user id (UUID)"); TENANT=$(ask "Owner tenant id"); PROJECT=$(ask "Fairway project id"); BRAND=$(ask "Fairway brand id"); CAMPAIGN=$(ask "Fairway campaign id (UUID)")
[[ "$FOUNDER" =~ $UUID_RE && "$CAMPAIGN" =~ $UUID_RE ]] || die "founder and campaign ids must be lowercase UUIDs"
[ "$(h8 "$FOUNDER")" = "$HF" ] || die "founder fingerprint mismatch"; [ "$(h8 "$TENANT")" = "$HT" ] || die "tenant fingerprint mismatch"
[ "$(h8 "$PROJECT")" = "$HP" ] || die "project fingerprint mismatch"; [ "$(h8 "$BRAND")" = "$HB" ] || die "brand fingerprint mismatch"
echo "fingerprints match the recorded founder/tenant/project/brand; campaign fingerprint $(h8 "$CAMPAIGN") (record it)"

say "4/6 export the exact source and build the private manifest (mode 600, outside git)"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
git clone --quiet --no-checkout https://github.com/shirrie01/bizgenie-api.git "$W/repo"; [ "$(git -C "$W/repo" rev-parse "$API_SHA^{commit}")" = "$API_SHA" ] || die "SHA readback mismatch"
mkdir "$W/src"; git -C "$W/repo" archive "$API_SHA" | tar -x -C "$W/src"
umask 077; mkdir -p "$HOME/.bg-private"; M="$HOME/.bg-private/a0-manifest.json"; Y="$HOME/.bg-private/a0-bridge-env.yaml"
cur() { jq -r --arg n "$1" '[.spec.containers[]?.env[]? | select(.name == $n) | .value][0] // ""' <<<"$BREV"; }
PUBKEY=$(cur SUPABASE_PUBLISHABLE_KEY); ORIGIN=$(cur BG_BRIDGE_STUDIO_ORIGIN); [ -n "$PUBKEY" ] && [ -n "$ORIGIN" ] || die "could not read the public key/origin from the serving bridge revision"
case "$PUBKEY" in sb_secret_*|eyJ*) die "that is not a publishable key";; esac
jq --arg sha "$API_SHA" --arg image "$BRIDGE_REF" --arg tag "$EV_TAG" --arg appr "$EV_APPROVAL" --arg scope "$EV_SCOPE" --arg rb "$EV_ROLLBACK" \
   --arg pub "$PUBKEY" --arg origin "$ORIGIN" --arg target "$TARGET_URL" --arg aud "$AUDIENCE" --arg rev "$NEW_API_REVISION" --arg founder "$FOUNDER" --arg tenant "$TENANT" \
   --arg project "$PROJECT" --arg brand "$BRAND" --arg campaign "$CAMPAIGN" '
  { profile: "workspace", approvalRef: $appr, independentScopeEvidenceRef: $scope, rollbackEvidenceRef: $rb,
    protectedScope: { tenant_id: $tenant, project_id: $project, brand_id: $brand, campaign_id: $campaign },
    baseProfile: (. + { sourceSha: $sha, image: $image, identitySuitabilityEvidence: $appr, publicInvokerApproval: $appr, upstreamTagEvidence: $tag,
      environment: (.environment + { SUPABASE_PUBLISHABLE_KEY: $pub, BG_BRIDGE_STUDIO_ORIGIN: $origin, BG_BRIDGE_TARGET_URL: $target, BG_BRIDGE_AUDIENCE: $aud, BG_BRIDGE_REVISION: $rev,
        BG_BRIDGE_SOURCE_SHA: $sha, BG_BRIDGE_REVIEW_REF: $appr, BG_BRIDGE_FOUNDER_AUTH_USER_ID: $founder, BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING: "false",
        BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE: "true", BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID: $tenant, BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY: "fonzo.workspace.v1",
        BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME: "Fonzo" }) }) }' "$W/src/scripts/staging/bridge-founder-onboarding-release.example.json" > "$M"
chmod 600 "$M"
jq -r '.baseProfile.environment | to_entries[] | "\(.key): \(.value|tojson)"' "$M" > "$Y"; chmod 600 "$Y"

say "5/6 validate with the accepted Release 07 validator (offline; installs the locked production dependencies into the temporary export only)"
( cd "$W/src" && npm ci --omit=dev --no-audit --no-fund --silent ) || die "npm ci failed in the temporary export"
( cd "$W/src" && node scripts/staging/validate-founder-release07.js "$M" ) || die "A0 manifest validation FAILED (generic by design): re-check the inputs"
say "6/6 summary"
echo "A0 manifest: $M (mode 600, not committed). Bridge env file: $Y (mode 600). Both hold private values: do not paste, print or commit them."
echo "Next: the founder reviews section 3 of the runbook, then the operator runs the A0 tagged bridge deployment (no traffic), the smoke checks, and only then the gated traffic shift."
```
**`a0-deploy.sh`** — tagged deployments, the single traffic shift and the rollback:
```bash
#!/usr/bin/env bash
# BG-RELEASE08 E2 — controlled TAGGED deployments for A0. Cloud Shell. Usage:  bash a0-deploy.sh api    |    bash a0-deploy.sh bridge    |    bash a0-deploy.sh shift-bridge    |    bash a0-deploy.sh rollback-bridge
# api            : new API revision from API_REF, NO TRAFFIC, tagged. (The bridge talks to the tagged upstream URL, so the API serving revision never changes.)
# bridge         : new bridge revision from BRIDGE_REF with the validated A0 env file, NO TRAFFIC, tagged. Needs ~/.bg-private/a0-bridge-env.yaml from a0-prepare.sh.
# shift-bridge   : the ONLY traffic change: 100% of the bridge to the tagged A0 revision, after the smoke checks passed.
# rollback-bridge: 100% of the bridge back to the recorded step7 revision (digest-checked).
set -euo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; BRIDGE_SVC=bizgenie-studio-bridge-staging; TAG=a0-dfd49116
BASE_BRIDGE_REV=bizgenie-studio-bridge-staging-step7-c023184c; BASE_BRIDGE_DIGEST=sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18
BASE_API_REV=bizgenie-api-staging-00029-wtc
die() { echo "STOP: $*" >&2; exit 1; }
describe() { gcloud run services describe "$1" --project="$P" --region="$R" --format=json; }
serving() { jq -r --arg l "$(jq -r '.status.latestReadyRevisionName // ""' <<<"$1")" '[.status.traffic[]? | select((.percent // 0) > 0) | (.revisionName // (if .latestRevision == true then $l else empty end))] | unique | join(" ")' <<<"$1"; }
env_names() { gcloud run revisions describe "$1" --project="$P" --region="$R" --format=json | jq -r '[.spec.containers[]?.env[]? | .name] | unique | .[]'; }
# A new revision inherits the service's LATEST template, not the serving revision's. Refuse if they differ in configuration names.
same_template_as_serving() { local svc="$1" base="$2" j latest; j=$(describe "$svc"); latest=$(jq -r '.status.latestCreatedRevisionName // ""' <<<"$j")
  [ -n "$latest" ] || die "cannot read the latest created revision of $svc"
  if [ "$latest" != "$base" ]; then diff <(env_names "$latest") <(env_names "$base") >/dev/null || die "latest created revision $latest has different env names from serving $base: review before deploying (a new revision would inherit the latest template)"; fi; }
case "${1:-}" in
 api)
  : "${API_REF:?export API_REF (E1 output)}"; [ "$(serving "$(describe $API_SVC)")" = "$BASE_API_REV" ] || die "API serving revision drifted"
  same_template_as_serving "$API_SVC" "$BASE_API_REV"
  gcloud run deploy "$API_SVC" --project="$P" --region="$R" --image="$API_REF" --no-traffic --tag="$TAG" --quiet
  J=$(describe "$API_SVC"); NEW=$(jq -r --arg t "$TAG" '[.status.traffic[]? | select(.tag == $t) | .revisionName][0] // ""' <<<"$J")
  [ -n "$NEW" ] || die "tagged revision not found"; [ "$(serving "$J")" = "$BASE_API_REV" ] || die "SERVING TRAFFIC CHANGED: roll back with: gcloud run services update-traffic $API_SVC --to-revisions=$BASE_API_REV=100 --project=$P --region=$R"
  echo "NEW_API_REVISION=$NEW  NEW_API_TAG=$TAG  digest=$(gcloud run revisions describe "$NEW" --project="$P" --region="$R" --format='value(status.imageDigest)')"; echo "traffic unchanged (still $BASE_API_REV). Smoke: section 3b of the runbook.";;
 bridge)
  : "${BRIDGE_REF:?export BRIDGE_REF}"; Y="$HOME/.bg-private/a0-bridge-env.yaml"; [ -s "$Y" ] || die "run a0-prepare.sh first ($Y missing)"
  [ "$(serving "$(describe $BRIDGE_SVC)")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted"
  [ "$(gcloud run revisions describe "$BASE_BRIDGE_REV" --project="$P" --region="$R" --format='value(status.imageDigest)')" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  same_template_as_serving "$BRIDGE_SVC" "$BASE_BRIDGE_REV"
  gcloud run deploy "$BRIDGE_SVC" --project="$P" --region="$R" --image="$BRIDGE_REF" --env-vars-file="$Y" --no-traffic --tag="$TAG" --quiet
  J=$(describe "$BRIDGE_SVC"); [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "SERVING TRAFFIC CHANGED: run: bash a0-deploy.sh rollback-bridge"
  echo "bridge A0 revision deployed under tag $TAG with 0% traffic; serving still $BASE_BRIDGE_REV. Next: smoke checks (runbook 3c), then 'shift-bridge'.";;
 shift-bridge)
  J=$(describe "$BRIDGE_SVC"); jq -e --arg t "$TAG" '[.status.traffic[]? | select(.tag == $t)] | length == 1' <<<"$J" >/dev/null || die "tag $TAG not found on the bridge"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-tags="$TAG=100"; echo "bridge now serves the A0 revision. Rollback: bash a0-deploy.sh rollback-bridge";;
 rollback-bridge)
  [ "$(gcloud run revisions describe "$BASE_BRIDGE_REV" --project="$P" --region="$R" --format='value(status.imageDigest)')" = "$BASE_BRIDGE_DIGEST" ] || die "recorded rollback revision digest mismatch: do not roll back blindly"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; echo "bridge restored to $BASE_BRIDGE_REV";;
 *) die "usage: a0-deploy.sh api|bridge|shift-bridge|rollback-bridge";;
esac
```

## 6. A0 smoke checks (tested against a real bridge container built from `dfd49116…` with the A0 profile)
```bash
#!/usr/bin/env bash
# BG-RELEASE08 A0 smoke checks against the TAGGED bridge revision (no traffic needed). Cloud Shell. Prints status codes only; never prints tokens or URLs.
set -uo pipefail
P=bizgenie-backend; R=europe-west1; TAG=a0-dfd49116; BRIDGE_SVC=bizgenie-studio-bridge-staging
URL=$(gcloud run services describe "$BRIDGE_SVC" --project="$P" --region="$R" --format=json | jq -r --arg t "$TAG" '[.status.traffic[]? | select(.tag == $t) | .url][0] // ""'); [ -n "$URL" ] || { echo "STOP: tag $TAG not found"; exit 1; }
ORIGIN=https://bizgenie-studio-staging.pages.dev; FAIL=0
code() { curl -sS -m 20 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
chk() { local name="$1" want="$2" got="$3"; if [ "$got" = "$want" ]; then echo "PASS $name ($got)"; else echo "FAIL $name (want $want, got $got)"; FAIL=1; fi; }
chk "preflight before auth (204)"                         204 "$(code -X OPTIONS "$URL/customer/workspace/brands" -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type')"
chk "foreign origin refused (403)"                        403 "$(code -X OPTIONS "$URL/customer/workspace" -H 'Origin: https://foreign.test' -H 'Access-Control-Request-Method: GET')"
chk "no token on a read (401)"                            401 "$(code "$URL/customer/workspace" -H "Origin: $ORIGIN")"
chk "generic bootstrap stays closed (403)"                403 "$(code -X POST "$URL/customer/workspace/bootstrap" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
chk "campaign/asset writes stay closed (403)"             403 "$(code -X POST "$URL/customer/assets/uploads" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
chk "workspace permission is ACTIVE: unauthenticated request reaches auth (401, not 403)" 401 "$(code -X POST "$URL/customer/workspace/brands" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
read -rs -p "Founder session token for ONE read-only chain check (Enter to skip): " T; echo
if [ -n "$T" ]; then
  chk "authenticated read through bridge -> new API -> database (200)" 200 "$(code "$URL/customer/workspace" -H "Origin: $ORIGIN" -H "Authorization: Bearer $T")"
  unset T
fi
[ "$FAIL" = 0 ] && echo "A0 SMOKE: PASS" || { echo "A0 SMOKE: FAIL: do not shift traffic"; exit 1; }
```

## 7. E4 — real ClamAV scanner revision (specification ready; not applied; intake stays OFF until acceptance)
Follows `BG_FOUNDER_RELEASE_08_ACTIVATION.md` §9: sidecar `127.0.0.1:3310`; `StreamMaxLength`/`MaxFileSize` 33M with `AlertExceedsMax yes`; instance-based billing (CPU always allocated) so the signature updater runs; TCP startup probe; `container-dependencies`; sidecar 1 vCPU / 3 GiB; `min 1 / max 2`; the API refuses a signature database older than 72 h and fails closed.
**Image (public tag list, 25 Nov):** `clamav/clamav:1.4.7`, index digest `sha256:ac15046e610610347c459afabea6683a52cd041c7a10adf5f050ebb05525d62d` (amd64 `sha256:ae2405b10591b9a707ff4ae84da4e40c774ee0eecfe61a24316708ce6def79f2`). Mirror it by digest, then use the registry digest:
```bash
SRC='clamav/clamav:1.4.7@sha256:ac15046e610610347c459afabea6683a52cd041c7a10adf5f050ebb05525d62d'; REPO=europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy
docker pull "$SRC" && docker tag "$SRC" "$REPO/clamav:1.4.7-e4" && gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet && docker push "$REPO/clamav:1.4.7-e4"
CLAMAV_REF="$REPO/clamav@$(gcloud artifacts docker images describe "$REPO/clamav:1.4.7-e4" --project=bizgenie-backend --format='value(image_summary.digest)')"; echo "$CLAMAV_REF"
# T1 container contract (local, before any deployment): publish 3310 on loopback ONLY for this local test, wait for readiness, run the acceptance probe from a checkout of dfd49116
docker run -d --name clamd-t1 -p 127.0.0.1:3310:3310 -e CLAMD_CONF_StreamMaxLength=33M -e CLAMD_CONF_MaxFileSize=33M -e CLAMD_CONF_MaxScanSize=64M -e CLAMD_CONF_AlertExceedsMax=yes -e CLAMD_CONF_TCPSocket=3310 -e CLAMD_CONF_TCPAddr=0.0.0.0 "$CLAMAV_REF"
until node -e 'require("node:net").connect(3310,"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))'; do sleep 10; done
CLAMD_PORT=3310 node clamd-acceptance.js     # the 5-check probe in BG_FOUNDER_RELEASE_08_ACTIVATION.md §9 (head 220f57b5); expect 5 PASS; then: docker rm -f clamd-t1
```
(`CLAMD_CONF_*` is the official image's documented mapping; if the pinned digest does not honour it the 32 MiB check FAILS and you mount a `clamd.conf` instead. The probe was validated against a protocol double: healthy 5 PASS, 25 MiB default limit → the 32 MiB check fails, stale database → all scan checks fail closed.)
**Revision patch tool (offline, tested):** exports → patches → writes a YAML; applies nothing. It preserves every existing traffic entry, names the new revision explicitly, tags it at 0%, keeps secret-backed env as is, and **refuses** (non-zero, writes nothing) if: images are not digest-pinned in the existing repository; traffic uses `latestRevision` or does not sum to 100; the service already has more than one container; the unscanned/structural-only flags exist; or the extra env touches LinkedIn, the token vault or `SOCIAL_PUBLISHING_ENABLED` (E3 is deferred).
```python
#!/usr/bin/env python3
"""BG-RELEASE08 E4 — turn the EXPORTED API Cloud Run service into the scanner-sidecar revision spec. Offline: reads a YAML file, writes a YAML file, applies NOTHING.
Usage:  gcloud run services describe bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --format=export > svc.yaml
        python3 a2-scanner-patch.py svc.yaml a2-service.yaml --api-image API_REF --clamav-image CLAMAV_REF --suffix a2s1 --tag a2-scanner [--env NAME=VALUE ...] [--remove NAME ...]
Review the output, then (only after the E4 approval and with the operator): gcloud run services replace a2-service.yaml --project=bizgenie-backend --region=europe-west1
The new revision is created with NO traffic (explicitly named, tagged, 0%); every existing traffic entry is preserved. Exits non-zero (and writes nothing) if any safety check fails."""
import argparse, re, sys, copy
import yaml
SERVICE = "bizgenie-api-staging"
CLAM_RE = re.compile(r"^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/clamav@sha256:[a-f0-9]{64}$")
API_RE = re.compile(r"^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-api@sha256:[a-f0-9]{64}$")
FORBIDDEN_ENV = {"MEDIA_INTAKE_ALLOW_UNSCANNED", "MEDIA_INTAKE_STRUCTURAL_INSPECTION"}
SCANNER_ENV = {"MALWARE_SCANNER": "clamd", "MALWARE_SCANNER_HOST": "127.0.0.1", "MALWARE_SCANNER_PORT": "3310", "MALWARE_SCANNER_MAX_SIGNATURE_AGE_HOURS": "72"}
CLAMD_ENV = {"CLAMD_CONF_StreamMaxLength": "33M", "CLAMD_CONF_MaxFileSize": "33M", "CLAMD_CONF_MaxScanSize": "64M", "CLAMD_CONF_AlertExceedsMax": "yes", "CLAMD_CONF_TCPSocket": "3310", "CLAMD_CONF_TCPAddr": "127.0.0.1", "CLAMD_CONF_MaxThreads": "4", "CLAMAV_NO_FRESHCLAMD": "false"}
CLAM_RES = {"cpu": "1", "memory": "3Gi"}
def die(msg): print("REFUSED: " + msg, file=sys.stderr); sys.exit(1)
def cpu(v): v = str(v); return float(v[:-1]) / 1000 if v.endswith("m") else float(v)
def gib(v):
    v = str(v); m = re.match(r"^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$", v)
    if not m: die("unreadable memory limit " + v)
    return float(m.group(1)) * {"Ki": 1 / 1048576, "Mi": 1 / 1024, "Gi": 1, "K": 1e3 / 2**30, "M": 1e6 / 2**30, "G": 1e9 / 2**30, None: 1 / 2**30}[m.group(2)]
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--api-image", required=True); ap.add_argument("--clamav-image", required=True)
    ap.add_argument("--suffix", required=True); ap.add_argument("--tag", required=True); ap.add_argument("--env", action="append", default=[]); ap.add_argument("--remove", action="append", default=[])
    ap.add_argument("--min-instances", type=int, default=1); ap.add_argument("--max-instances", type=int, default=2); a = ap.parse_args()
    if not API_RE.match(a.api_image) or not CLAM_RE.match(a.clamav_image): die("images must be digest-pinned references in the existing cloud-run-source-deploy repository (clamav@sha256 / bizgenie-api@sha256)")
    if not re.match(r"^[a-z][a-z0-9]{1,15}$", a.suffix) or not re.match(r"^[a-z][a-z0-9-]{1,40}$", a.tag): die("bad suffix or tag")
    doc = yaml.safe_load(open(a.src)); out = copy.deepcopy(doc)
    if doc.get("kind") != "Service" or doc["metadata"]["name"] != SERVICE: die("not the " + SERVICE + " service export")
    tmpl = out["spec"]["template"]; spec = tmpl["spec"]; cs = spec["containers"]
    if len(cs) != 1: die("expected exactly one existing container (already patched?)")
    traffic = out["spec"].get("traffic") or []
    if not traffic or any(t.get("latestRevision") for t in traffic): die("traffic uses latestRevision or is empty: a replace would shift live traffic")
    if sum(t.get("percent", 0) for t in traffic) != 100: die("existing traffic does not sum to 100")
    if any(t.get("tag") == a.tag for t in traffic): die("tag already exists")
    api = cs[0]; api["name"] = "api"; api["image"] = a.api_image
    env = {e["name"]: e for e in api.get("env", [])}
    if any(n in env for n in FORBIDDEN_ENV): die("the unscanned/structural-only flags are present: remove them in a separate reviewed change, never enable them")
    for kv in a.env:
        k, _, v = kv.partition("=")
        if not re.match(r"^[A-Z][A-Z0-9_]{2,80}$", k) or k in FORBIDDEN_ENV or k.startswith("LINKEDIN_") or k.startswith("SOCIAL_TOKEN_") or k == "SOCIAL_PUBLISHING_ENABLED": die("env %s is not allowed in the E4 scanner revision (LinkedIn/token vault are deferred under E3)" % k)
        env[k] = {"name": k, "value": v}
    for k, v in SCANNER_ENV.items(): env[k] = {"name": k, "value": v}
    for k in a.remove:
        if k in FORBIDDEN_ENV: continue
        env.pop(k, None)
    api["env"] = list(env.values())
    clam = {"name": "clamav", "image": a.clamav_image, "env": [{"name": k, "value": v} for k, v in CLAMD_ENV.items()], "resources": {"limits": dict(CLAM_RES)},
            "startupProbe": {"tcpSocket": {"port": 3310}, "timeoutSeconds": 5, "periodSeconds": 10, "failureThreshold": 30}}
    cs.append(clam)
    ann = tmpl.setdefault("metadata", {}).setdefault("annotations", {})
    ann.update({"run.googleapis.com/container-dependencies": '{"api":["clamav"]}', "run.googleapis.com/cpu-throttling": "false", "run.googleapis.com/execution-environment": "gen2",
                "autoscaling.knative.dev/minScale": str(a.min_instances), "autoscaling.knative.dev/maxScale": str(a.max_instances)})
    rev = SERVICE + "-" + a.suffix; tmpl["metadata"]["name"] = rev
    traffic.append({"revisionName": rev, "percent": 0, "tag": a.tag}); out["spec"]["traffic"] = traffic
    yaml.safe_dump(out, open(a.dst, "w"), sort_keys=False)
    vcpu = sum(cpu(c.get("resources", {}).get("limits", {}).get("cpu", "1")) for c in cs); mem = sum(gib(c.get("resources", {}).get("limits", {}).get("memory", "512Mi")) for c in cs)
    secs = 30 * 86400 * a.min_instances; usd = secs * (vcpu * 0.000018 + mem * 0.000002)
    print("wrote %s; new revision %s tagged %s at 0%% traffic; existing traffic untouched (%d entries)" % (a.dst, rev, a.tag, len(traffic) - 1))
    print("instance resources: %.2f vCPU, %.2f GiB (api + clamav), min %d / max %d instances, CPU always allocated" % (vcpu, mem, a.min_instances, a.max_instances))
    print("INDICATIVE always-on cost for min-instances only (UNVERIFIED list prices $0.000018/vCPU-s, $0.000002/GiB-s; USD->GBP 0.79 assumed): about GBP %.0f/month = GBP %.2f/day" % (usd * 0.79, usd * 0.79 / 30))
main()
```
**Apply (operator, only after §7 T1 passes and E4 is confirmed):** `gcloud run services describe bizgenie-api-staging --project=bizgenie-backend --region=europe-west1 --format=export > svc.yaml` → run the tool with `--api-image "$API_REF" --clamav-image "$CLAMAV_REF" --suffix a2s1 --tag a2-scanner --env MEDIA_STORAGE_ENABLED=true --env MEDIA_INTAKE_ENABLED=true --env MEDIA_RIGHTS_POLICY_VERSION=fonzo-staging-rights.v1 --env 'MEDIA_RIGHTS_POLICY_STATEMENT=<D4 text>'` (plus the existing bucket variable names from the inventory) → review `a2-service.yaml` → `gcloud run services replace a2-service.yaml --project=bizgenie-backend --region=europe-west1` (no traffic moves).
**Acceptance, no bypass and no simulation:** T1 container, T2 adapter probe, then hosted T3 on the tagged revision: a clean founder file reaches `ready`; the same revision with the scanner port deliberately wrong (a second tagged revision) answers `INSPECTION_UNAVAILABLE`, leaves the asset `quarantined`, creates no media asset and no preview; the correct revision then completes the same asset; the serving revision's env names contain neither `MEDIA_INTAKE_ALLOW_UNSCANNED` nor `MEDIA_INTAKE_STRUCTURAL_INSPECTION`. An infected-file result is proven by T1/T2 (EICAR test string) and the automated suite, not by real artwork.
**Estimated cost with the proposed configuration (UNVERIFIED list prices $0.000018 per vCPU-second and $0.000002 per GiB-second, USD→GBP 0.79 assumed; confirm in the GCP pricing calculator):** the tool prints the exact figure from your API container's real limits. For an API container of 1 vCPU / 1 GiB plus the sidecar (instance 2 vCPU / 4 GiB, `min 1`): **about £90 a month = about £3.00 a day**; a 3-day acceptance window ≈ **£9**, then scale to `min 0` or remove the sidecar revision. Registry storage and egress are negligible. Request-based billing would be cheaper but starves the signature updater (database goes stale, scanning fails closed).

## 8. Evidence index
#191 approval: comment 7175314064. WEB verification run 45707139253. Activation runbook head `220f57b55313de21a224b781172d70eae8cfbf01`. Locked SHAs above. Mission Control: this session holds no cell-write capability and recorded nothing there; the exact payload is in the #191 comment for the operator who holds write access.
