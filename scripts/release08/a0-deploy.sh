#!/usr/bin/env bash
# BG-RELEASE08 E2 — controlled TAGGED deployments for A0 (v2). Cloud Shell. Usage:  bash a0-deploy.sh api | bridge | shift-bridge | rollback-bridge
# api            : new API revision from API_REF, NO TRAFFIC, tagged. (The bridge talks to the tagged upstream URL, so the API serving revision never changes.) Writes ~/.bg-private/a0-state.json
# bridge         : new bridge revision from BRIDGE_REF with the validated A0 env file (~/.bg-private/a0-bridge-env.yaml), NO TRAFFIC, tagged. Updates the state file.
# shift-bridge   : the ONLY traffic change. Independently re-verifies the accepted revision, image digest and the fresh, complete smoke evidence (including the mandatory authenticated read) before moving 100% to that exact revision.
# rollback-bridge: 100% of the bridge back to the recorded step7 revision (digest-checked).
set -euo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; BRIDGE_SVC=bizgenie-studio-bridge-staging; TAG=a0-dfd49116
BASE_BRIDGE_REV=bizgenie-studio-bridge-staging-step7-c023184c; BASE_BRIDGE_DIGEST=sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18
BASE_API_REV=bizgenie-api-staging-00029-wtc
PRIV="$HOME/.bg-private"; STATE="$PRIV/a0-state.json"; EVID="$PRIV/a0-smoke-evidence.json"; MAX_EVIDENCE_AGE=${MAX_EVIDENCE_AGE:-3600}
die() { echo "STOP: $*" >&2; exit 1; }
describe() { gcloud run services describe "$1" --project="$P" --region="$R" --format=json; }
revjson() { gcloud run revisions describe "$1" --project="$P" --region="$R" --format=json; }
# Cloud Run returns status.imageDigest as <repository>@sha256:<64 hex>; reduce to the bare digest and fail closed on anything else (missing, malformed, uppercase, short).
norm_digest() { local v=${1##*@}; [[ "$v" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1; printf '%s' "$v"; }
revdigest() { local raw; raw=$(gcloud run revisions describe "$1" --project="$P" --region="$R" --format='value(status.imageDigest)') || return 1; norm_digest "$raw" || { echo "STOP: revision $1 reported a missing or malformed image digest" >&2; return 1; }; }
serving() { jq -r --arg l "$(jq -r '.status.latestReadyRevisionName // ""' <<<"$1")" '[.status.traffic[]? | select((.percent // 0) > 0) | (.revisionName // (if .latestRevision == true then $l else empty end))] | unique | join(" ")' <<<"$1"; }
tag_revision() { jq -r --arg t "$2" '[.status.traffic[]? | select(.tag == $t) | .revisionName][0] // ""' <<<"$1"; }
ready() { jq -e '[.status.conditions[]? | select(.type == "Ready")][0].status == "True"' <<<"$1" >/dev/null; }
h12() { sha256sum | cut -c1-12; }
# Canonical, secret-safe fingerprint of everything a NEW revision would inherit. Values are hashed (12 hex) and never printed; secret references are compared too.
# $1 = JSON, $2 = "svc" (service object: template under .spec.template) or "rev" (revision object).
fingerprint() {
  local norm; if [ "$2" = svc ]; then norm='{spec:.spec.template.spec, ann:(.spec.template.metadata.annotations // {})}'; else norm='{spec:.spec, ann:(.metadata.annotations // {})}'; fi
  jq -r "$norm"' | (.spec) as $s | (.ann) as $a |
    def ann_keys: ["autoscaling.knative.dev/minScale","autoscaling.knative.dev/maxScale","run.googleapis.com/cpu-throttling","run.googleapis.com/execution-environment","run.googleapis.com/vpc-access-connector","run.googleapis.com/vpc-access-egress","run.googleapis.com/startup-cpu-boost","run.googleapis.com/cloudsql-instances","run.googleapis.com/container-dependencies","run.googleapis.com/network-interfaces","run.googleapis.com/sessionAffinity"];
    (["SA","serviceAccount",($s.serviceAccountName // "")], ["RT","containerConcurrency",(($s.containerConcurrency // "") | tostring)], ["RT","timeoutSeconds",(($s.timeoutSeconds // "") | tostring)], ["RT","volumes",([($s.volumes // [])[] | .name] | tojson)],
     (ann_keys[] as $k | ["ANN",$k,($a[$k] // "")]),
     (($s.containers // []) | to_entries[] | .key as $i | .value as $c |
        ["RT","c\($i).name",($c.name // "")], ["RT","c\($i).limits",(($c.resources.limits // {}) | tojson)], ["RT","c\($i).ports",([($c.ports // [])[] | .containerPort] | tojson)],
        ["RT","c\($i).command",(($c.command // []) | tojson)], ["RT","c\($i).args",(($c.args // []) | tojson)], ["RT","c\($i).mounts",([($c.volumeMounts // [])[] | [.name,.mountPath]] | tojson)],
        (($c.env // [])[] | if .valueFrom then ["ENVREF","c\($i).\(.name)",(.valueFrom | tojson)] else ["ENV","c\($i).\(.name)",(.value // "")] end))) | @tsv' <<<"$1" |
  while IFS=$'\t' read -r kind key val; do printf '%s\t%s\t%s\n' "$kind" "$key" "$(printf %s "$val" | h12)"; done | sort
}
# A new revision inherits the service's LATEST TEMPLATE, not the serving revision. Refuse unless the two agree on every relevant value (names, values by hash, secret references, service identity, runtime settings).
template_matches_serving() { # $1 service name  $2 serving revision
  local sj rj diff_out; sj=$(describe "$1"); rj=$(revjson "$2")
  diff_out=$(diff <(fingerprint "$sj" svc) <(fingerprint "$rj" rev) || true)
  if [ -n "$diff_out" ]; then echo "template differs from the serving revision in (kind, key; values are never shown):" >&2; echo "$diff_out" | grep -E '^[<>]' | awk -F'\t' '{print "  " $1 " " $2}' | sed 's/^  [<>] /  /' | sort -u >&2; die "the latest $1 template is not the serving configuration: review and resolve before any new revision is created"; fi
}
write_state() { umask 077; mkdir -p "$PRIV"; jq -n --arg k "$1" --arg v "$2" '{($k):$v}' >/dev/null; local cur='{}'; [ -s "$STATE" ] && cur=$(cat "$STATE"); jq --arg k "$1" --arg v "$2" '. + {($k):$v}' <<<"$cur" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"; chmod 600 "$STATE"; }
case "${1:-}" in
 api)
  : "${API_REF:?export API_REF (E1 output)}"; J=$(describe "$API_SVC"); [ "$(serving "$J")" = "$BASE_API_REV" ] || die "API serving revision drifted"
  template_matches_serving "$API_SVC" "$BASE_API_REV"
  gcloud run deploy "$API_SVC" --project="$P" --region="$R" --image="$API_REF" --no-traffic --tag="$TAG" --quiet
  J=$(describe "$API_SVC"); NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged revision not found"
  [ "$(serving "$J")" = "$BASE_API_REV" ] || die "SERVING TRAFFIC CHANGED: roll back with: gcloud run services update-traffic $API_SVC --to-revisions=$BASE_API_REV=100 --project=$P --region=$R"
  [ "$(revdigest "$NEW")" = "${API_REF##*@}" ] || die "new API revision digest differs from API_REF"; ready "$(revjson "$NEW")" || die "new API revision is not Ready"
  write_state apiRevision "$NEW"; write_state apiDigest "${API_REF##*@}"
  echo "NEW_API_REVISION=$NEW  NEW_API_TAG=$TAG  digest=${API_REF##*@}"; echo "traffic unchanged (still $BASE_API_REV). Post the readback in #191 (EV_TAG), then run a0-prepare.sh.";;
 bridge)
  : "${BRIDGE_REF:?export BRIDGE_REF}"; Y="$PRIV/a0-bridge-env.yaml"; [ -s "$Y" ] || die "run a0-prepare.sh first ($Y missing)"; [ -s "$STATE" ] || die "state file missing: run 'a0-deploy.sh api' first"
  J=$(describe "$BRIDGE_SVC"); [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted"
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  template_matches_serving "$BRIDGE_SVC" "$BASE_BRIDGE_REV"
  gcloud run deploy "$BRIDGE_SVC" --project="$P" --region="$R" --image="$BRIDGE_REF" --env-vars-file="$Y" --no-traffic --tag="$TAG" --quiet
  J=$(describe "$BRIDGE_SVC"); NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged bridge revision not found"
  [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "SERVING TRAFFIC CHANGED: run: bash a0-deploy.sh rollback-bridge"
  [ "$(revdigest "$NEW")" = "${BRIDGE_REF##*@}" ] || die "new bridge revision digest differs from BRIDGE_REF"
  write_state bridgeRevision "$NEW"; write_state bridgeDigest "${BRIDGE_REF##*@}"; write_state bridgeTag "$TAG"; rm -f "$EVID"
  echo "bridge A0 revision $NEW deployed under tag $TAG with 0% traffic; serving still $BASE_BRIDGE_REV. Next: bash a0-smoke.sh (mandatory), then shift-bridge.";;
 shift-bridge)
  : "${BRIDGE_REF:?export BRIDGE_REF (the accepted E1 reference; independent of the state file)}"; : "${A0_CONFIRM_REVISION:?type the bridge revision name you are accepting, as A0_CONFIRM_REVISION}"
  [ -s "$STATE" ] && [ -s "$EVID" ] || die "state or smoke evidence missing: run a0-deploy.sh bridge and a0-smoke.sh first"
  REV=$(jq -r .bridgeRevision "$STATE"); DIG=$(jq -r .bridgeDigest "$STATE"); APIREV=$(jq -r .apiRevision "$STATE")
  [ "$A0_CONFIRM_REVISION" = "$REV" ] || die "A0_CONFIRM_REVISION does not equal the accepted revision"
  [ "$DIG" = "${BRIDGE_REF##*@}" ] || die "accepted digest (BRIDGE_REF) differs from the deployed A0 digest"
  NOW=$(date +%s); jq -e --arg rev "$REV" --arg dig "$DIG" --arg tag "$TAG" --arg api "$APIREV" --argjson now "$NOW" --argjson max "$MAX_EVIDENCE_AGE" \
    '.revision == $rev and .digest == $dig and .tag == $tag and .apiRevision == $api and .authenticatedRead == true and (.checks | length) >= 7 and (.checks | all(.result == "PASS")) and ($now - .passedAt) >= 0 and ($now - .passedAt) <= $max' "$EVID" >/dev/null \
    || die "smoke evidence does not cover this exact revision/digest, is incomplete (the authenticated read is mandatory), failed, or is older than ${MAX_EVIDENCE_AGE}s: rerun a0-smoke.sh"
  J=$(describe "$BRIDGE_SVC"); [ "$(tag_revision "$J" "$TAG")" = "$REV" ] || die "tag $TAG no longer points at $REV"
  [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted since the smoke test"
  [ "$(revdigest "$REV")" = "$DIG" ] || die "live digest of $REV differs from the accepted digest"; [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  RJ=$(revjson "$REV"); ready "$RJ" || die "$REV is not Ready"
  [ "$(jq -r '[.spec.containers[]?.env[]? | select(.name == "BG_BRIDGE_REVISION") | .value][0] // ""' <<<"$RJ")" = "$APIREV" ] || die "the bridge revision is not pinned to the accepted API revision"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$REV=100"
  J=$(describe "$BRIDGE_SVC"); if [ "$(serving "$J")" != "$REV" ]; then echo "post-shift check FAILED: restoring" >&2; gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; die "traffic did not settle on $REV; restored $BASE_BRIDGE_REV"; fi
  echo "bridge now serves $REV (digest $DIG). Rollback: bash a0-deploy.sh rollback-bridge";;
 rollback-bridge)
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "recorded rollback revision digest mismatch: do not roll back blindly"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; echo "bridge restored to $BASE_BRIDGE_REV";;
 *) die "usage: a0-deploy.sh api|bridge|shift-bridge|rollback-bridge";;
esac
