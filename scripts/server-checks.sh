#!/usr/bin/env bash
# What the production server does before it has any data, checked on the
# built server (run `bun run build` first). Needs no backend, no session and
# no browser, so GitHub CI runs it; everything that needs real data is a
# live check against production (e2e/live/, docs/release-gates.md).
#
# 1. It refuses to start in an environment that would open it, or that has
#    no backend: each refusal names its code.
# 2. Started against a backend that does not answer (a closed port), with
#    sign-in off as on a development instance: nothing crashes, the outages
#    are reported with their statuses, a page renders its error state with a
#    fresh CSP nonce on every script, and sign-out is same-origin only.
#
# Usage: scripts/server-checks.sh
set -euo pipefail

PORT="${SERVER_CHECKS_PORT:-3199}"
WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }
failed=0
check() { if [[ "$2" == "$3" ]]; then printf '  ok   %s %s\n' "$2" "$1"; else printf '  FAIL %s %s (expected %s)\n' "$2" "$1" "$3"; failed=1; fi; }

[[ -f dist/server/server.js ]] || { echo "no build: run bun run build first"; exit 1; }

step "the server refuses an environment that would open it, or has no backend"
refuses() {
  local code="$1"; shift
  if env -u SERVICE_TOKEN -u OIDC_DISABLED -u APIARY_ALLOW_UNAUTH_DEV -u BACKEND_URL -u OIDC_ISSUER_URL "$@" PORT="$PORT" timeout 30 bun run start >"$WORK/refusal.log" 2>&1; then
    printf '  FAIL started anyway (%s)\n' "$code"; failed=1; return
  fi
  if grep -q "$code" "$WORK/refusal.log"; then printf '  ok   refused with %s\n' "$code"; else printf '  FAIL no %s in the refusal\n' "$code"; tail -5 "$WORK/refusal.log"; failed=1; fi
}
B=BACKEND_URL=http://127.0.0.1:1
refuses E-BACKEND-URL env SERVICE_TOKEN=checks OIDC_ISSUER_URL=https://idp.example.test/realms/apiary
refuses E-BACKEND-URL env BACKEND_URL=not-a-url SERVICE_TOKEN=checks OIDC_ISSUER_URL=https://idp.example.test/realms/apiary
refuses E-SERVICE-TOKEN env "$B"
refuses E-EXPORT-TOKEN env "$B" SERVICE_TOKEN=checks EXPORT_TOKEN=checks
refuses E-OIDC-DISABLED env "$B" SERVICE_TOKEN=checks OIDC_DISABLED=1 NODE_ENV=production
refuses E-OIDC-ISSUER env "$B" SERVICE_TOKEN=checks NODE_ENV=production
refuses E-OIDC-ISSUER env "$B" SERVICE_TOKEN=checks NODE_ENV=development
refuses E-IDLE-TIMEOUT env "$B" SERVICE_TOKEN=checks APIARY_ALLOW_UNAUTH_DEV=1 OIDC_DISABLED=1 BFF_IDLE_TIMEOUT_S=10

step "start the production server on :$PORT against a backend that does not answer"
APIARY_ALLOW_UNAUTH_DEV=1 OIDC_DISABLED=1 SERVICE_TOKEN=checks BACKEND_URL=http://127.0.0.1:1 BACKEND_TIMEOUT_MS=500 PORT="$PORT" bun run start >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 100); do
  curl -s -o /dev/null "http://localhost:$PORT/healthz" && break
  sleep 0.2
done
url() { printf 'http://localhost:%s%s' "$PORT" "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${@:2}" "$(url "$1")"; }

step "the outage is reported, not hidden"
check "liveness does not touch the backend" "$(code /healthz)" 200
check "readiness says the backend is down" "$(code /readyz)" 503
check "a chart reports the upstream outage" "$(code /api/chart/os-distribution)" 502
check "the live stream reports the upstream outage" "$(code /api/live)" 502
check "an export reports the upstream outage" "$(code /api/export/events.csv)" 502
check "an unknown export is a 404 before any call" "$(code /api/export/nope)" 404
check "an unknown chart is a 404 before any call" "$(code /api/chart/nope)" 404
if PAGE="$(curl -sS --max-time 15 -L "$(url /events)" | tr -d '\0')"; then
  if grep -q "The backend did not answer" <<<"$PAGE"; then printf '  ok   a page renders the outage state\n'; else printf '  FAIL /events did not render the outage state\n'; failed=1; fi
  if grep -q "This page failed to load" <<<"$PAGE"; then printf '  FAIL /events fell through to the crash state\n'; failed=1; fi
else
  printf '  FAIL /events did not answer\n'; failed=1
fi

step "Content-Security-Policy: a nonce per response, on every script tag"
# A page that renders without the backend (the failed-sign-in page).
csp_page() { curl -sL -D "$WORK/csp.h" -o "$WORK/csp.html" --max-time 15 "$(url '/auth/callback?code=expired')" >/dev/null || true; tr -d '\r' <"$WORK/csp.h" | sed -n 's/^[Cc]ontent-[Ss]ecurity-[Pp]olicy: .*nonce-\([^'"'"']*\).*/\1/p' | tail -1; }
first="$(csp_page)"
scripts="$(grep -ao '<script[^>]*>' "$WORK/csp.html" | wc -l || true)"
nonced="$(grep -ao "<script[^>]*nonce=\"$first\"[^>]*>" "$WORK/csp.html" | wc -l || true)"
second="$(csp_page)"
if [[ -n "$first" && "$first" != "$second" && "$scripts" -gt 0 && "$scripts" -eq "$nonced" ]]; then printf '  ok   %s scripts carry the nonce, fresh per response\n' "$scripts"; else printf '  FAIL nonce "%s"/"%s", %s of %s scripts nonced\n' "$first" "$second" "$nonced" "$scripts"; failed=1; fi

step "sign-out: same origin only"
check "cross-site sign-out" "$(code /auth/logout -H 'Referer: https://evil.example.test/')" 403
check "sign-out without Origin or Referer" "$(code /auth/logout)" 403
check "same-origin sign-out" "$(code /auth/logout -H "Referer: $(url /events)")" 303

if [[ "$failed" -ne 0 ]]; then
  echo; echo "server log:"; tail -30 "$WORK/server.log"
  exit 1
fi
step "server checks passed"
