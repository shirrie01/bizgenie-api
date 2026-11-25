#!/usr/bin/env bash
# Test stub for gcloud: serves JSON fixtures from $STUB_DIR and records every call in $STUB_DIR/calls.log. Never contacts anything.
echo "$*" >> "$STUB_DIR/calls.log"
case "$*" in
 "auth list"*) echo stub;;
 "run services describe "*) n=$4; cat "$STUB_DIR/svc-$n.json";;
 "run revisions describe "*"value(status.imageDigest)"*) jq -r '.status.imageDigest' "$STUB_DIR/rev-$4.json";;
 "run revisions describe "*"--format=json"*) cat "$STUB_DIR/rev-$4.json";;
 "run deploy "*) [ -f "$STUB_DIR/deploy-effect.sh" ] && bash "$STUB_DIR/deploy-effect.sh" "$@"; true;;
 "run services update-traffic "*) [ -f "$STUB_DIR/traffic-effect.sh" ] && bash "$STUB_DIR/traffic-effect.sh" "$@"; true;;
 *) echo "UNEXPECTED gcloud $*" >&2; exit 2;;
esac
