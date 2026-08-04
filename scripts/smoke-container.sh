#!/usr/bin/env bash
set -euo pipefail

image="${1:?image name is required}"
container_name="${2:?container name is required}"
: "${ADMIN_KEY:?ADMIN_KEY must be set to a disposable local value}"
response_dir="$(mktemp -d)"

cleanup() {
  exit_code=$?
  if (( exit_code != 0 )); then
    docker logs "$container_name" 2>&1 || true
  fi
  docker rm --force "$container_name" >/dev/null 2>&1 || true
  rm -rf "$response_dir"
  trap - EXIT
  exit "$exit_code"
}
trap cleanup EXIT

docker run --detach \
  --name "$container_name" \
  -p 127.0.0.1::8080 \
  --env PORT=8080 \
  --env ADMIN_KEY \
  "$image" >/dev/null

host_binding="$(docker port "$container_name" 8080/tcp)"
host_port="${host_binding##*:}"
base_url="http://127.0.0.1:${host_port}"

ready=false
for _ in {1..30}; do
  status="$(
    curl --silent --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 2 --max-time 5 "$base_url/" || true
  )"
  if [[ "$status" == "200" ]]; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != "true" ]]; then
  echo "Container did not become ready within 30 attempts" >&2
  exit 1
fi

assert_response() {
  local name="$1"
  local expected_status="$2"
  local expected_body="$3"
  shift 3

  local response_file="$response_dir/${name}.body"
  local actual_status
  local actual_body

  actual_status="$(
    curl --silent --show-error --output "$response_file" \
      --write-out '%{http_code}' --connect-timeout 2 --max-time 5 "$@"
  )"
  actual_body="$(<"$response_file")"

  if [[ "$actual_status" != "$expected_status" ]]; then
    echo "$name: expected HTTP $expected_status, got $actual_status" >&2
    exit 1
  fi
  if [[ "$actual_body" != "$expected_body" ]]; then
    echo "$name: response body did not match the existing contract" >&2
    exit 1
  fi

  echo "$name: HTTP $actual_status and exact body verified"
}

assert_response root 200 'BizGenie Cloud Run is up' \
  "$base_url/"
assert_response admin-unauthorised 403 '{"error":"Forbidden"}' \
  "$base_url/_admin/ping"
assert_response admin-authorised 200 '{"status":"ok"}' \
  --header "x-admin-key: $ADMIN_KEY" \
  "$base_url/_admin/ping"
assert_response generate-empty 400 \
  '{"status":"failed","error":"Missing required fields","script_body":""}' \
  --request POST \
  --header 'content-type: application/json' \
  --header "x-admin-key: $ADMIN_KEY" \
  --data '{}' \
  "$base_url/generate-script"

