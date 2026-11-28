#!/usr/bin/env bash
# BG-RELEASE08 A0 smoke checks (v2) against the TAGGED bridge revision (no traffic needed). Cloud Shell. Prints status codes only; never prints tokens, URLs or ids.
# The authenticated read through bridge -> new API -> database is MANDATORY: without it no evidence file is written and shift-bridge refuses.
set -uo pipefail
P=bizgenie-backend; R=europe-west1; TAG=a0-dfd49116; BRIDGE_SVC=bizgenie-studio-bridge-staging
PRIV="$HOME/.bg-private"; STATE="$PRIV/a0-state.json"; EVID="$PRIV/a0-smoke-evidence.json"; HP=${EXPECT_PROJECT_H:-b321c195}
die() { echo "STOP: $*" >&2; exit 1; }
[ ! -e "$PRIV/a0-indeterminate.json" ] || die "INDETERMINATE: an earlier traffic recovery could not be verified; no smoke is allowed until rollback-bridge proves the baseline"
rm -f "$EVID"   # an earlier PASS must never stay eligible while a new run is incomplete or aborted
for t in gcloud jq curl sha256sum; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
[ -s "$STATE" ] || die "state file missing: run a0-deploy.sh api and bridge first"
APIDIG=$(jq -r '.apiDigest // ""' "$STATE"); EVTAG=$(jq -r '.evTag // ""' "$STATE"); [[ "$APIDIG" =~ ^sha256:[a-f0-9]{64}$ && -n "$EVTAG" ]] || die "the state lacks the accepted API digest or EV_TAG: run the bridge step first"
REV=$(jq -r '.bridgeRevision // ""' "$STATE"); DIG=$(jq -r '.bridgeDigest // ""' "$STATE"); APIREV=$(jq -r '.apiRevision // ""' "$STATE"); [ -n "$REV" ] && [ -n "$DIG" ] && [ -n "$APIREV" ] || die "state file incomplete"
SJ=$(gcloud run services describe "$BRIDGE_SVC" --project="$P" --region="$R" --format=json) || die "cannot describe the bridge service"
# The WHOLE traffic response is validated before the smoke target is chosen and before any request or evidence write: a non-empty array of objects, every entry with a non-empty string revision
# name and an integer percentage in [0,100], optional string tags that occur at most once across the array (whatever the revision or URL), no duplicate (revision, tag) target.
# Then: exactly one entry carries the A0 tag, it is the deployed A0 revision at 0 %, and the recorded baseline is the only revision serving, at exactly 100 %.
BASE_BRIDGE_REV=bizgenie-studio-bridge-staging-step7-c023184c
jq -e '(.status.traffic | type == "array" and length >= 1 and all(.[]; type == "object" and (.percent | type == "number" and . == floor and . >= 0 and . <= 100) and (.revisionName | type == "string" and length > 0) and ((has("tag") | not) or (.tag | type == "string" and length > 0))) and (([.[] | [.revisionName, (.tag // "")]] | length) == ([.[] | [.revisionName, (.tag // "")]] | unique | length)) and (([.[] | .tag? // empty] | length) == ([.[] | .tag? // empty] | unique | length)))' <<<"$SJ" >/dev/null 2>&1 \
  || die "the bridge traffic response is malformed or ambiguous (invalid entries, percentages, or a tag that occurs more than once): no smoke target is chosen"
[ "$(jq --arg t "$TAG" '[.status.traffic[] | select(.tag == $t)] | length' <<<"$SJ")" = 1 ] || die "tag $TAG does not occur exactly once in the traffic response"
[ "$(jq -r --arg t "$TAG" '[.status.traffic[] | select(.tag == $t)][0].revisionName' <<<"$SJ")" = "$REV" ] || die "tag $TAG does not point at the deployed A0 revision"
[ "$(jq -r --arg t "$TAG" '[.status.traffic[] | select(.tag == $t)][0].percent' <<<"$SJ")" = 0 ] || die "the A0 revision already receives traffic: this is a pre-shift smoke only"
jq -e --arg b "$BASE_BRIDGE_REV" '[.status.traffic[] | select(.percent > 0)] | (length == 1) and (.[0].revisionName == $b) and (.[0].percent == 100)' <<<"$SJ" >/dev/null 2>&1 || die "the recorded baseline is not the only revision serving at exactly 100%"
# `-q` MUST be the FIRST curl argument: it disables every default configuration file (~/.curlrc, $CURL_HOME/.curlrc, $XDG_CONFIG_HOME/curlrc, ~/.config/curlrc), which could otherwise add a destination and send the bearer header to it.
# DESTINATION IDENTITY. The founder's bearer token may only ever be sent to the tagged revision of the canonical bridge service. The canonical origin is PINNED here (the regional Cloud Run host of
# bizgenie-studio-bridge-staging in project bizgenie-backend, europe-west1; project number from the recorded inventory and the Studio profile's bridge origin) and is cross-checked three ways against
# the service the metadata command returned for that project, region and name: the service's own name, its own status.url, and the tagged URL, which must be EXACTLY the origin's host prefixed by
# "<tag>---". A tagged host of any other service, region, project, scheme, port, path, query, credential or a lookalike suffix can never match. Nothing is derived from a URL prefix or the .run.app suffix.
BRIDGE_SERVICE_ORIGIN=https://bizgenie-studio-bridge-staging-303691956826.europe-west1.run.app
[ "$(jq -r '.metadata.name // ""' <<<"$SJ")" = "$BRIDGE_SVC" ] || die "the service metadata is not for $BRIDGE_SVC: no destination is trusted"
[ "$(jq -r '.status.url // "" | if type == "string" then . else "" end' <<<"$SJ")" = "$BRIDGE_SERVICE_ORIGIN" ] || die "the service's own URL is absent, malformed or not the canonical bridge origin: no destination is trusted"
URL=$(jq -r --arg t "$TAG" '[.status.traffic[] | select(.tag == $t)][0].url // "" | if type == "string" then . else "" end' <<<"$SJ")
[ "$URL" = "https://${TAG}---${BRIDGE_SERVICE_ORIGIN#https://}" ] || die "the tagged URL is not exactly the tagged host of the canonical bridge service: the bearer token will not be sent"
LIVE=$(gcloud run revisions describe "$REV" --project="$P" --region="$R" --format='value(status.imageDigest)') || die "cannot read the live digest"; LIVE=${LIVE##*@}
[[ "$LIVE" =~ ^sha256:[a-f0-9]{64}$ ]] || die "the live image digest is missing or malformed"; [ "$LIVE" = "$DIG" ] || die "live digest of $REV differs from the deployed digest"
ORIGIN=https://bizgenie-studio-staging.pages.dev; FAIL=0; CHECKS='[]'
code() { curl -q -sS --proto =https --max-redirs 0 -m 20 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
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
GOT=$(printf 'header = "Authorization: Bearer %s"\n' "$T" | curl -q -sS --proto =https --max-redirs 0 -m 30 -K - -o "$BODY" -w '%{http_code}' "$URL/customer/workspace" -H "Origin: $ORIGIN" 2>/dev/null || echo 000); unset T
chk "authenticated read through bridge -> new API -> database (200)" 200 "$GOT"
# Shape-independent identity check: some string in the response must hash to the recorded Fairway project fingerprint (nothing is printed).
if jq -e . "$BODY" >/dev/null 2>&1; then
  FOUND=no; while IFS= read -r s; do [ "$(printf %s "$s" | sha256sum | cut -c1-8)" = "$HP" ] && { FOUND=yes; break; }; done < <(jq -r '.. | strings' "$BODY" | sort -u)
else FOUND=no; fi
chk "authenticated response carries the recorded Fairway project fingerprint" yes "$FOUND"
if [ "$FAIL" = 0 ]; then
  umask 077; jq -n --arg rev "$REV" --arg dig "$DIG" --arg tag "$TAG" --arg api "$APIREV" --arg apidig "$APIDIG" --arg evtag "$EVTAG" --argjson checks "$CHECKS" --argjson now "$(date +%s)" \
    '{revision:$rev,digest:$dig,tag:$tag,apiRevision:$api,apiDigest:$apidig,evTag:$evtag,authenticatedRead:true,checks:$checks,passedAt:$now}' > "$EVID.tmp" && mv "$EVID.tmp" "$EVID"; chmod 600 "$EVID"
  echo "A0 SMOKE: PASS (evidence written, valid 60 minutes)"
else rm -f "$EVID"; echo "A0 SMOKE: FAIL: do not shift traffic"; exit 1; fi
