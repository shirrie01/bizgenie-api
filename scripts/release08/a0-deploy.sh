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
    def ann_keys: ["autoscaling.knative.dev/minScale","autoscaling.knative.dev/maxScale","run.googleapis.com/cpu-throttling","run.googleapis.com/execution-environment","run.googleapis.com/vpc-access-connector","run.googleapis.com/vpc-access-egress","run.googleapis.com/startup-cpu-boost","run.googleapis.com/cloudsql-instances","run.googleapis.com/container-dependencies","run.googleapis.com/network-interfaces","run.googleapis.com/sessionAffinity","run.googleapis.com/health-check-disabled","run.googleapis.com/cmek-key","run.googleapis.com/gpu-type"];
    (["SA","serviceAccount",($s.serviceAccountName // "")], ["RT","containerConcurrency",(($s.containerConcurrency // "") | tostring)], ["RT","timeoutSeconds",(($s.timeoutSeconds // "") | tostring)], ["RT","volumes",(($s.volumes // []) | tojson)],
     (ann_keys[] as $k | ["ANN",$k,($a[$k] // "")]),
     (($s.containers // []) | to_entries[] | .key as $i | .value as $c |
        ["RT","c\($i).name",($c.name // "")], ["RT","c\($i).limits",(($c.resources.limits // {}) | tojson)], ["RT","c\($i).ports",([($c.ports // [])[] | .containerPort] | tojson)],
        ["RT","c\($i).command",(($c.command // []) | tojson)], ["RT","c\($i).args",(($c.args // []) | tojson)], ["RT","c\($i).mounts",([($c.volumeMounts // [])[] | [.name,.mountPath]] | tojson)], ["RT","c\($i).probes",([$c.startupProbe, $c.livenessProbe, $c.readinessProbe] | tojson)], ["RT","c\($i).security",(($c.securityContext // {}) | tojson)], ["RT","c\($i).workdir",($c.workingDir // "")],
        (($c.env // [])[] | if .valueFrom then ["ENVREF","c\($i).\(.name)",(if .valueFrom.secretKeyRef then "secret:\(.valueFrom.secretKeyRef.name)@\(.valueFrom.secretKeyRef.key)" else (.valueFrom | tojson) end)] else ["ENV","c\($i).\(.name)",(.value // "")] end))) | @tsv' <<<"$1" |
  while IFS=$'\t' read -r kind key val; do printf '%s\t%s\t%s\n' "$kind" "$key" "$(printf %s "$val" | h12)"; done | sort
}
# A new revision inherits the service's LATEST TEMPLATE, not the serving revision. Refuse unless the two agree on every relevant value (names, values by hash, secret references, service identity, runtime settings).
# API only: exactly TWO reviewed differences are accepted (BG-LAUNCH-009 / BG-017C-07 security decisions; see docs/launch/BG_RELEASE08_A0_RECONCILIATION.md). Anything else, or either of these with any other content, is refused.
# The only template-only/changed bridge environment names accepted as superseded (reviewed, BG-RELEASE08-A0 bridge reconciliation). Any other name is refused.
REVIEWED_BRIDGE_ENV="BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_CAMPAIGN_ROOT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_FOUNDER_CAMPAIGN_BODY_SHA256 BG_BRIDGE_FOUNDER_CAMPAIGN_BRAND_ID BG_BRIDGE_FOUNDER_CAMPAIGN_PROJECT_ID BG_BRIDGE_FOUNDER_CAMPAIGN_TENANT_ID BG_BRIDGE_SOURCE_SHA"
APPROVED_ROLE_NAME=bizgenie-staging-supabase-service-role-key; APPROVED_ROLE_VERSION=1; HISTORICAL_ROLE_NAME=bizgenie-supabase-service-role-key; APPROVED_ISOLATION=local
template_matches_serving() { # $1 service name  $2 serving revision  $3 "reconcile-api" to allow the two reviewed API differences
  local sj rj sfp rfp key applied="" bad="" k superseded=""
  sj=$(describe "$1"); rj=$(revjson "$2"); sfp=$(fingerprint "$sj" svc); rfp=$(fingerprint "$rj" rev)
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
# A reviewed container-name change is safe only when nothing can depend on the name: a single container on both sides, no sidecar dependencies, no volumes, a plain DNS-label name.
bridge_container_name_ok() { # $1 service json  $2 revision json  $3 dependency-annotation hash  $4/$5 volume hashes
  local n1 n2; n1=$(jq -r '.spec.template.spec.containers[0].name // ""' <<<"$1"); n2=$(jq -r '.spec.containers[0].name // ""' <<<"$2")
  [ "$(jq '.spec.template.spec.containers | length' <<<"$1")" = 1 ] && [ "$(jq '.spec.containers | length' <<<"$2")" = 1 ] || return 1
  [[ "$n1" =~ ^[a-z][a-z0-9-]{0,62}$ && "$n2" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || return 1
  [ "$3" = "$(printf '' | h12)" ]
}
# The ONLY environment names the A0 bridge file may contain (PORT is reserved by Cloud Run and must not be set). Flags must have the exact values below.
A0_ENV_NAMES="BG_BRIDGE_ALLOW_DRAFT_WORKFLOW BG_BRIDGE_ALLOW_FOUNDER_ADDITIONAL_WORKSPACE BG_BRIDGE_ALLOW_FOUNDER_ONBOARDING BG_BRIDGE_ALLOW_GENERATION_CONFIRMATION BG_BRIDGE_ALLOW_SOCIAL_WRITES BG_BRIDGE_ALLOW_STRIPE_CHECKOUT BG_BRIDGE_ALLOW_WORKSPACE_BOOTSTRAP BG_BRIDGE_ALLOW_WRITES BG_BRIDGE_AUDIENCE BG_BRIDGE_BIND BG_BRIDGE_FOUNDER_AUTH_USER_ID BG_BRIDGE_FOUNDER_WORKSPACE_BUSINESS_NAME BG_BRIDGE_FOUNDER_WORKSPACE_IDEMPOTENCY_KEY BG_BRIDGE_FOUNDER_WORKSPACE_TENANT_ID BG_BRIDGE_REVIEW_REF BG_BRIDGE_REVISION BG_BRIDGE_SOURCE_SHA BG_BRIDGE_STUDIO_ORIGIN BG_BRIDGE_TARGET_URL BIZGENIE_ENVIRONMENT SUPABASE_PUBLISHABLE_KEY SUPABASE_URL"
validate_a0_env_file() { # $1 = env file written by a0-prepare.sh; $2 (optional) = the accepted API revision it must be pinned to. Values are checked, never printed.
  local f="$1" names n v j bad="" aud tu
  [ -s "$f" ] || die "A0 bridge env file missing: run a0-prepare.sh first"
  [ "$(grep -cvE '^[A-Za-z0-9_]+: ' "$f" || true)" = 0 ] || die "the A0 bridge env file contains lines that are not NAME: value"
  names=$(sed -E 's/^([A-Za-z0-9_]+):.*/\1/' "$f" | sort)
  [ -z "$(printf '%s\n' "$names" | uniq -d)" ] || die "the A0 bridge env file contains duplicate names"
  j=$(jq -Rn '[inputs | select(length > 0) | capture("^(?<k>[A-Za-z0-9_]+): (?<v>.*)$") | {key:.k, value:(.v | fromjson)}] | from_entries' < "$f" 2>/dev/null) || die "the A0 bridge env file has a malformed value"
  jq -e 'all(.[]; type == "string")' <<<"$j" >/dev/null || die "every A0 bridge setting must be a string"
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
  [ -z "${EV_APPROVAL:-}" ] || [ "$v" = "$EV_APPROVAL" ] || die "BG_BRIDGE_REVIEW_REF is not the release approval"
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
  local sj rj; sj=$(describe "$BRIDGE_SVC"); rj=$(revjson "$BASE_BRIDGE_REV")
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
  local rj; rj=$(revjson "$BASE_BRIDGE_REV")
  [ "$(jq '[.spec.containers[]?.env[]? | select(.valueFrom != null)] | length' <<<"$rj")" = 0 ] || { echo "STOP: the serving bridge has secret-backed env vars; the env-file deployment would drop them" >&2; rc=1; }
  print_env_plan "$(describe "$BRIDGE_SVC")" "$rj"
  [ "$rc" = 0 ] && echo "TEMPLATE CHECK: PASS (read-only; nothing changed)" || { echo "TEMPLATE CHECK: FAIL (read-only; nothing changed)" >&2; return 1; }
}
# --- resume / duplicate protection --------------------------------------------------------------------------------------------------------------------
# `gcloud run deploy --tag` silently MOVES an existing tag. So before any deploy, an existing tag is either adopted (proven identical: exact image digest, Ready, not serving, and for the bridge the
# exact environment of the validated A0 file) or the run stops. Nothing is ever deployed twice under the same tag.
env_equals_file() { # $1 revision json, $2 env file : the revision's plain environment must equal the file exactly (compared, never printed)
  local want have; want=$(jq -Rn '[inputs | select(length > 0) | capture("^(?<k>[A-Za-z0-9_]+): (?<v>.*)$") | {key:.k, value:(.v | fromjson)}] | from_entries' < "$2") || return 1
  have=$(jq -c '[.spec.containers[0].env[]? | {key:.name, value:(.value // null)}] | from_entries' <<<"$1"); [ "$(jq -cS . <<<"$want")" = "$(jq -cS . <<<"$have")" ]
}
existing_tag() { # $1 service json, $2 expected bare digest, $3 baseline revision; prints the adopted revision, or nothing when the tag is free; dies when the tag exists but is not provably ours
  local t d; t=$(tag_revision "$1" "$TAG"); [ -n "$t" ] || return 0
  [ "$t" != "$3" ] || die "tag $TAG points at the serving baseline $3: refusing"
  d=$(revdigest "$t") || die "cannot read the digest of the already-tagged revision $t"
  [ "$d" = "$2" ] || die "tag $TAG already points at $t with a DIFFERENT image: a previous run was partial or foreign. Inspect it read-only; do not redeploy (a deploy would move the tag)"
  ready "$(revjson "$t")" || die "tag $TAG points at $t which is not Ready: inspect it before any further deployment"
  jq -e --arg r "$t" '[.status.traffic[]? | select(.revisionName == $r and ((.percent // 0) > 0))] | length == 0' <<<"$1" >/dev/null || die "the tagged revision $t is receiving traffic"
  printf '%s' "$t"
}
COMMENT_RE='^https://github\.com/shirrie01/bizgenie-api/issues/191#issuecomment-[0-9]+$'
state_get() { [ -s "$STATE" ] && jq -r --arg k "$1" '.[$k] // ""' "$STATE" || true; }
epoch_of() { date -u -d "$1" +%s 2>/dev/null || echo 0; }
MAX_STATE_AGE=${MAX_STATE_AGE:-86400}
# Revisions of a service, as a sorted space-separated list (names are not secret).
list_revisions() { gcloud run revisions list --service="$1" --project="$P" --region="$R" --format='value(metadata.name)' | sort | tr '\n' ' '; }
verify_api_tag() { # the accepted API revision must still be the tagged, Ready, non-serving revision with the accepted digest
  local aj; aj=$(describe "$API_SVC"); [ "$(tag_revision "$aj" "$TAG")" = "$1" ] || die "API tag $TAG no longer points at $1"
  [ "$(serving "$aj")" = "$BASE_API_REV" ] || die "API serving revision is no longer $BASE_API_REV"
  [ "$(revdigest "$1")" = "$2" ] || die "live digest of API revision $1 differs from the accepted digest"; ready "$(revjson "$1")" || die "API revision $1 is not Ready"
}
write_state() { umask 077; mkdir -p "$PRIV"; jq -n --arg k "$1" --arg v "$2" '{($k):$v}' >/dev/null; local cur='{}'; [ -s "$STATE" ] && cur=$(cat "$STATE"); jq --arg k "$1" --arg v "$2" '. + {($k):$v}' <<<"$cur" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"; chmod 600 "$STATE"; }
case "${1:-}" in
 api)
  : "${API_REF:?export API_REF (E1 output)}"; D="${API_REF##*@}"; J=$(describe "$API_SVC"); [ "$(serving "$J")" = "$BASE_API_REV" ] || die "API serving revision drifted"
  NEW=$(existing_tag "$J" "$D" "$BASE_API_REV"); SREV=$(state_get apiRevision); SSTART=$(state_get apiDeployStartedAt); SBEFORE=$(state_get apiRevisionsBefore); NOWREVS=$(list_revisions "$API_SVC")
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
    J=$(describe "$API_SVC"); NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged revision not found"
  fi
  [ "$(serving "$J")" = "$BASE_API_REV" ] || die "SERVING TRAFFIC CHANGED: roll back with: gcloud run services update-traffic $API_SVC --to-revisions=$BASE_API_REV=100 --project=$P --region=$R"
  [ "$(revdigest "$NEW")" = "$D" ] || die "new API revision digest differs from API_REF"; ready "$(revjson "$NEW")" || die "new API revision is not Ready"
  write_state apiRevision "$NEW"; write_state apiDigest "$D"; write_state apiVerifiedAt "$(date -u +%FT%TZ)"
  echo "NEW_API_REVISION=$NEW  NEW_API_TAG=$TAG  digest=$D"; echo "traffic unchanged (still $BASE_API_REV). Post the readback in #191 (EV_TAG), then run a0-prepare.sh.";;
 bridge)
  : "${BRIDGE_REF:?export BRIDGE_REF}"; BD="${BRIDGE_REF##*@}"; Y="$PRIV/a0-bridge-env.yaml"; [ -s "$Y" ] || die "run a0-prepare.sh first ($Y missing)"; [ -s "$STATE" ] || die "state file missing: run 'a0-deploy.sh api' first"
  APIREV=$(jq -r '.apiRevision // ""' "$STATE"); APIDIG=$(jq -r '.apiDigest // ""' "$STATE"); [ -n "$APIREV" ] && [ -n "$APIDIG" ] || die "state has no accepted API revision"
  verify_api_tag "$APIREV" "$APIDIG"
  [[ "${EV_TAG:-}" =~ $COMMENT_RE ]] || die "EV_TAG (the #191 comment holding the tagged API revision readback) is required before the bridge is deployed"
  for o in EV_APPROVAL EV_SCOPE EV_ROLLBACK EV_RECONCILIATION EV_BRIDGE_RECONCILIATION; do [ -z "${!o:-}" ] || [ "${!o}" != "$EV_TAG" ] || die "EV_TAG must be distinct from $o"; done
  [ -z "$(state_get evTag)" ] || { [ "$(state_get evTag)" = "$EV_TAG" ] && [ "$(state_get evTagRevision)" = "$APIREV" ]; } || die "CONFLICT: the state binds a different EV_TAG/revision pair"
  J=$(describe "$BRIDGE_SVC"); [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "bridge serving revision drifted"
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "rollback digest differs from the recorded one"
  validate_a0_env_file "$Y" "$APIREV"
  NEW=$(existing_tag "$J" "$BD" "$BASE_BRIDGE_REV")
  if [ -n "$NEW" ]; then echo "bridge tag $TAG already points at $NEW with the accepted digest: ADOPTING it only if its environment equals the validated A0 file"
  else
    template_matches_serving "$BRIDGE_SVC" "$BASE_BRIDGE_REV" reconcile-bridge
    write_state bridgeDeployStartedAt "$(date -u +%FT%TZ)"
    gcloud run deploy "$BRIDGE_SVC" --project="$P" --region="$R" --image="$BRIDGE_REF" --env-vars-file="$Y" --no-traffic --tag="$TAG" --quiet || die "the bridge deploy command failed. Do NOT redeploy by hand: re-run this step, which adopts an exact tagged match or stops with a reason. Verify serving is still $BASE_BRIDGE_REV"
    J=$(describe "$BRIDGE_SVC"); NEW=$(tag_revision "$J" "$TAG"); [ -n "$NEW" ] || die "tagged bridge revision not found"
  fi
  [ "$(serving "$J")" = "$BASE_BRIDGE_REV" ] || die "SERVING TRAFFIC CHANGED: run: bash a0-deploy.sh rollback-bridge"
  [ "$(revdigest "$NEW")" = "$BD" ] || die "new bridge revision digest differs from BRIDGE_REF"
  RJ=$(revjson "$NEW"); ready "$RJ" || die "the bridge revision is not Ready"
  env_equals_file "$RJ" "$Y" || die "the bridge revision's environment is not exactly the validated A0 file"
  [ "$(jq -r '[.spec.containers[0].env[]? | select(.name == "BG_BRIDGE_REVISION") | .value][0] // ""' <<<"$RJ")" = "$APIREV" ] || die "the bridge is not pinned to the accepted API revision $APIREV"
  write_state bridgeRevision "$NEW"; write_state bridgeDigest "$BD"; write_state bridgeTag "$TAG"; write_state evTag "$EV_TAG"; write_state evTagRevision "$APIREV"; write_state evReconciliation "${EV_RECONCILIATION:-}"; write_state evBridgeReconciliation "${EV_BRIDGE_RECONCILIATION:-}"; rm -f "$EVID"
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
  verify_api_tag "$APIREV" "$(jq -r '.apiDigest // ""' "$STATE")"
  [[ "$(state_get evTag)" =~ $COMMENT_RE && "$(state_get evBridgeReconciliation)" =~ $COMMENT_RE && "$(state_get evReconciliation)" =~ $COMMENT_RE ]] && [ "$(state_get evTagRevision)" = "$APIREV" ] || die "the state lacks the bound evidence references (EV_TAG for this API revision, API and bridge reconciliations): run the bridge step again with them exported"
  RJ=$(revjson "$REV"); ready "$RJ" || die "$REV is not Ready"
  jq -e '[.spec.containers[0].env[]? | select(.name | test("^BG_BRIDGE_ALLOW_(WRITES|GENERATION_CONFIRMATION|SOCIAL_WRITES|STRIPE_CHECKOUT|WORKSPACE_BOOTSTRAP|DRAFT_WORKFLOW|FOUNDER_ONBOARDING)$")) | .value == "false"] | length == 7 and all' <<<"$RJ" >/dev/null || die "the live bridge revision does not carry all seven permission flags as false"
  [ "$(jq -r '[.spec.containers[]?.env[]? | select(.name == "BG_BRIDGE_REVISION") | .value][0] // ""' <<<"$RJ")" = "$APIREV" ] || die "the bridge revision is not pinned to the accepted API revision"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$REV=100"
  J=$(describe "$BRIDGE_SVC"); if [ "$(serving "$J")" != "$REV" ]; then echo "post-shift check FAILED: restoring" >&2; gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; die "traffic did not settle on $REV; restored $BASE_BRIDGE_REV"; fi
  echo "bridge now serves $REV (digest $DIG). Rollback: bash a0-deploy.sh rollback-bridge";;
 check-templates) check_templates;;
 diagnose-bridge) diagnose_bridge;;
 rollback-bridge)
  [ "$(revdigest "$BASE_BRIDGE_REV")" = "$BASE_BRIDGE_DIGEST" ] || die "recorded rollback revision digest mismatch: do not roll back blindly"
  ready "$(revjson "$BASE_BRIDGE_REV")" || die "the recorded rollback revision is not Ready"
  gcloud run services update-traffic "$BRIDGE_SVC" --project="$P" --region="$R" --to-revisions="$BASE_BRIDGE_REV=100"; echo "bridge restored to $BASE_BRIDGE_REV";;
 *) die "usage: a0-deploy.sh api|bridge|shift-bridge|rollback-bridge|check-templates|diagnose-bridge";;
esac
