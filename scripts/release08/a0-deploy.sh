#!/usr/bin/env bash
# BG-RELEASE08 E2 — controlled TAGGED deployments for A0 (v2). Cloud Shell. Usage:  bash a0-deploy.sh api | bridge | shift-bridge | rollback-bridge
# api            : new API revision from API_REF, NO TRAFFIC, tagged. (The bridge talks to the tagged upstream URL, so the API serving revision never changes.) Writes ~/.bg-private/a0-state.json
# bridge         : new bridge revision from BRIDGE_REF with the validated A0 env file (~/.bg-private/a0-bridge-env.yaml), NO TRAFFIC, tagged. Updates the state file.
# shift-bridge   : the ONLY traffic change. Independently re-verifies the accepted revision, image digest and the fresh, complete smoke evidence (including the mandatory authenticated read) before moving 100% to that exact revision.
# rollback-bridge: 100% of the bridge back to the recorded step7 revision (digest-checked).
set -euo pipefail
P=bizgenie-backend; R=europe-west1; API_SVC=bizgenie-api-staging; BRIDGE_SVC=bizgenie-studio-bridge-staging; TAG=a0-dfd49116
BASE_BRIDGE_REV=bizgenie-studio-bridge-staging-step7-c023184c; BASE_BRIDGE_DIGEST=sha256:312be533f275ad578e52973ec6fb00eff266a07d1af53de6982ab423bf96ce18
BASE_API_REV=bizgenie-api-staging-00029-wtc; BASE_API_DIGEST=sha256:e443d4bc136c79080f6535f78a7fb72a03d69a6ea39b91473ee3d84e240f7ae2
PRIV="$HOME/.bg-private"; STATE="$PRIV/a0-state.json"; EVID="$PRIV/a0-smoke-evidence.json"; MAX_EVIDENCE_AGE=${MAX_EVIDENCE_AGE:-3600}
die() { echo "STOP: $*" >&2; exit 1; }
# Every metadata read captures the output, checks the exit status and prints NOTHING when the command failed (a command can print complete JSON and still exit nonzero).
describe() { local o; o=$(gcloud run services describe "$1" --project="$P" --region="$R" --format=json) || return 1; printf '%s' "$o"; }
revjson() { local o; o=$(gcloud run revisions describe "$1" --project="$P" --region="$R" --format=json) || return 1; printf '%s' "$o"; }
# Cloud Run returns status.imageDigest as <repository>@sha256:<64 hex>; reduce to the bare digest and fail closed on anything else (missing, malformed, uppercase, short).
norm_digest() { local v=${1##*@}; [[ "$v" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1; printf '%s' "$v"; }
revdigest() { local raw; raw=$(gcloud run revisions describe "$1" --project="$P" --region="$R" --format='value(status.imageDigest)') || return 1; norm_digest "$raw" || { echo "STOP: revision $1 reported a missing or malformed image digest" >&2; return 1; }; }
serving() { jq -r --arg l "$(jq -r '.status.latestReadyRevisionName // ""' <<<"$1")" '[.status.traffic[]? | select((.percent // 0) > 0) | (.revisionName // (if .latestRevision == true then $l else empty end))] | unique | join(" ")' <<<"$1"; }
tag_revision() { jq -r --arg t "$2" '[.status.traffic[]? | select(.tag == $t) | .revisionName][0] // ""' <<<"$1"; }
ready() { jq -e '[.status.conditions[]? | select(.type == "Ready")][0].status == "True"' <<<"$1" >/dev/null; }
h12() { sha256sum | cut -c1-12; }
# Metadata reads can fail silently inside `$(...)` when bash runs us in a conditional context (set -e is ignored there), producing an empty document that would compare "equal" to another empty one.
# Container shape: every container has a DNS-label name (lowercase letter first, letter or digit last, at most 63 characters) and a well-formed, duplicate-free environment list. Duplicates are
# NEVER collapsed into a map: they are refused outright, before comparing, fingerprinting, adopting or resuming.
CONTAINERS_OK='type == "array" and length >= 1 and all(.[]; type == "object" and (.name | type == "string" and test("\\A[a-z]([a-z0-9-]{0,61}[a-z0-9])?\\z")) and ((.env // []) | type == "array" and all(.[]; type == "object" and (.name | type == "string" and length > 0) and ((has("value") and has("valueFrom")) | not)) and ((map(.name) | length) == (map(.name) | unique | length))))'
valid_service_json() { jq -e '.spec.template.spec.containers != null and (.status.traffic | type == "array")' <<<"$1" >/dev/null 2>&1 && jq -e ".spec.template.spec.containers | $CONTAINERS_OK" <<<"$1" >/dev/null 2>&1; }
valid_revision_json() { jq -e '.spec.containers != null and (.status.conditions | type == "array")' <<<"$1" >/dev/null 2>&1 && jq -e ".spec.containers | $CONTAINERS_OK" <<<"$1" >/dev/null 2>&1; }
read_svc() { local o; o=$(describe "$1") || { echo "STOP: the metadata command for service $1 failed (nonzero exit status): its output is not accepted" >&2; return 1; }; valid_service_json "$o" || { echo "STOP: service $1 metadata is malformed, has a duplicate or malformed environment entry, or an invalid container name (names only shown)" >&2; return 1; }; printf '%s' "$o"; }
read_rev() { local o; o=$(revjson "$1") || { echo "STOP: the metadata command for revision $1 failed (nonzero exit status): its output is not accepted" >&2; return 1; }; valid_revision_json "$o" || { echo "STOP: revision $1 metadata is malformed, has a duplicate or malformed environment entry, or an invalid container name (names only shown)" >&2; return 1; }; printf '%s' "$o"; }
need_service_json() { valid_service_json "$1" || die "could not read service $2: metadata failed, is malformed, has a duplicate or malformed environment entry, or an invalid container name: no conclusion drawn"; }
need_revision_json() { valid_revision_json "$1" || die "could not read revision $2: metadata failed, is malformed, has a duplicate or malformed environment entry, or an invalid container name: no conclusion drawn"; }
# Canonical, secret-safe fingerprint of everything a NEW revision would inherit. Values are hashed (12 hex) and never printed; secret references are compared too.
# $1 = JSON, $2 = "svc" (service object: template under .spec.template) or "rev" (revision object).
fingerprint() {
  local norm; if [ "$2" = svc ]; then norm='{spec:.spec.template.spec, ann:(.spec.template.metadata.annotations // {})}'; else norm='{spec:.spec, ann:(.metadata.annotations // {})}'; fi
  jq -r "$norm"' | (.spec) as $s | (.ann) as $a |
    def ann_keys: ["autoscaling.knative.dev/minScale","autoscaling.knative.dev/maxScale","run.googleapis.com/cpu-throttling","run.googleapis.com/execution-environment","run.googleapis.com/vpc-access-connector","run.googleapis.com/vpc-access-egress","run.googleapis.com/startup-cpu-boost","run.googleapis.com/cloudsql-instances","run.googleapis.com/container-dependencies","run.googleapis.com/network-interfaces","run.googleapis.com/sessionAffinity","run.googleapis.com/health-check-disabled","run.googleapis.com/cmek-key","run.googleapis.com/gpu-type"];
    (["SA","serviceAccount",($s.serviceAccountName // "")], ["RT","containerConcurrency",(($s.containerConcurrency // "") | tostring)], ["RT","timeoutSeconds",(($s.timeoutSeconds // "") | tostring)], ["RT","volumes",(($s.volumes // []) | tojson)],
     (ann_keys[] as $k | ["ANN",$k,($a[$k] // "")]),
     (($s.containers // []) | to_entries[] | .key as $i | .value as $c |
        ["RT","c\($i).name",($c.name // "")], ["RT","c\($i).limits",(($c.resources.limits // {}) | tojson)], ["RT","c\($i).ports",(($c.ports // []) | tojson)],
        ["RT","c\($i).command",(($c.command // []) | tojson)], ["RT","c\($i).args",(($c.args // []) | tojson)], ["RT","c\($i).mounts",([($c.volumeMounts // [])[] | [.name,.mountPath]] | tojson)], ["RT","c\($i).probes",([$c.startupProbe, $c.livenessProbe, $c.readinessProbe] | tojson)], ["RT","c\($i).security",(($c.securityContext // {}) | tojson)], ["RT","c\($i).workdir",($c.workingDir // "")],
        (($c.env // [])[] | if .valueFrom then ["ENVREF","c\($i).\(.name)",(if .valueFrom.secretKeyRef then "secret:\(.valueFrom.secretKeyRef.name)@\(.valueFrom.secretKeyRef.key)" else (.valueFrom | tojson) end)] else ["ENV","c\($i).\(.name)",(.value // "")] end))) | @tsv' <<<"$1" |
  while IFS=$'\t' read -r kind key val; do printf '%s\t%s\t%s\n' "$kind" "$key" "$(printf %s "$val" | h12)"; done | sort
}
# The exact checks a0-smoke.sh must have passed (names are part of the evidence; the shift refuses any other set).
SMOKE_CHECKS=("preflight before auth (204)" "foreign origin refused (403)" "no token on a read (401)" "generic bootstrap stays closed (403)" "campaign/asset writes stay closed (403)" "workspace permission ACTIVE: unauthenticated request reaches auth (401, not 403)" "authenticated read through bridge -> new API -> database (200)" "authenticated response carries the recorded Fairway project fingerprint")
# A new revision inherits the service's LATEST TEMPLATE, not the serving revision. Refuse unless the two agree on every relevant value (names, values by hash, secret references, service identity, runtime settings).
# API only: exactly TWO reviewed differences are accepted (BG-LAUNCH-009 / BG-017C-07 security decisions; see docs/launch/BG_RELEASE08_A0_RECONCILIATION.md). Anything else, or either of these with any other content, is refused.
# The only template-only/changed bridge environment names accepted as superseded (reviewed, BG-RELEASE08-A0 bridge reconciliation). Any other name is refused.
REVIEWED_BRIDGE_ENV="BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256 BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID BG_BRIDGE_SOURCE_SHA"
APPROVED_ROLE_NAME=bizgenie-staging-supabase-service-role-key; APPROVED_ROLE_VERSION=1; HISTORICAL_ROLE_NAME=bizgenie-supabase-service-role-key; APPROVED_ISOLATION=local
template_matches_serving() { # $1 service name  $2 serving revision  $3 "reconcile-api" to allow the two reviewed API differences
  local sj rj sfp rfp key applied="" bad="" k superseded=""
  sj=$(read_svc "$1") || die "cannot read service $1: no conclusion drawn"; rj=$(read_rev "$2") || die "cannot read revision $2: no conclusion drawn"
  sfp=$(fingerprint "$sj" svc) || die "the fingerprint of $1 failed (nonzero status): no conclusion drawn"; rfp=$(fingerprint "$rj" rev) || die "the fingerprint of revision $2 failed (nonzero status): no conclusion drawn"
  # a fingerprint that is empty or lacks its identity line means the comparator itself failed: never "equal"
  printf '%s\n' "$sfp" | grep -q '^SA' && printf '%s\n' "$rfp" | grep -q '^SA' && [ "$(printf '%s\n' "$sfp" | wc -l)" -ge 20 ] && [ "$(printf '%s\n' "$rfp" | wc -l)" -ge 20 ] || die "the comparison of $1 could not be computed (comparator failure): no conclusion drawn"
  declare -A S R; while IFS=$'\t' read -r k1 k2 v; do S["$k1|$k2"]=$v; done <<<"$sfp"; while IFS=$'\t' read -r k1 k2 v; do R["$k1|$k2"]=$v; done <<<"$rfp"
  for key in $(printf '%s\n' "${!S[@]}" "${!R[@]}" | sort -u); do
    [ "${S[$key]:-<absent>}" = "${R[$key]:-<absent>}" ] && continue
    if [ "${3:-}" = reconcile-api ] && [ "$key" = "ENV|c0.VIDEO_INSPECTION_ISOLATION" ] && [ -z "${R[$key]:-}" ] && [ "${S[$key]:-}" = "$(printf %s "$APPROVED_ISOLATION" | h12)" ] \
       && [ "${S[ENV|c0.BIZGENIE_ENVIRONMENT]:-x}" = "$(printf staging | h12)" ]; then applied="$applied VIDEO_INSPECTION_ISOLATION(absent->approved staging value)"
    elif [ "${3:-}" = reconcile-api ] && [ "$key" = "ENVREF|c0.SUPABASE_SERVICE_ROLE_KEY" ] && [ "${S[$key]:-}" = "$(printf 'secret:%s@%s' "$APPROVED_ROLE_NAME" "$APPROVED_ROLE_VERSION" | h12)" ] \
       && [ "$(jq -r '[.spec.containers[]?.env[]? | select(.name == "SUPABASE_SERVICE_ROLE_KEY") | .valueFrom.secretKeyRef.name][0] // ""' <<<"$rj")" = "$HISTORICAL_ROLE_NAME" ]; then
      applied="$applied SUPABASE_SERVICE_ROLE_KEY($HISTORICAL_ROLE_NAME@$(jq -r '[.spec.containers[]?.env[]? | select(.name == "SUPABASE_SERVICE_ROLE_KEY") | .valueFrom.secretKeyRef.key][0] // "?"' <<<"$rj")->$APPROVED_ROLE_NAME@$APPROVED_ROLE_VERSION)"
    elif [ "${3:-}" = reconcile-bridge ] && [[ "$key" == ENV\|c0.* ]] && case " $REVIEWED_BRIDGE_ENV " in *" ${key#ENV|c0.} "*) true;; *) false;; esac && [ -z "${S[ENVREF|${key#ENV|}]:-}${R[ENVREF|${key#ENV|}]:-}" ]; then superseded="$superseded ${key#ENV|c0.}"
    elif [ "${3:-}" = reconcile-bridge ] && [ "$key" = "RT|c0.name" ] && bridge_container_name_ok "$sj" "$rj" "${S[ANN|run.googleapis.com/container-dependencies]:-}" "${S[RT|volumes]:-}" "${R[RT|volumes]:-}"; then applied="$applied container-name($(jq -r '.spec.template.spec.containers[0].name' <<<"$sj")<-$(jq -r '.spec.containers[0].name' <<<"$rj"))"
    else bad="$bad
  ${key%%|*} ${key#*|}"; fi
  done
  if [ "${3:-}" = reconcile-bridge ]; then
    # Structural guards that hold on BOTH sides whatever the container names are (identical names must not bypass them): one container, a plain name, no sidecar dependencies, one plain HTTP/1 port 8080.
    bridge_structure "$sj" tmpl || bad="$bad
  RT structure (the latest bridge template: exactly one plain container, no sidecar dependency, one HTTP/1 port 8080, no volumes)"
    bridge_structure "$rj" rev || bad="$bad
  RT structure (the serving bridge revision: exactly one plain container, no sidecar dependency, one HTTP/1 port 8080, no volumes)"
    # Secret-backed environment is NOT replaced by --env-vars-file: it would be inherited silently. Refuse it on either side, and any secret/cloud-sql volume.
    for k in "${!S[@]}" "${!R[@]}"; do case "$k" in ENVREF\|*) bad="$bad
  ENVREF ${k#*|} (secret-backed bridge environment is not allowed)";; esac; done
    [ "${S[RT|volumes]:-}" = "$(printf '[]' | h12)" ] && [ "${R[RT|volumes]:-}" = "$(printf '[]' | h12)" ] || bad="$bad
  RT volumes (bridge volumes are not allowed)"
  fi
  if [ -n "$bad" ]; then echo "template differs from the serving revision in (kind, key; values are never shown):$bad" >&2; die "the latest $1 template is not the serving configuration: review and resolve before any new revision is created"; fi
  if [ "${3:-}" = reconcile-bridge ] && { [ -n "$applied" ] || [ -n "$superseded" ]; }; then
    [[ "${EV_BRIDGE_RECONCILIATION:-}" =~ ^https://github\.com/shirrie01/bizgenie-api/issues/191#issuecomment-[0-9]+$ ]] || die "bridge template differences are present; export EV_BRIDGE_RECONCILIATION=<distinct founder approval comment URL in #191> to proceed"
    for o in EV_RECONCILIATION EV_APPROVAL EV_SCOPE EV_ROLLBACK EV_TAG; do [ "$EV_BRIDGE_RECONCILIATION" != "${!o:-}" ] || die "EV_BRIDGE_RECONCILIATION must be distinct from $o"; done
    echo "approved bridge reconciliation (evidence $EV_BRIDGE_RECONCILIATION):$applied"
    echo "environment settings superseded (NOT inherited: the A0 deployment replaces the whole bridge environment with the validated A0 file):$superseded"
  elif [ -n "$applied" ]; then
    [[ "${EV_RECONCILIATION:-}" =~ ^https://github\.com/shirrie01/bizgenie-api/issues/191#issuecomment-[0-9]+$ ]] || die "the two reviewed API differences are present; export EV_RECONCILIATION=<founder approval comment URL in #191> to proceed"
    echo "approved reconciliation (evidence $EV_RECONCILIATION):$applied"
  else echo "$1 template equals the serving revision"; fi
}
bridge_structure() { # $1 json, $2 tmpl|rev
  local q; if [ "$2" = tmpl ]; then q='.spec.template.spec as $s | (.spec.template.metadata.annotations // {}) as $a'; else q='.spec as $s | (.metadata.annotations // {}) as $a'; fi
  jq -e "$q"' | ($s.containers | length) == 1 and ($s.containers[0].name | type == "string" and test("\\A[a-z]([a-z0-9-]{0,61}[a-z0-9])?\\z")) and (($a["run.googleapis.com/container-dependencies"] // "") == "")
    and (($s.volumes // []) | length) == 0 and (($s.containers[0].volumeMounts // []) | length) == 0
    and (($s.containers[0].ports // []) | length) == 1 and $s.containers[0].ports[0].containerPort == 8080 and (($s.containers[0].ports[0].name // "http1") == "http1") and (($s.containers[0].ports[0].protocol // "TCP") == "TCP")' <<<"$1" >/dev/null 2>&1
}
# A reviewed container-name change is safe only when nothing can depend on the name: a single container on both sides, no sidecar dependencies, no volumes, a plain DNS-label name.
bridge_container_name_ok() { # $1 service json  $2 revision json  $3 dependency-annotation hash  $4/$5 volume hashes
  local n1 n2; n1=$(jq -r '.spec.template.spec.containers[0].name // ""' <<<"$1"); n2=$(jq -r '.spec.containers[0].name // ""' <<<"$2")
  [ "$(jq '.spec.template.spec.containers | length' <<<"$1")" = 1 ] && [ "$(jq '.spec.containers | length' <<<"$2")" = 1 ] || return 1
  [[ "$n1" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ && "$n2" =~ ^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || return 1
  [ "$3" = "$(printf '' | h12)" ]
}
# The ONLY environment names the A0 bridge file may contain (PORT is reserved by Cloud Run and must not be set). Flags must have the exact values below.
A0_ENV_NAMES="BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION BG_BRIDGE_ALLOW_SOCIAL_WRITES BG_BRIDGE_ALLOW_STRIPE_CHECKOUT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_ALLOW_WRITES BG_BRIDGE_AUDIENCE BG_BRIDGE_BIND BG_BRIDGE_FOUNDER_AUTH_USER_ID BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID BG_BRIDGE_REVIEW_REF BG_BRIDGE_REVISION BG_BRIDGE_SOURCE_SHA BG_BRIDGE_STUDIO_ORIGIN BG_BRIDGE_TARGET_URL BIZGENIE_ENVIRONMENT SUPABASE_PUBLISHABLE_KEY SUPABASE_URL"
validate_a0_env_file() { # $1 = env file written by a0-prepare.sh; $2 (optional) = the accepted API revision it must be pinned to. Values are checked, never printed.
  local f="$1" names n v j bad="" aud tu
  [ -s "$f" ] || die "A0 bridge env file missing: run a0-prepare.sh first"
  [ "$(awk '!/^[A-Za-z0-9_]+: /{n++} END{print n+0}' "$f")" = 0 ] || die "the A0 bridge env file contains lines that are not NAME: value"
  names=$(sed -E 's/^([A-Za-z0-9_]+):.*/\1/' "$f" | sort)
  [ -z "$(printf '%s\n' "$names" | uniq -d)" ] || die "the A0 bridge env file contains duplicate names"
  j=$(jq -Rn '[inputs | select(length > 0) | capture("^(?<k>[A-Za-z0-9_]+): (?<v>.*)$") | {key:.k, value:(.v | fromjson)}] | from_entries' < "$f" 2>/dev/null) || die "the A0 bridge env file has a malformed value"
  jq -e 'all(.[]; type == "string")' <<<"$j" >/dev/null || die "every A0 bridge setting must be a string"
  # Shell command substitution strips trailing newlines and the checks below use it: so no value may contain a control character at all (printable ASCII only).
  jq -e 'all(.[]; test("\\A[ -~]*\\z"))' <<<"$j" >/dev/null || die "an A0 bridge setting contains a control character or non-ASCII character"
  for n in $names; do case " $A0_ENV_NAMES " in *" $n "*) ;; *) bad="$bad $n";; esac; done
  [ -z "$bad" ] || die "the A0 bridge env file contains names that are not on the approved list:$bad"
  for n in $A0_ENV_NAMES; do printf '%s\n' "$names" | grep -qx "$n" || die "the A0 bridge env file lacks required setting $n"; done
  g() { jq -r --arg n "$1" '.[$n]' <<<"$j"; }
  for n in BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION BG_BRIDGE_ALLOW_SOCIAL_WRITES BG_BRIDGE_ALLOW_STRIPE_CHECKOUT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_ALLOW_WRITES; do
    [ "$(g $n)" = false ] || die "unsafe or missing flag: $n must be exactly false"; done
  [ "$(g BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE)" = true ] || die "BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE must be exactly true for the A0 workspace profile"
  [ "$(g BIZGENIE_ENVIRONMENT)" = staging ] || die "BIZGENIE_ENVIRONMENT must be staging"
  [ "$(g SUPABASE_URL)" = https://zrczojyxebwjgpymbmgu.supabase.co ] || die "SUPABASE_URL is not the staging project"
  [ "$(g BG_BRIDGE_STUDIO_ORIGIN)" = https://bizgenie-studio-staging.pages.dev ] || die "BG_BRIDGE_STUDIO_ORIGIN is not the staging Studio origin"
  [ "$(g BG_BRIDGE_SOURCE_SHA)" = dfd49116a0fe6bde11dbc25ca4599a03b8046999 ] || die "BG_BRIDGE_SOURCE_SHA is not the accepted upstream API SHA"
  [ "$(g BG_BRIDGE_BIND)" = 0.0.0.0 ] || die "BG_BRIDGE_BIND must be 0.0.0.0"
  v=$(g BG_BRIDGE_REVISION); [[ "$v" =~ ^bizgenie-api-staging-[0-9]{5}-[a-z0-9]{3}$ ]] || die "BG_BRIDGE_REVISION is not an API revision name"
  [ -z "${2:-}" ] || [ "$v" = "$2" ] || die "BG_BRIDGE_REVISION is not the accepted API revision recorded in the state"
  aud=$(g BG_BRIDGE_AUDIENCE); tu=$(g BG_BRIDGE_TARGET_URL)
  [[ "$aud" =~ ^https://(bizgenie-api-staging-[a-z0-9]+(-[a-z0-9]+)*\.a\.run\.app|bizgenie-api-staging-[0-9]+\.europe-west1\.run\.app)$ ]] || die "BG_BRIDGE_AUDIENCE is not the API service URL"
  [ "$tu" = "https://${TAG}---${aud#https://}" ] || die "BG_BRIDGE_TARGET_URL is not the tagged URL of that API service"
  v=$(g SUPABASE_PUBLISHABLE_KEY); case "$v" in ""|sb_secret_*|eyJ*|*[[:space:]]*) die "SUPABASE_PUBLISHABLE_KEY is missing, malformed or not a publishable key";; esac
  [ "$(g BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY)" = fonzo.workspace.v1 ] || die "workspace idempotency key is not the accepted one"
  [ "$(g BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME)" = Fonzo ] || die "workspace business name is not Fonzo"
  v=$(g BG_BRIDGE_FOUNDER_AUTH_USER_ID); [[ "$v" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || die "founder identity pin is malformed"
  [ "$(printf %s "$v" | sha256sum | cut -c1-8)" = "${EXPECT_FOUNDER_H:-d5a6f5ec}" ] || die "founder identity pin does not match the recorded fingerprint"
  v=$(g BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID); [ "$(printf %s "$v" | sha256sum | cut -c1-8)" = "${EXPECT_TENANT_H:-7129d2ba}" ] || die "workspace tenant pin does not match the recorded fingerprint"
  v=$(g BG_BRIDGE_REVIEW_REF); [[ "$v" =~ ^https://github\.com/shirrie01/bizgenie-api/issues/191#issuecomment-[0-9]+$ ]] || die "BG_BRIDGE_REVIEW_REF is not an evidence comment URL"
  [ -n "${EV_APPROVAL:-}" ] && [ "$v" = "$EV_APPROVAL" ] || die "BG_BRIDGE_REVIEW_REF is not the release approval (EV_APPROVAL is required)"
}
# Names only: what the A0 deployment keeps, replaces, adds and removes relative to the serving revision and the latest template.
print_env_plan() { # $1 service json  $2 serving revision json
  local sv tp; sv=$(jq -r '[.spec.containers[0].env[]?.name] | sort | .[]' <<<"$2"); tp=$(jq -r '[.spec.template.spec.containers[0].env[]?.name] | sort | .[]' <<<"$1")
  local a0; a0=$(printf '%s\n' $A0_ENV_NAMES | sort)
  echo "A0 environment plan (names only):"
  echo "  retained (serving and A0):   $(comm -12 <(echo "$sv") <(echo "$a0") | tr '\n' ' ')"
  echo "  added (A0 only):             $(comm -13 <(echo "$sv") <(echo "$a0") | tr '\n' ' ')"
  echo "  removed (serving only):      $(comm -23 <(echo "$sv") <(echo "$a0") | tr '\n' ' ')"
  echo "  latest-template-only names not carried forward: $(comm -13 <(echo "$sv") <(echo "$tp") | comm -23 - <(echo "$a0") | tr '\n' ' ')"
}
# One consolidated READ-ONLY diagnostic for the bridge template. Prints only safe facts: presence, equality, boolean flag values, expected-value matches. Never prints ids, tokens, key material or campaign contents.
diagnose_bridge() {
  local sj rj; sj=$(read_svc "$BRIDGE_SVC") || die "cannot read the bridge service: no conclusion drawn"; rj=$(read_rev "$BASE_BRIDGE_REV") || die "cannot read the serving bridge revision: no conclusion drawn"
  tv() { jq -r --arg n "$1" '[.spec.template.spec.containers[0].env[]? | select(.name == $n)][0] | if . == null then "<absent>" elif .valueFrom then "<secret-ref>" else (.value // "") end' <<<"$sj"; }
  sv() { jq -r --arg n "$1" '[.spec.containers[0].env[]? | select(.name == $n)][0] | if . == null then "<absent>" elif .valueFrom then "<secret-ref>" else (.value // "") end' <<<"$rj"; }
  echo "== permission flags (true/false values are safe to show)"
  for n in BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_ALLOW_WRITES BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING BG_BRIDGE_ALLOW_FOUNDER_RECOMMENDATIONS BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION BG_BRIDGE_ALLOW_SOCIAL_WRITES BG_BRIDGE_ALLOW_STRIPE_CHECKOUT; do
    t=$(tv $n); s_=$(sv $n); case "$t" in true|false|"<absent>"|"<secret-ref>") ;; *) t="<other value>";; esac; case "$s_" in true|false|"<absent>"|"<secret-ref>") ;; *) s_="<other value>";; esac; printf '  %-46s template=%-10s serving=%s\n' "$n" "$t" "$s_"; done
  echo "== campaign pins (presence and match to the recorded Fairway fingerprints only)"
  for n in BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID:${EXPECT_TENANT_H:-7129d2ba} BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID:${EXPECT_PROJECT_H:-b321c195} BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID:${EXPECT_BRAND_H:-01e15c41}; do
    k=${n%%:*}; hh=${n##*:}; t=$(tv $k); if [ "$t" = "<absent>" ]; then m=absent; else [ "$(printf %s "$t" | sha256sum | cut -c1-8)" = "$hh" ] && m="present, MATCHES the Fairway fingerprint" || m="present, does not match Fairway"; fi; printf '  %-46s %s\n' "$k" "$m"; done
  t=$(tv BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256); [ "$t" = "<absent>" ] && echo "  BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256         absent" || { [[ "$t" =~ ^[a-f0-9]{64}$ ]] && echo "  BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256         present, well-formed (value not shown)" || echo "  BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256         present, malformed"; }
  echo "== source SHA"; t=$(tv BG_BRIDGE_SOURCE_SHA); s_=$(sv BG_BRIDGE_SOURCE_SHA); printf '  template equals accepted API SHA dfd49116...: %s; serving equals it: %s\n' "$([ "$t" = dfd49116a0fe6bde11dbc25ca4599a03b8046999 ] && echo yes || echo no)" "$([ "$s_" = dfd49116a0fe6bde11dbc25ca4599a03b8046999 ] && echo yes || echo no)"
  echo "== container (names and runtime shape are not secret)"
  echo "  template container names: $(jq -r '[.spec.template.spec.containers[].name] | join(",")' <<<"$sj")   serving container names: $(jq -r '[.spec.containers[].name] | join(",")' <<<"$rj")"
  echo "  template ports/limits equal serving: $([ "$(jq -c '[.spec.template.spec.containers[0].ports, .spec.template.spec.containers[0].resources.limits]' <<<"$sj")" = "$(jq -c '[.spec.containers[0].ports, .spec.containers[0].resources.limits]' <<<"$rj")" ] && echo yes || echo NO)"
  echo "  probes present (template/serving): $(jq -r '[.spec.template.spec.containers[0] | (.startupProbe != null), (.livenessProbe != null), (.readinessProbe != null)] | @csv' <<<"$sj") / $(jq -r '[.spec.containers[0] | (.startupProbe != null), (.livenessProbe != null), (.readinessProbe != null)] | @csv' <<<"$rj")"
  echo "  volumes template/serving: $(jq '(.spec.template.spec.volumes // []) | length' <<<"$sj") / $(jq '(.spec.volumes // []) | length' <<<"$rj");  container-dependencies annotation present: $(jq -r '(.spec.template.metadata.annotations["run.googleapis.com/container-dependencies"] // "") != ""' <<<"$sj")"
  echo "  secret-backed env on template: $(jq -r '[.spec.template.spec.containers[]?.env[]? | select(.valueFrom != null) | .name] | join(",") | if . == "" then "none" else . end' <<<"$sj")   on serving: $(jq -r '[.spec.containers[]?.env[]? | select(.valueFrom != null) | .name] | join(",") | if . == "" then "none" else . end' <<<"$rj")"
  print_env_plan "$sj" "$rj"
}
# Read-only: report whether the API and bridge templates can be deployed. Changes nothing.
check_templates() {
  local rc=0
  echo "-- API template vs serving $BASE_API_REV"; ( template_matches_serving "$API_SVC" "$BASE_API_REV" reconcile-api ) || rc=1
  echo "-- bridge template vs serving $BASE_BRIDGE_REV (non-environment settings strict; reviewed bridge differences need a distinct approval)"; ( template_matches_serving "$BRIDGE_SVC" "$BASE_BRIDGE_REV" reconcile-bridge ) || rc=1
  local rj; rj=$(read_rev "$BASE_BRIDGE_REV") || die "cannot read the serving bridge revision: no conclusion drawn"
  [ "$(jq '[.spec.containers[]?.env[]? | select(.valueFrom != null)] | length' <<<"$rj")" = 0 ] || { echo "STOP: the serving bridge has secret-backed env vars; the env-file deployment would drop them" >&2; rc=1; }
  local bsj; bsj=$(read_svc "$BRIDGE_SVC") || die "cannot read the bridge service: no conclusion drawn"; print_env_plan "$bsj" "$rj"
  [ "$rc" = 0 ] && echo "TEMPLATE CHECK: PASS (read-only; nothing changed)" || { echo "TEMPLATE CHECK: FAIL (read-only; nothing changed)" >&2; return 1; }
}
# All six approval/evidence references are required, valid and pairwise distinct before the bridge is deployed (and are re-proven at the shift from the state).
EVIDENCE_NAMES="EV_APPROVAL EV_SCOPE EV_ROLLBACK EV_RECONCILIATION EV_BRIDGE_RECONCILIATION EV_TAG"
require_evidence() {
  local a b; for a in $EVIDENCE_NAMES; do [[ "${!a:-}" =~ $COMMENT_RE ]] || die "$a is required and must be a #191 issue-comment URL"; done
  for a in $EVIDENCE_NAMES; do for b in $EVIDENCE_NAMES; do [ "$a" = "$b" ] || [ "${!a}" != "${!b}" ] || die "$a and $b must be distinct evidence references"; done; done
}
# --- recovery: an exact baseline readback is the ONLY proof of recovery. Anything else is INDETERMINATE: a lock file blocks every further shift, resume or smoke until rollback-bridge proves the baseline.
LOCKF="$PRIV/a0-indeterminate.json"
refuse_if_indeterminate() { [ ! -e "$LOCKF" ] || die "INDETERMINATE: an earlier traffic recovery could not be verified (lock $LOCKF). No shift, resume or smoke is allowed. Verify what the bridge serves by hand, then run: bash a0-deploy.sh rollback-bridge"; }
mark_indeterminate() { umask 077; mkdir -p "$PRIV"; jq -n --arg at "$(date -u +%FT%TZ)" --arg why "$1" --arg base "$BASE_BRIDGE_REV" '{state:"INDETERMINATE",at:$at,reason:$why,baseline:$base}' > "$LOCKF" 2>/dev/null || printf '{"state":"INDETERMINATE"}\n' > "$LOCKF"; chmod 600 "$LOCKF" 2>/dev/null
  invalidate_downstream || rm -f "$EVID"
  echo "INDETERMINATE: $1. The bridge may NOT be serving $BASE_BRIDGE_REV. No further shift or resume is allowed. Run by hand NOW and verify: gcloud run services update-traffic $BRIDGE_SVC --project=$P --region=$R --to-revisions=$BASE_BRIDGE_REV=100 ; then: bash a0-deploy.sh rollback-bridge" >&2; exit 1; }
# Traffic readback proof. EVERY entry is validated BEFORE any filtering or selection: the traffic list must be a non-empty array of objects, each with a revision name that proves the exact
# revision (tag/URL-only and latestRevision targets are refused), an integer percentage in [0,100] (missing, null, string, boolean, negative, fractional and over-100 are refused), an optional
# string tag, and no duplicate (revision, tag) target. Valid 0 % tagged revisions are fine. Only after that, exactly one revision may carry traffic: the expected one at exactly 100 %.
TRAFFIC_ARRAY_OK='(.status.traffic | type == "array" and length >= 1 and all(.[]; type == "object" and (.percent | type == "number" and . == floor and . >= 0 and . <= 100) and (.revisionName | type == "string" and length > 0) and ((has("tag") | not) or (.tag | type == "string" and length > 0))) and (([.[] | [.revisionName, (.tag // "")]] | length) == ([.[] | [.revisionName, (.tag // "")]] | unique | length)))'
traffic_array_ok() { jq -e "$TRAFFIC_ARRAY_OK" <<<"$1" >/dev/null 2>&1; }
traffic_exact() { # $1 service json  $2 the one revision that must carry exactly 100 %
  traffic_array_ok "$1" && jq -e --arg r "$2" '[.status.traffic[] | select(.percent > 0)] as $p | ($p | length) == 1 and $p[0].revisionName == $r and $p[0].percent == 100 and ([.status.traffic[].percent] | add) == 100' <<<"$1" >/dev/null 2>&1; }
# Exact baseline readback: the service is readable and well-formed, and exactly one traffic target carries traffic: the recorded baseline revision at 100 %.
baseline_readback_ok() { local j; j=$(read_svc "$BRIDGE_SVC" 2>/dev/null) || return 1; traffic_exact "$j" "$BASE_BRIDGE_REV"; }
restore_baseline() { # $1 = why. Returns only when the baseline was PROVEN by readback; otherwise exits INDETERMINATE.
  echo "restoring the recorded rollback target $BASE_BRIDGE_REV ($1)" >&2
  if gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100" >&2 && baseline_readback_ok; then invalidate_downstream; echo "RECOVERED: exact baseline readback confirms $BASE_BRIDGE_REV serves 100% ($1); earlier smoke evidence is no longer usable" >&2; return 0; fi
  mark_indeterminate "restoring $BASE_BRIDGE_REV could not be verified ($1)"; }
# --- resume / duplicate protection --------------------------------------------------------------------------------------------------------------------
# `gcloud run deploy --tag` silently MOVES an existing tag. So before any deploy, an existing tag is either adopted (proven identical: exact image digest, Ready, not serving, and for the bridge the
# exact environment of the validated A0 file) or the run stops. Nothing is ever deployed twice under the same tag.
env_equals_file() { # $1 revision json, $2 env file : the revision's plain environment must equal the file exactly (compared, never printed)
  local want have; want=$(jq -Rn '[inputs | select(length > 0) | capture("^(?<k>[A-Za-z0-9_]+): (?<v>.*)$") | {key:.k, value:(.v | fromjson)}] | from_entries' < "$2" 2>/dev/null) || return 1
  have=$(jq -c '[.spec.containers[0].env[]? | {key:.name, value:(.value // null)}] | from_entries' <<<"$1"); [ "$(jq -cS . <<<"$want")" = "$(jq -cS . <<<"$have")" ]
}
env_matches_manifest() { # $1 env file, $2 private manifest: the deployed file must be exactly the validated manifest's environment minus PORT (reserved by Cloud Run); nothing is printed
  [ -s "$2" ] || die "the private validated manifest is missing: run a0-prepare.sh again"
  local want have; want=$(jq -cS '.baseProfile.environment | select(type == "object") | del(.PORT)' "$2" 2>/dev/null) && [ -n "$want" ] || die "the private manifest has no environment to compare"
  have=$(jq -Rn '[inputs | select(length > 0) | capture("^(?<k>[A-Za-z0-9_]+): (?<v>.*)$") | {key:.k, value:(.v | fromjson)}] | from_entries' < "$1" 2>/dev/null | jq -cS .) || die "the A0 bridge env file could not be parsed"
  [ "$want" = "$have" ] || die "the A0 bridge env file is not exactly the validated manifest's environment: re-run a0-prepare.sh"
}
invalidate_downstream() { # NB: must not hide a state-file failure
  [ ! -s "$STATE" ] || jq -e . "$STATE" >/dev/null 2>&1 || die "the state file is not valid JSON: inspect it by hand" # any new attempt first removes earlier smoke eligibility and the earlier bridge checkpoint, so an early failure can never leave a shiftable state
  rm -f "$EVID"; [ -s "$STATE" ] || return 0
  jq 'del(.bridgeRevision, .bridgeDigest, .bridgeTag)' "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE" && chmod 600 "$STATE"
}
existing_tag() { # $1 service json, $2 expected bare digest, $3 baseline revision; prints the adopted revision, or nothing when the tag is free; dies when the tag exists but is not provably ours
  local t d; t=$(tag_revision "$1" "$TAG"); [ -n "$t" ] || return 0
  [ "$t" != "$3" ] || die "tag $TAG points at the serving baseline $3: refusing"
  d=$(revdigest "$t") || die "cannot read the digest of the already-tagged revision $t"
  [ "$d" = "$2" ] || die "tag $TAG already points at $t with a DIFFERENT image: a previous run was partial or foreign. Inspect it read-only; do not redeploy (a deploy would move the tag)"
  local tj; tj=$(read_rev "$t") || die "cannot read the already-tagged revision $t"; ready "$tj" || die "tag $TAG points at $t which is not Ready: inspect it before any further deployment"
  jq -e --arg r "$t" '[.status.traffic[]? | select(.revisionName == $r and ((.percent // 0) > 0))] | length == 0' <<<"$1" >/dev/null || die "the tagged revision $t is receiving traffic"
  printf '%s' "$t"
}
COMMENT_RE='^https://github\.com/shirrie01/bizgenie-api/issues/191#issuecomment-[0-9]+$'
state_get() { if [ -s "$STATE" ]; then jq -r --arg k "$1" '.[$k] // ""' "$STATE" || return 1; fi; }
epoch_of() { date -u -d "$1" +%s 2>/dev/null || echo 0; }
MAX_STATE_AGE=${MAX_STATE_AGE:-86400}
# Revisions of a service, as a sorted space-separated list (names are not secret).
list_revisions() { local o; o=$(gcloud run revisions list --service="$1" --project="$P" --region="$R" --format='value(metadata.name)') || return 1; printf '%s\n' "$o" | sort | tr '\n' ' '; }
need_baseline_in() { case " $1 " in *" $2 "*) ;; *) die "the revision list of the service could not be read or does not contain the serving baseline $2: no conclusion drawn about earlier attempts";; esac; }
verify_api_tag() { # the accepted API revision must still be the tagged, Ready, non-serving revision with the accepted digest
  [ -n "$1" ] && [[ "$2" =~ ^sha256:[a-f0-9]{64}$ ]] || die "no valid accepted API revision and digest are recorded: an empty value can never be compared with an unreadable one"
  local aj; aj=$(read_svc "$API_SVC") || die "cannot read the API service"; [ "$(tag_revision "$aj" "$TAG")" = "$1" ] || die "API tag $TAG no longer points at $1"
  [ "$(serving "$aj")" = "$BASE_API_REV" ] || die "API serving revision is no longer $BASE_API_REV"
  [ "$(revdigest "$1")" = "$2" ] || die "live digest of API revision $1 differs from the accepted digest"; local av; av=$(read_rev "$1") || die "cannot read API revision $1"; ready "$av" || die "API revision $1 is not Ready"
}
write_state() { umask 077; mkdir -p "$PRIV"; jq -n --arg k "$1" --arg v "$2" '{($k):$v}' >/dev/null; local cur='{}'; [ -s "$STATE" ] && cur=$(cat "$STATE"); jq --arg k "$1" --arg v "$2" '. + {($k):$v}' <<<"$cur" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"; chmod 600 "$STATE"; }
case "${1:-}" in
 api)
  refuse_if_indeterminate; invalidate_downstream
  : "${API_REF:?export API_REF (E1 output)}"; D="${API_REF##*@}"; J=$(read_svc "$API_SVC") || die "cannot read the API service"; [ "$(serving "$J")" = "$BASE_API_REV" ] || die "API serving revision drifted"
  [ "$(revdigest "$BASE_API_REV")" = "$BASE_API_DIGEST" ] || die "the API rollback revision digest differs from the recorded one (or could not be read)"
  NEW=$(existing_tag "$J" "$D" "$BASE_API_REV"); SREV=$(state_get apiRevision); SSTART=$(state_get apiDeployStartedAt); SBEFORE=$(state_get apiRevisionsBefore); NOWREVS=$(list_revisions "$API_SVC") || die "the revision list command failed: no conclusion drawn"; need_baseline_in "$NOWREVS" "$BASE_API_REV"
  if [ -n "$SSTART" ] && [ $(( $(date +%s) - $(epoch_of "$SSTART") )) -gt "$MAX_STATE_AGE" ] && [ -z "$NEW" ]; then die "a previous API deployment attempt ($SSTART) is older than ${MAX_STATE_AGE}s and left no verifiable tagged revision: STALE state. Inspect the service read-only; only after review remove $STATE by hand"; fi
  if [ -n "$NEW" ]; then
    [ -z "$SREV" ] || [ "$SREV" = "$NEW" ] || die "CONFLICT: the state records API revision $SREV but tag $TAG points at $NEW: do not continue"
    [ -z "$(state_get baseApiRevision)" ] || [ "$(state_get baseApiRevision)" = "$BASE_API_REV" ] || die "CONFLICT: the state was written against a different baseline"
    echo "tag $TAG already points at $NEW with the accepted digest, Ready and 0% traffic: RESUMING from this verified checkpoint (no deploy)"
  else
    [ -z "$SREV" ] || die "CONFLICT: the state records API revision $SREV but tag $TAG is no longer on any revision: do not redeploy; inspect read-only"
    if [ -n "$SBEFORE" ]; then for r in $NOWREVS; do case " $SBEFORE " in *" $r "*) ;; *) die "a previous attempt left an UNTAGGED/unrecognised revision ($r): inspect it read-only, do not redeploy";; esac; done; fi
    template_matches_serving "$API_SVC" "$BASE_API_REV" reconcile-api
    write_state baseApiRevision "$BASE_API_REV"; write_state apiRevisionsBefore "$NOWREVS"
    write_state apiDeployStartedAt "$(date -u +%FT%TZ)"
    gcloud run deploy "$API_SVC" --project="$P" --region="$R" --image="$API_REF" --no-traffic --tag="$TAG" --quiet || die "the API deploy command failed. A revision may exist. Do NOT redeploy by hand: re-run this step, which adopts an exact tagged match or stops with a reason. Verify serving is still $BASE_API_REV"
    J=$(read_svc "$API_SVC") || die "cannot read the API service after the deploy"; NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged revision not found"
  fi
  [ "$(serving "$J")" = "$BASE_API_REV" ] || die "SERVING TRAFFIC CHANGED: roll back with: gcloud run services update-traffic $API_SVC --to-revisions=$BASE_API_REV=100 --project=$P --region=$R"
  [ "$(revdigest "$NEW")" = "$D" ] || die "new API revision digest differs from API_REF"; NJ=$(read_rev "$NEW") || die "cannot read the new API revision"; ready "$NJ" || die "new API revision is not Ready"
  write_state apiRevision "$NEW"; write_state apiDigest "$D"; write_state apiVerifiedAt "$(date -u +%FT%TZ)"
  echo "NEW_API_REVISION=$NEW  NEW_API_TAG=$TAG  digest=$D"; echo "traffic unchanged (still $BASE_API_REV). Post the readback in #191 (EV_TAG), then run a0-prepare.sh.";;
 bridge)
  refuse_if_indeterminate; invalidate_downstream
  : "${BRIDGE_REF:?export BRIDGE_REF}"; BD="${BRIDGE_REF##*@}"; Y="$PRIV/a0-bridge-env.yaml"; [ -s "$Y" ] || die "run a0-prepare.sh first ($Y missing)"; [ -s "$STATE" ] || die "state file missing: run 'a0-deploy.sh api' first"
  APIREV=$(jq -r '.apiRevision // ""' "$STATE"); APIDIG=$(jq -r '.apiDigest // ""' "$STATE"); [ -n "$APIREV" ] && [ -n "$APIDIG" ] || die "state has no accepted API revision"
  verify_api_tag "$APIREV" "$APIDIG"
  require_evidence
  [ -z "$(state_get evTag)" ] || { [ "$(state_get evTag)" = "$EV_TAG" ] && [ "$(state_get evTagRevision)" = "$APIREV" ]; } || die "CONFLICT: the state binds a different EV_TAG/revision pair"
  J=$(read_svc "$BRIDGE_SVC") || die "cannot read the bridge service"; [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted"
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  validate_a0_env_file "$Y" "$APIREV"; env_matches_manifest "$Y" "$PRIV/a0-manifest.json"
  NEW=$(existing_tag "$J" "$BD" "$BASE_BRIDGE_REV")
  if [ -n "$NEW" ]; then echo "bridge tag $TAG already points at $NEW with the accepted digest: ADOPTING it only if its environment equals the validated A0 file"
  else
    SBB=$(state_get bridgeRevisionsBefore); NOWB=$(list_revisions "$BRIDGE_SVC") || die "the revision list command failed: no conclusion drawn"; need_baseline_in "$NOWB" "$BASE_BRIDGE_REV"
    if [ -n "$SBB" ]; then for r in $NOWB; do case " $SBB " in *" $r "*) ;; *) die "a previous attempt left an UNTAGGED/unrecognised bridge revision ($r): inspect it read-only, do not redeploy";; esac; done; fi
    template_matches_serving "$BRIDGE_SVC" "$BASE_BRIDGE_REV" reconcile-bridge
    write_state bridgeRevisionsBefore "$NOWB"; write_state bridgeDeployStartedAt "$(date -u +%FT%TZ)"
    gcloud run deploy "$BRIDGE_SVC" --project="$P" --region="$R" --image="$BRIDGE_REF" --env-vars-file="$Y" --no-traffic --tag="$TAG" --quiet || die "the bridge deploy command failed. Do NOT redeploy by hand: re-run this step, which adopts an exact tagged match or stops with a reason. Verify serving is still $BASE_BRIDGE_REV"
    J=$(read_svc "$BRIDGE_SVC") || die "cannot read the bridge service after the deploy"; NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged bridge revision not found"
  fi
  [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "SERVING TRAFFIC CHANGED: run: bash a0-deploy.sh rollback-bridge"
  [ "$(revdigest "$NEW")" = "$BD" ] || die "new bridge revision digest differs from BRIDGE_REF"
  RJ=$(read_rev "$NEW") || die "cannot read the bridge revision"; ready "$RJ" || die "the bridge revision is not Ready"
  env_equals_file "$RJ" "$Y" || die "the bridge revision's environment is not exactly the validated A0 file"
  [ "$(jq -r '[.spec.containers[0].env[]? | select(.name == "BG_BRIDGE_REVISION") | .value][0] // ""' <<<"$RJ")" = "$APIREV" ] || die "the bridge is not pinned to the accepted API revision $APIREV"
  write_state bridgeRevision "$NEW"; write_state bridgeDigest "$BD"; write_state bridgeTag "$TAG"; write_state evTag "$EV_TAG"; write_state evTagRevision "$APIREV"; write_state evReconciliation "$EV_RECONCILIATION"; write_state evBridgeReconciliation "$EV_BRIDGE_RECONCILIATION"; write_state evApproval "$EV_APPROVAL"; write_state evScope "$EV_SCOPE"; write_state evRollback "$EV_ROLLBACK"; rm -f "$EVID"
  echo "bridge A0 revision $NEW deployed under tag $TAG with 0% traffic; serving still $BASE_BRIDGE_REV. Next: bash a0-smoke.sh (mandatory), then shift-bridge.";;
 shift-bridge)
  refuse_if_indeterminate
  : "${BRIDGE_REF:?export BRIDGE_REF (the accepted E1 reference; independent of the state file)}"; : "${A0_CONFIRM_REVISION:?type the bridge revision name you are accepting, as A0_CONFIRM_REVISION}"
  [ -s "$STATE" ] && [ -s "$EVID" ] || die "state or smoke evidence missing: run a0-deploy.sh bridge and a0-smoke.sh first"
  REV=$(jq -r .bridgeRevision "$STATE"); DIG=$(jq -r .bridgeDigest "$STATE"); APIREV=$(jq -r .apiRevision "$STATE")
  [ -n "$REV" ] && [ -n "$DIG" ] && [ -n "$APIREV" ] || die "no verified bridge checkpoint in the state: the last attempt did not complete"
  [ "$A0_CONFIRM_REVISION" = "$REV" ] || die "A0_CONFIRM_REVISION does not equal the accepted revision"
  [ "$DIG" = "${BRIDGE_REF##*@}" ] || die "accepted digest (BRIDGE_REF) differs from the deployed A0 digest"
  NAMES=$(printf '%s\n' "${SMOKE_CHECKS[@]}" | jq -R . | jq -sc .)
  NOW=$(date +%s); jq -e --arg rev "$REV" --arg dig "$DIG" --arg tag "$TAG" --arg api "$APIREV" --arg apidig "$(jq -r '.apiDigest // ""' "$STATE")" --arg evtag "$(state_get evTag)" --argjson names "$NAMES" --argjson now "$NOW" --argjson max "$MAX_EVIDENCE_AGE" \
    '.revision == $rev and .digest == $dig and .tag == $tag and .apiRevision == $api and .apiDigest == $apidig and .evTag == $evtag and .authenticatedRead == true and ([.checks[]?.name] | sort) == ($names | sort) and (.checks | all(.result == "PASS")) and ($now - .passedAt) >= 0 and ($now - .passedAt) <= $max' "$EVID" >/dev/null \
    || die "smoke evidence does not cover this exact revision/digest, is incomplete (the authenticated read is mandatory), failed, or is older than ${MAX_EVIDENCE_AGE}s: rerun a0-smoke.sh"
  J=$(read_svc "$BRIDGE_SVC") || die "cannot read the bridge service"; [ "$(tag_revision "$J" "$TAG")" = "$REV" ] || die "tag $TAG no longer points at $REV"
  [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted since the smoke test"
  traffic_exact "$J" "$BASE_BRIDGE_REV" || die "the pre-shift traffic readback is malformed or is not exactly the recorded baseline at 100%"
  [ "$(revdigest "$REV")" = "$DIG" ] || die "live digest of $REV differs from the accepted digest"; [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  verify_api_tag "$APIREV" "$(jq -r '.apiDigest // ""' "$STATE")"
  [ "$(state_get evTagRevision)" = "$APIREV" ] || die "the state binds EV_TAG to a different API revision"
  for k1 in evApproval evScope evRollback evReconciliation evBridgeReconciliation evTag; do [[ "$(state_get $k1)" =~ $COMMENT_RE ]] || die "the state lacks a valid $k1: run the bridge step again with all six evidence references exported"; done
  for k1 in evApproval evScope evRollback evReconciliation evBridgeReconciliation evTag; do for k2 in evApproval evScope evRollback evReconciliation evBridgeReconciliation evTag; do [ "$k1" = "$k2" ] || [ "$(state_get $k1)" != "$(state_get $k2)" ] || die "the recorded evidence references $k1 and $k2 are not distinct"; done; done
  RJ=$(read_rev "$REV") || die "cannot read revision $REV"; ready "$RJ" || die "$REV is not Ready"
  jq -e '[.spec.containers[0].env[]? | select(.name | test("^BG_BRIDGE_ALLOW_(WRITES|GENERATION_CONFIRMATION|SOCIAL_WRITES|STRIPE_CHECKOUT|WORKSPACE_BOOTSTRAP|DRAFT_WORKFLOW|FOUNDER_ONBOARDING)$")) | .value == "false"] | length == 7 and all' <<<"$RJ" >/dev/null || die "the live bridge revision does not carry all seven permission flags as false"
  [ "$(jq -r '[.spec.containers[]?.env[]? | select(.name == "BG_BRIDGE_REVISION") | .value][0] // ""' <<<"$RJ")" = "$APIREV" ] || die "the bridge revision is not pinned to the accepted API revision"
  [ "$(jq -r '[.spec.containers[]?.env[]? | select(.name == "BG_BRIDGE_REVIEW_REF") | .value][0] // ""' <<<"$RJ")" = "$(state_get evApproval)" ] || die "the live revision's review reference is not the recorded release approval"
  if ! gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$REV=100"; then restore_baseline "the traffic update command failed"; die "the shift failed and was rolled back (RECOVERED above): nothing is shifted"; fi
  if ! J=$(read_svc "$BRIDGE_SVC") || ! traffic_exact "$J" "$REV"; then
    restore_baseline "the post-shift read failed, was malformed or did not show $REV at 100%"; die "the shift could not be verified and was rolled back (RECOVERED above): nothing is shifted"; fi
  echo "bridge now serves $REV (digest $DIG). Rollback: bash a0-deploy.sh rollback-bridge";;
 check-templates) check_templates;;
 diagnose-bridge) diagnose_bridge;;
 rollback-bridge)
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "recorded rollback revision digest mismatch: do not roll back blindly"
  invalidate_downstream   # a rollback ends the eligibility of every earlier smoke result and checkpoint
  BR=$(read_rev "$BASE_BRIDGE_REV") || die "cannot read the recorded rollback revision"; ready "$BR" || die "the recorded rollback revision is not Ready"
  if ! gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; then mark_indeterminate "the rollback command failed"; fi
  baseline_readback_ok || mark_indeterminate "the rollback did not settle: exact baseline readback failed"
  rm -f "$LOCKF"; echo "bridge restored to $BASE_BRIDGE_REV (verified by exact readback); any INDETERMINATE lock is cleared";;
 *) die "usage: a0-deploy.sh api|bridge|shift-bridge|rollback-bridge|check-templates|diagnose-bridge";;
esac
