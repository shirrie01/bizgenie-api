#!/usr/bin/env bash
# BG-017C-07 — READ-ONLY metadata collection for the two staging revisions (names, digests, versions only). Prints NO secret value and NO plain environment value.
# Uses only `gcloud run revisions describe`, `gcloud run services describe`, `gcloud secrets versions list/describe` (state and create time, never `access`) and `gcloud artifacts/builds describe/list`.
set -uo pipefail
P="${P:-bizgenie-backend}"; R="${R:-europe-west1}"; S="bizgenie-api-staging"; DBSECRET="bizgenie-staging-database-url"
command -v gcloud >/dev/null && command -v jq >/dev/null || { echo "STOP: gcloud and jq are required"; exit 2; }
[ "$(gcloud config get-value project 2>/dev/null)" = "$P" ] || { echo "STOP: gcloud project is not $P"; exit 2; }
for REV in bizgenie-api-staging-00030-pob bizgenie-api-staging-00029-wtc; do
  echo "== $REV"
  gcloud run revisions describe "$REV" --project "$P" --region "$R" --format=json 2>/dev/null | jq '{
    revision: .metadata.name,
    ready: ([.status.conditions[]? | select(.type=="Ready") | .status] | first),
    image: .spec.containers[0].image,
    service_account: .spec.serviceAccountName,
    vpc_connector: (.metadata.annotations["run.googleapis.com/vpc-access-connector"] // "none"),
    vpc_egress: (.metadata.annotations["run.googleapis.com/vpc-access-egress"] // "n/a"),
    cpu_limit: .spec.containers[0].resources.limits.cpu, memory_limit: .spec.containers[0].resources.limits.memory,
    startup_probe: (.spec.containers[0].startupProbe // "default"),
    env: [.spec.containers[0].env[]? | {name, source: (if .valueFrom.secretKeyRef then ("secret:" + .valueFrom.secretKeyRef.name + "@" + (.valueFrom.secretKeyRef.key // "?")) else "plain-value-NOT-PRINTED" end)}],
    secret_volumes: [.spec.volumes[]? | select(.secret) | (.secret.secretName)]
  }' || echo "INACCESSIBLE"
done
echo "== traffic and tags"; gcloud run services describe "$S" --project "$P" --region "$R" --format=json 2>/dev/null | jq -r '.status.traffic[]? | [(.revisionName // "LATEST"), ((.percent // 0)|tostring)+"%", (.tag // "-")] | @tsv' || echo "INACCESSIBLE"
echo "== versions of $DBSECRET (state and create time only)"; gcloud secrets versions list "$DBSECRET" --project "$P" --format='value(name.basename(),state,createTime)' 2>/dev/null || echo "INACCESSIBLE"
IMG="$(gcloud run revisions describe bizgenie-api-staging-00030-pob --project "$P" --region "$R" --format='value(spec.containers[0].image)' 2>/dev/null)"
echo "== image provenance for the 00030 image"; echo "image=$IMG"
case "$IMG" in *@sha256:*) gcloud artifacts docker images describe "$IMG" --format='value(image_summary.digest,image_summary.fully_qualified_digest)' 2>/dev/null || echo "artifact metadata INACCESSIBLE"
  gcloud builds list --project "$P" --filter="results.images.digest=${IMG##*@}" --format='value(id,status,createTime,source.repoSource.commitSha,substitutions.COMMIT_SHA)' 2>/dev/null || echo "builds INACCESSIBLE";;
  *) echo "NOTE: image is not pinned by digest in the revision spec; resolve the digest before any Job uses it";; esac
echo; echo "Done. Read-only; nothing was changed."
