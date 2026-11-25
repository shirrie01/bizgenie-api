#!/usr/bin/env bash
# BG-RELEASE08 A0 smoke checks (v2) against the TAGGED bridge revision (no traffic needed). Cloud Shell. Prints status codes only; never prints tokens, URLs or ids.
# The authenticated read through bridge -> new API -> database is MANDATORY: without it no evidence file is written and shift-bridge refuses.
set -uo pipefail
P=bizgenie-backend; R=europe-west1; TAG=a0-dfd49116; BRIDGE_SVC=bizgenie-studio-bridge-staging
PRIV="$HOME/.bg-private"; STATE="$PRIV/a0-state.json"; EVID="$PRIV/a0-smoke-evidence.json"; HP=${EXPECT_PROJECT_H:-b321c195}
die() { echo "STOP: $*" >&2; exit 1; }
for t in gcloud jq curl sha256sum; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
[ -s "$STATE" ] || die "state file missing: run a0-deploy.sh api and bridge first"
REV=$(jq -r '.bridgeRevision // ""' "$STATE"); DIG=$(jq -r '.bridgeDigest // ""' "$STATE"); APIREV=$(jq -r '.apiRevision // ""' "$STATE"); [ -n "$REV" ] && [ -n "$DIG" ] && [ -n "$APIREV" ] || die "state file incomplete"
SJ=$(gcloud run services describe "$BRIDGE_SVC" --project="$P" --region="$R" --format=json) || die "cannot describe the bridge service"
URL=$(jq -r --arg t "$TAG" '[.status.traffic[]? | select(.tag == $t) | .url][0] // ""' <<<"$SJ"); [ -n "$URL" ] || die "tag $TAG not found"
[ "$(jq -r --arg t "$TAG" '[.status.traffic[]? | select(.tag == $t) | .revisionName][0] // ""' <<<"$SJ")" = "$REV" ] || die "tag $TAG does not point at the deployed A0 revision"
[ "$(gcloud run revisions describe "$REV" --project="$P" --region="$R" --format='value(status.imageDigest)')" = "$DIG" ] || die "live digest of $REV differs from the deployed digest"
ORIGIN=https://bizgenie-studio-staging.pages.dev; FAIL=0; CHECKS='[]'
code() { curl -sS -m 20 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
chk() { local name="$1" want="$2" got="$3" res=FAIL; if [ "$got" = "$want" ]; then res=PASS; else FAIL=1; fi; echo "$res $name (want $want, got $got)"; CHECKS=$(jq -c --arg n "$name" --arg r "$res" '. + [{name:$n,result:$r}]' <<<"$CHECKS"); }
chk "preflight before auth (204)"                         204 "$(code -X OPTIONS "$URL/customer/workspace/brands" -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type')"
chk "foreign origin refused (403)"                        403 "$(code -X OPTIONS "$URL/customer/workspace" -H 'Origin: https://foreign.test' -H 'Access-Control-Request-Method: GET')"
chk "no token on a read (401)"                            401 "$(code "$URL/customer/workspace" -H "Origin: $ORIGIN")"
chk "generic bootstrap stays closed (403)"                403 "$(code -X POST "$URL/customer/workspace/bootstrap" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
chk "campaign/asset writes stay closed (403)"             403 "$(code -X POST "$URL/customer/assets/uploads" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
chk "workspace permission ACTIVE: unauthenticated request reaches auth (401, not 403)" 401 "$(code -X POST "$URL/customer/workspace/brands" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d '{}')"
read -rs -p "Founder session token (MANDATORY, hidden; used for ONE read-only chain check): " T; echo
[ -n "$T" ] || die "the authenticated tagged-bridge read is mandatory: no evidence written, traffic cannot shift"
BODY=$(mktemp); trap 'rm -f "$BODY"; unset T' EXIT; chmod 600 "$BODY"
GOT=$(printf 'header = "Authorization: Bearer %s"\n' "$T" | curl -sS -m 30 -K - -o "$BODY" -w '%{http_code}' "$URL/customer/workspace" -H "Origin: $ORIGIN" 2>/dev/null || echo 000); unset T
chk "authenticated read through bridge -> new API -> database (200)" 200 "$GOT"
# Shape-independent identity check: some string in the response must hash to the recorded Fairway project fingerprint (nothing is printed).
if jq -e . "$BODY" >/dev/null 2>&1; then
  FOUND=no; while IFS= read -r s; do [ "$(printf %s "$s" | sha256sum | cut -c1-8)" = "$HP" ] && { FOUND=yes; break; }; done < <(jq -r '.. | strings' "$BODY" | sort -u)
else FOUND=no; fi
chk "authenticated response carries the recorded Fairway project fingerprint" yes "$FOUND"
if [ "$FAIL" = 0 ]; then
  umask 077; jq -n --arg rev "$REV" --arg dig "$DIG" --arg tag "$TAG" --arg api "$APIREV" --argjson checks "$CHECKS" --argjson now "$(date +%s)" \
    '{revision:$rev,digest:$dig,tag:$tag,apiRevision:$api,authenticatedRead:true,checks:$checks,passedAt:$now}' > "$EVID.tmp" && mv "$EVID.tmp" "$EVID"; chmod 600 "$EVID"
  echo "A0 SMOKE: PASS (evidence written, valid 60 minutes)"
else rm -f "$EVID"; echo "A0 SMOKE: FAIL: do not shift traffic"; exit 1; fi
