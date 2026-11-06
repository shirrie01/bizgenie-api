#!/usr/bin/env bash
# Public metadata/preflight only: no credentials, mutations or redirect following.
set -eu
api='https://staging-api.getbizgenie.com'
origin='https://bizgenie-studio-staging.pages.dev'
curl --silent --show-error --max-time 20 --dump-header - --output /dev/null \
  --request OPTIONS "$api/customer/workspace" \
  --header "Origin: $origin" --header 'Access-Control-Request-Method: GET' \
  --header 'Access-Control-Request-Headers: authorization,content-type'
curl --silent --show-error --max-time 20 --dump-header - --output /dev/null \
  --request OPTIONS "$api/customer/workspace/bootstrap" \
  --header "Origin: $origin" --header 'Access-Control-Request-Method: POST' \
  --header 'Access-Control-Request-Headers: authorization,content-type'
curl --silent --show-error --max-time 20 --dump-header - --output /dev/null \
  "$api/customer/workspace" --header "Origin: $origin"
