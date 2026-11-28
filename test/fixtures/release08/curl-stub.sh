#!/usr/bin/env bash
# Test stub for curl: deterministic status codes for the A0 smoke checks. Records argv (never stdin contents into argv) so tests can prove a token never appears on a command line.
echo "$*" >> "$STUB_DIR/curl-argv.log"
out=""; auth=0; args=("$@"); for ((i=0;i<${#args[@]};i++)); do case "${args[$i]}" in -o) out="${args[$((i+1))]}";; -K) auth=1;; esac; done
if [ "$auth" = 1 ]; then cat > "$STUB_DIR/curl-stdin.log"; [ -n "$out" ] && cp "$STUB_DIR/auth-body" "$out"; printf '%s' "$(cat "$STUB_DIR/auth-code")"; exit 0; fi
case "$*" in *"-X OPTIONS"*foreign*) printf 403;; *"-X OPTIONS"*) printf 204;; *"-X POST"*bootstrap*|*"-X POST"*uploads*) printf 403;; *) printf 401;; esac
