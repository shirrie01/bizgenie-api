# ---- BG-RELEASE08 A0 consolidated founder run (Cloud Shell). Subcommands: run (default) | shift | rollback.  Stops at the founder workspace-creation checkpoint.
# Approvals retained: E1 (done), E2, E4; E3 deferred. This script creates NO secrets, changes NO IAM, enables NO media intake, publishes nothing, generates nothing.
# Images are the accepted E1 immutable references (below). Nothing is rebuilt.
set -euo pipefail
export API_REF='europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-api@sha256:af4814e7eaef97a8f46925c6738492f8649ee14038d8e9705dbb72e03604d952'
export BRIDGE_REF='europe-west1-docker.pkg.dev/bizgenie-backend/cloud-run-source-deploy/bizgenie-studio-bridge@sha256:5cfdc9a2c4ba86676a1d1f365f3edc493cf039ea7829265e80f4a5a679b1667f'
export EV_APPROVAL=${EV_APPROVAL:-https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-7175314064}
P=bizgenie-backend; PRIV="$HOME/.bg-private"; say() { printf '\n######## %s\n' "$*"; }; die() { echo "STOP: $*" >&2; exit 1; }
CMD=${1:-run}
for t in gcloud jq curl git node npm sha256sum tar; do command -v "$t" >/dev/null 2>&1 || die "missing tool: $t"; done
[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)" ] || die "no active gcloud account"
case "$CMD" in
 run)
  say "0. the accepted E1 images exist in the registry with exactly these digests (read-only)"
  for ref in "$API_REF" "$BRIDGE_REF"; do got=$(gcloud artifacts docker images describe "$ref" --project="$P" --format='value(image_summary.digest)') || die "cannot read $ref"; [ "$got" = "${ref##*@}" ] || die "registry digest differs for ${ref%%@*}"; done; echo "both digests confirmed"
  say "1. tagged NO-TRAFFIC API revision (serving API unchanged; template/config validated before deploy)"
  bash "$BG_A0_DIR/a0-deploy.sh" api
  APIREV=$(jq -r .apiRevision "$PRIV/a0-state.json"); echo
  echo "Post this readback as ONE comment on issue #191, then paste that comment's URL below:"; echo "  A0 API tag readback: tag a0-dfd49116 -> $APIREV, digest ${API_REF##*@}, traffic 0%"
  read -r -p "EV_TAG (URL of the readback comment): " EV_TAG; read -r -p "EV_SCOPE (independent scope readback comment URL): " EV_SCOPE; read -r -p "EV_ROLLBACK (rollback readback comment URL): " EV_ROLLBACK
  export EV_TAG EV_SCOPE EV_ROLLBACK NEW_API_REVISION="$APIREV" NEW_API_TAG=a0-dfd49116
  say "2. private A0 manifest (hidden prompts) and Release 07 offline validation"
  bash "$BG_A0_DIR/a0-prepare.sh"
  say "3. tagged NO-TRAFFIC bridge revision with the validated A0 environment"
  bash "$BG_A0_DIR/a0-deploy.sh" bridge
  say "4. mandatory smoke checks incl. the authenticated tagged-bridge read"
  bash "$BG_A0_DIR/a0-smoke.sh"
  say "CHECKPOINT 1 — traffic has NOT shifted"
  echo "Paste the lines marked PASS above and the revision names (no values) into #191. When ready, run:   bash a0-founder-run.sh shift"
  echo "Log: $BG_A0_LOG";;
 shift)
  say "traffic shift — re-verifies revision, digest, config and fresh smoke evidence independently"
  jq -r '"accepting bridge revision: \(.bridgeRevision)"' "$PRIV/a0-state.json"
  read -r -p "Type the bridge revision name to accept it: " A0_CONFIRM_REVISION; export A0_CONFIRM_REVISION
  bash "$BG_A0_DIR/a0-deploy.sh" shift-bridge
  say "CHECKPOINT 2 — FOUNDER WORKSPACE-CREATION"
  echo "STOP. The scripts do nothing further. Before creating the workspace complete the identity-return proofs P1-P4 (runbook), then the founder personally signs in to Studio and creates the Fonzo workspace."
  echo "If anything looks wrong:   bash a0-founder-run.sh rollback"
  echo "Log: $BG_A0_LOG";;
 rollback) bash "$BG_A0_DIR/a0-deploy.sh" rollback-bridge;;
 *) die "usage: a0-founder-run.sh run|shift|rollback";;
esac
