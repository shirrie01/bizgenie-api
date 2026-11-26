#!/usr/bin/env bash
# BG-RELEASE08 E4 scanner gates. Cloud Shell. Usage:  bash a2-scanner-gate.sh pre  | post
# pre : BEFORE any scanner revision is created. Starts the pinned ClamAV image locally, waits until clamd ANSWERS A VERSION COMMAND with a signature database no older than 72 h
#       (readiness and freshness, not just an open TCP port), then runs the 5-check acceptance probe from the exact accepted SHA. Writes ~/.bg-private/a2-scanner-evidence.json (digest-bound).
# post: AFTER the 0%-traffic tagged scanner revision exists. Reads the revision back and fails unless it is Ready/healthy, has exactly [api, clamav] with the pinned digests, the sidecar dependency,
#       CPU always allocated, min instances >= 1, and none of the bypass flags. It does NOT shift traffic.
# Honest limit: Cloud Run cannot run a freshness probe inside the sidecar. At runtime freshness is enforced PER SCAN by the API (clamdScanner checks the VERSION date; > 72 h refuses the upload, fail closed).
set -euo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; API_SHA=dfd49116a0fe6bde11dbc25ca4599a03b8046999; MAX_AGE_H=72
PRIV="$HOME/.bg-private"; EV="$PRIV/a2-scanner-evidence.json"
die() { echo "STOP: $*" >&2; exit 1; }
REFRE='^europe-west1-docker\.pkg\.dev/bizgenie-backend/cloud-run-source-deploy/[a-z0-9_-]+@sha256:[a-f0-9]{64}$'
: "${CLAMAV_REF:?export CLAMAV_REF (digest-pinned)}"; : "${API_REF:?export API_REF}"
[[ "$CLAMAV_REF" =~ $REFRE && "$API_REF" =~ $REFRE && "$CLAMAV_REF" == */clamav@* ]] || die "CLAMAV_REF/API_REF must be digest-pinned references in cloud-run-source-deploy"
case "${1:-}" in
 pre)
  for t in docker git node npm jq tar date; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
  W=$(mktemp -d); N=bg-clamd-gate-$$; trap 'docker rm -f "$N" >/dev/null 2>&1 || true; rm -rf "$W"' EXIT
  docker run -d --name "$N" -p 127.0.0.1:3310:3310 -e CLAMD_CONF_StreamMaxLength=33M -e CLAMD_CONF_MaxFileSize=33M -e CLAMD_CONF_MaxScanSize=64M -e CLAMD_CONF_AlertExceedsMax=yes -e CLAMD_CONF_TCPSocket=3310 -e CLAMD_CONF_TCPAddr=0.0.0.0 "$CLAMAV_REF" >/dev/null
  echo "waiting for clamd to answer VERSION with a fresh database (up to 15 minutes)"; AGE_OK=no
  for i in $(seq 1 90); do
    V=$( (exec 3<>/dev/tcp/127.0.0.1/3310 && printf 'zVERSION\0' >&3 && timeout 5 cat <&3 | tr -d '\0') 2>/dev/null || true )
    if [[ "$V" =~ ^ClamAV\ [0-9.]+/[0-9]+/(.+)$ ]]; then DBD=$(date -d "${BASH_REMATCH[1]}" +%s 2>/dev/null || echo 0); AGE=$(( ($(date +%s) - DBD) / 3600 ))
      if [ "$DBD" -gt 0 ] && [ "$AGE" -ge 0 ] && [ "$AGE" -le "$MAX_AGE_H" ]; then AGE_OK=yes; echo "clamd ready; signature database age ${AGE}h (limit ${MAX_AGE_H}h)"; break; else echo "clamd answers but database age is ${AGE}h; waiting"; fi; fi
    sleep 10; done
  [ "$AGE_OK" = yes ] || die "clamd did not become ready with a fresh signature database"
  git clone --quiet --no-checkout https://github.com/shirrie01/bizgenie-api.git "$W/repo"; [ "$(git -C "$W/repo" rev-parse "$API_SHA^{commit}")" = "$API_SHA" ] || die "SHA readback mismatch"
  mkdir "$W/src"; git -C "$W/repo" archive "$API_SHA" | tar -x -C "$W/src"; ( cd "$W/src" && npm ci --omit=dev --no-audit --no-fund --silent )
  cp "$(dirname "$0")/clamd-acceptance.js" "$W/src/clamd-acceptance.js" 2>/dev/null || die "clamd-acceptance.js must sit next to this script"
  ( cd "$W/src" && CLAMD_HOST=127.0.0.1 CLAMD_PORT=3310 node clamd-acceptance.js ) || die "scanner acceptance FAILED: no scanner revision may be created"
  umask 077; mkdir -p "$PRIV"; jq -n --arg c "$CLAMAV_REF" --arg a "$API_REF" --argjson now "$(date +%s)" --argjson age "$AGE" '{clamav:$c,api:$a,dbAgeHours:$age,acceptance:"PASS",passedAt:$now}' > "$EV"; chmod 600 "$EV"
  echo "SCANNER PRE-GATE: PASS (evidence $EV)";;
 post)
  : "${SCANNER_REVISION:?export SCANNER_REVISION (the 0%-traffic tagged revision)}"; : "${SCANNER_TAG:?export SCANNER_TAG}"
  [ -s "$EV" ] && jq -e --arg c "$CLAMAV_REF" '.clamav == $c and .acceptance == "PASS"' "$EV" >/dev/null || die "no scanner pre-gate evidence for this exact ClamAV digest"
  RJ=$(gcloud run revisions describe "$SCANNER_REVISION" --project="$P" --region="$R" --format=json) || die "the scanner revision metadata command failed"; SJ=$(gcloud run services describe "$API_SVC" --project="$P" --region="$R" --format=json) || die "the API service metadata command failed"
  jq -e '[.status.conditions[]? | select(.type == "Ready")][0].status == "True"' <<<"$RJ" >/dev/null || die "revision is not Ready"
  jq -e '[.status.conditions[]? | select(.type == "ContainerHealthy")][0].status != "False"' <<<"$RJ" >/dev/null || die "a container is unhealthy"
  jq -e --arg api "$API_REF" --arg clam "$CLAMAV_REF" '([.spec.containers[].name] == ["api","clamav"])' <<<"$RJ" >/dev/null || die "containers are not exactly [api, clamav]"
  jq -e --arg a "${API_REF##*@}" --arg c "${CLAMAV_REF##*@}" '[.status.containerStatuses[]? | .imageDigest | split("@")[-1]] | (index($a) != null and index($c) != null)' <<<"$RJ" >/dev/null || die "image digests differ from the accepted references"
  jq -e '.metadata.annotations as $a | ($a["run.googleapis.com/container-dependencies"] // "") == "{\"api\":[\"clamav\"]}" and ($a["run.googleapis.com/cpu-throttling"] // "") == "false"' <<<"$RJ" >/dev/null || die "sidecar dependency / always-allocated CPU not set"
  jq -e '(.spec.template.metadata.annotations // .metadata.annotations)["autoscaling.knative.dev/minScale"] | tonumber >= 1' <<<"$RJ" >/dev/null 2>&1 || jq -e '.metadata.annotations["autoscaling.knative.dev/minScale"] | tonumber >= 1' <<<"$RJ" >/dev/null || die "min instances < 1"
  jq -e '[.spec.containers[]?.env[]?.name] | map(select(. == "MEDIA_INTAKE_ALLOW_UNSCANNED" or . == "MEDIA_INTAKE_STRUCTURAL_INSPECTION")) | length == 0' <<<"$RJ" >/dev/null || die "a scan-bypass flag is present"
  jq -e --arg r "$SCANNER_REVISION" --arg t "$SCANNER_TAG" '[.status.traffic[]? | select(.revisionName == $r and .tag == $t and ((.percent // 0) == 0))] | length == 1' <<<"$SJ" >/dev/null || die "scanner revision is not tagged at 0% traffic"
  echo "SCANNER POST-GATE: PASS (revision $SCANNER_REVISION, no traffic). The signed-in T3 run on the tagged URL is the final scanner gate."
  ;;
 *) die "usage: a2-scanner-gate.sh pre|post";;
esac
