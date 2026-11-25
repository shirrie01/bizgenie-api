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
