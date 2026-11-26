#!/usr/bin/env bash
# Test stub for gcloud: serves JSON fixtures from $STUB_DIR and records every call in $STUB_DIR/calls.log. Never contacts anything.
# STUB_FAIL_MATCH (regex over the argument string): the command still prints its COMPLETE normal output but then exits 29 (valid-looking output with a failing status).
echo "$*" >> "$STUB_DIR/calls.log"
stub_main() {
case "$*" in
 "auth list"*) echo stub;;
 "run services describe "*) n=$4; cat "$STUB_DIR/svc-$n.json";;
 "run revisions list "*) svc=$(printf %s "$*" | sed -E 's/.*--service=([^ ]+).*/\1/'); if [ -f "$STUB_DIR/revlist-$svc.txt" ]; then cat "$STUB_DIR/revlist-$svc.txt"; else jq -r '.status.traffic[].revisionName' "$STUB_DIR/svc-$svc.json"; fi;;
 "run deploy "*) [ -f "$STUB_DIR/deploy-effect.sh" ] && bash "$STUB_DIR/deploy-effect.sh" "$@"; true;;
 "run revisions describe "*"value(status.imageDigest)"*) jq -r '.status.imageDigest' "$STUB_DIR/rev-$4.json";;
 "run revisions describe "*"--format=json"*) cat "$STUB_DIR/rev-$4.json";;
 "run services update-traffic "*) [ -f "$STUB_DIR/traffic-effect.sh" ] && bash "$STUB_DIR/traffic-effect.sh" "$@"; true;;
 *) echo "UNEXPECTED gcloud $*" >&2; exit 2;;
esac
}
stub_main "$@"; rc=$?
if [ -n "${STUB_FAIL_MATCH:-}" ] && [[ "$*" =~ $STUB_FAIL_MATCH ]]; then exit 29; fi
exit $rc
