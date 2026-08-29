#!/usr/bin/env bash
set -euo pipefail

image="${1:?image name is required}"
container_name="${2:?container name is required}"
: "${ADMIN_KEY:?ADMIN_KEY must be set to a disposable local value}"
response_dir="$(mktemp -d)"
database_container="${container_name}-postgres"
network_name="${container_name}-network"
database_password="$(openssl rand -hex 24)"

cleanup() {
  exit_code=$?
  if (( exit_code != 0 )); then
    docker logs "$container_name" 2>&1 || true
  fi
  docker rm --force "$container_name" >/dev/null 2>&1 || true
  docker rm --force "$database_container" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  rm -rf "$response_dir"
  trap - EXIT
  exit "$exit_code"
}
trap cleanup EXIT

docker network create "$network_name" >/dev/null
docker run --detach \
  --name "$database_container" \
  --network "$network_name" \
  --env POSTGRES_PASSWORD="$database_password" \
  postgres:16-alpine >/dev/null

database_ready=false
for _ in {1..30}; do
  if docker exec "$database_container" pg_isready --username postgres \
    >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 1
done
if [[ "$database_ready" != "true" ]]; then
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
fi

schema_ready=false
for _ in {1..30}; do
  if docker exec --interactive "$database_container" \
    psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL' >/dev/null 2>&1
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;
SQL
  then
    migrations_ok=true
    for migration in $(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort); do
      if ! docker exec --interactive "$database_container" \
        psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres \
        < "$migration" >/dev/null 2>&1; then
        migrations_ok=false
        echo "Failed disposable PostgreSQL migration: $migration" >&2
        break
      fi
    done

    if [[ "$migrations_ok" == "true" ]]; then
      schema_ready=true
      break
    fi
  fi
  sleep 1
done

if [[ "$schema_ready" != "true" ]]; then
  echo "Required disposable PostgreSQL schema could not be initialized" >&2
  exit 1
fi

database_url="postgresql://postgres:${database_password}@${database_container}:5432/postgres"

docker run --detach \
  --name "$container_name" \
  --network "$network_name" \
  -p 127.0.0.1::8080 \
  --env PORT=8080 \
  --env ADMIN_KEY \
  --env BRAND_BRAIN_DATABASE_URL="$database_url" \
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
