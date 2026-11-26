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
# BEGIN url-validation (the service's own status.url is the authority; both Cloud Run hostname styles are accepted; nothing else is)
valid_service_urls() { # $1 = service.url (audience)  $2 = tagged url  $3 = expected tag
  local aud="$1" turl="$2" tag="$3" host
  [[ "$aud" =~ ^https://(bizgenie-api-staging-[a-z0-9]+(-[a-z0-9]+)*\.a\.run\.app|bizgenie-api-staging-[0-9]+\.europe-west1\.run\.app)$ ]] || return 1
  [[ "$tag" =~ ^[a-z][a-z0-9-]{1,40}$ ]] || return 1
  host=${aud#https://}; [ "$turl" = "https://${tag}---${host}" ]
}
# END url-validation
valid_service_urls "$AUDIENCE" "$TARGET_URL" "$NEW_API_TAG" || die "service URL / tagged URL / audience not in the expected form (tagged URL must be https://<tag>---<service host>)"
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
