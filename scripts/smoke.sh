#!/usr/bin/env bash
# Clean-clone smoke test: clone, install from the lockfile, run every gate,
# then start the Bun production server and check key routes over HTTP.
#
# Usage: scripts/smoke.sh [git-url-or-path] [ref]
#   defaults to this repository's origin and the current branch.
set -euo pipefail

SRC="${1:-$(git remote get-url origin)}"
REF="${2:-$(git rev-parse --abbrev-ref HEAD)}"
PORT="${SMOKE_PORT:-3199}"
WORK="$(mktemp -d)"
SERVER_PID=""
BACKEND_PID=""

cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }

step "clone $SRC @ $REF"
git clone --quiet --depth 1 --branch "$REF" "$SRC" "$WORK/app"
cd "$WORK/app"

step "install (frozen lockfile)"
bun install --frozen-lockfile

step "typecheck";  bunx tsc --noEmit
step "lint";       bun run lint
step "unit tests"; bun run test
step "theme outputs match source"; bun run theme:check
step "build";      bun run build

step "the server refuses an environment that would open it"
refuses() {
  local code="$1"; shift
  if env -u SERVICE_TOKEN -u OIDC_DISABLED -u APIARY_ALLOW_UNAUTH_DEV "$@" PORT="$PORT" bun run start >"$WORK/refusal.log" 2>&1; then
    printf '  FAIL started anyway (%s)\n' "$code"; return 1
  fi
  if grep -q "$code" "$WORK/refusal.log"; then printf '  ok   refused with %s\n' "$code"; else printf '  FAIL no %s in the refusal\n' "$code"; return 1; fi
}
refuses E-SERVICE-TOKEN env
refuses E-EXPORT-TOKEN env SERVICE_TOKEN=smoke EXPORT_TOKEN=smoke
refuses E-OIDC-DISABLED env SERVICE_TOKEN=smoke OIDC_DISABLED=1 NODE_ENV=production
refuses E-OIDC-ISSUER env SERVICE_TOKEN=smoke NODE_ENV=production

step "start production server on :$PORT"
APIARY_ALLOW_UNAUTH_DEV=1 SERVICE_TOKEN=smoke-token PORT="$PORT" bun run start >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
  curl -s -o /dev/null "http://localhost:$PORT/healthz" && break
  sleep 0.2
done

# Signed in as the operator through the mock identity provider.
signin() { curl -s -o /dev/null -D - "http://localhost:$PORT/auth/callback?code=mock&role=${1:-admin}" | tr -d '\r' | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p'; }
COOKIE="$(signin admin)"
[[ -n "$COOKIE" ]] || { echo "sign-in failed"; exit 1; }

# path  expected-status
CHECKS=(
  "/ 200"
  "/events?kind=login 200"
  "/sources/198.51.100.13 200"
  "/sources/198.51.100.13/timeline?range=7d 200"
  "/payloads/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/sandbox 200"
  "/investigate/ip/198.51.100.13 301"
  "/campaigns/198.51.100.0%2F26/why 200"
  "/networks/198.51.100.0%2F26 200"
  "/asn/AS9009 200"
  "/sensors/conpot-s7-1200/exposure 200"
  "/investigate/cidr/198.51.100.0%2F26 301"
  "/investigate/cluster?kind=credential&value=root%3Atoor 301"
  "/ml-anomalies/anom-e1a6f09f39/triage 200"
  "/alerts/sensor%7CSensor%20suricata%20silent%20for%203h%2010m/evidence 200"
  "/recordings/89090804218391c1e01f60efae130436c0001cf6acbe087b582dd8dd5fc12bd5/attacker 200"
  "/tty-replay/89090804218391c1e01f60efae130436c0001cf6acbe087b582dd8dd5fc12bd5 301"
  "/reports/generated/rpt-8256dc8894 200"
  "/dead-letters/nope 404"
  "/iocs?kind=cve 200"
  "/ioc/cve/CVE-2017-0144/timeline 200"
  "/ioc/credential/root%3Atoor 200"
  "/investigate/lookup 301"
  "/watchlist 200"
  "/asn/AS9009/timeline 200"
  "/reports?step=library 301"
  "/reports/generate?template=threat 200"
  "/reports/history 200"
  "/reports/templates 200"
  "/reports/library 200"
  "/payload-workbench/results?tab=ghidra 200"
  "/settings?pane=services 307"
  "/sensors 307"
  "/sources/10.0.0.1 404"
  "/no-such-page 404"
  "/favicon.ico 200"
  "/favicon-32x32.png 200"
  "/site.webmanifest 200"
  "/brand/apiary-compact-mark-for-light.png 200"
  "/brand/apiary-compact-mark-for-dark.png 200"
  "/healthz 200"
  "/export/portbridge-manual-blackhole.txt 200"
  "/export/portbridge-manual-blackhole.txt?mock=unavailable 502"
  "/auth/login 200"
  "/auth/login?fail=unavailable 200"
  "/auth/callback?code=expired 200"
  "/auth/callback?error=invalid_request 200"
  "/auth/callback?code=failed 200"
  "/auth/callback?code=mock&return_to=%2F%2Fevil.example.test 307"
  "/api/export/events.csv?sensor=cowrie 200"
  "/api/export/history.json?q=wget 200"
  "/api/export/nope 404"
  "/api/export/commands.csv?mock=unavailable 502"
  "/api/chart/os-distribution 200"
  "/api/chart/ml-backlog 200"
  "/api/chart/netflow-bytes 200"
  "/api/chart/anomaly-trend 200"
  "/api/chart/nope 404"
  "/api/chart/attacker-fusion 502"
  "/api/chart/os-distribution?mock=unavailable 502"
  "/api/topology/flow 200"
  "/api/payload/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/download 200"
  "/api/payload/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/download?mock=viewer 403"
  "/api/recording/89090804218391c1e01f60efae130436c0001cf6acbe087b582dd8dd5fc12bd5/cast 200"
  "/api/recording/89090804218391c1e01f60efae130436c0001cf6acbe087b582dd8dd5fc12bd5/raw 200"
  "/api/report/rpt-8256dc8894/pdf 200"
  "/api/raw-report/github-analysis/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37 200"
  "/api/artifact/ghidra/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/decompiled.c 200"
  "/api/artifact/sandbox/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/host.pcap 200"
  "/api/artifact/ghidra/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/call-graph.svg 200"
  "/api/report/rpt-payload-320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37-x/pdf 200"
  "/api/report/rpt-unknown/pdf 404"
)

# Without a session: pages go to sign-in, direct handlers refuse, and only
# the infrastructure endpoints answer.
ANON_CHECKS=(
  "/ 307"
  "/events?kind=login 307"
  "/api/export/commands.csv 401"
  "/api/payload/320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37/download 401"
  "/api/live 401"
  "/api/chart/os-distribution 401"
  "/api/topology/flow 401"
  "/healthz 200"
  "/export/portbridge-manual-blackhole.txt 401"
  "/auth/login 200"
)

step "HTTP checks, signed in"
failed=0
for check in "${CHECKS[@]}"; do
  path="${check% *}"
  want="${check##* }"
  got="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE" "http://localhost:$PORT$path")"
  if [[ "$got" == "$want" ]]; then
    printf '  ok   %s %s\n' "$got" "$path"
  else
    printf '  FAIL %s %s (expected %s)\n' "$got" "$path" "$want"
    failed=1
  fi
done

step "HTTP checks, anonymous"
for check in "${ANON_CHECKS[@]}"; do
  path="${check% *}"
  want="${check##* }"
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT$path")"
  if [[ "$got" == "$want" ]]; then printf '  ok   %s %s\n' "$got" "$path"; else printf '  FAIL %s %s (expected %s)\n' "$got" "$path" "$want"; failed=1; fi
done

step "Content-Security-Policy: a nonce per response, on every script tag"
# -L: a saved default time range answers /events with a redirect first; the
# last response is the page.
CSP_COOKIE="$(signin admin)"
csp_page() { curl -sL -D "$WORK/csp.h" -o "$WORK/csp.html" -w '%{url_effective}' -b "$CSP_COOKIE" "http://localhost:$PORT/events" >"$WORK/csp.url"; tr -d '\r' <"$WORK/csp.h" | sed -n 's/^[Cc]ontent-[Ss]ecurity-[Pp]olicy: .*nonce-\([^'"'"']*\).*/\1/p' | tail -1; }
first="$(csp_page)"
scripts="$(grep -ao '<script[^>]*>' "$WORK/csp.html" | wc -l)"
nonced="$(grep -ao "<script[^>]*nonce=\"$first\"[^>]*>" "$WORK/csp.html" | wc -l)"
second="$(csp_page)"
if [[ -n "$first" && "$first" != "$second" && "$scripts" -gt 0 && "$scripts" -eq "$nonced" ]]; then printf '  ok   %s scripts carry the nonce, fresh per response\n' "$scripts"; else printf '  FAIL nonce "%s"/"%s", %s of %s scripts nonced (at %s)\n' "$first" "$second" "$nonced" "$scripts" "$(cat "$WORK/csp.url")"; failed=1; fi

step "sign-out: same origin only, then the session is gone"
OTHER="$(signin viewer)"
check() { if [[ "$2" == "$3" ]]; then printf '  ok   %s %s\n' "$2" "$1"; else printf '  FAIL %s %s (expected %s)\n' "$2" "$1" "$3"; failed=1; fi; }
check "cross-site sign-out" "$(curl -s -o /dev/null -w '%{http_code}' -b "$OTHER" -H 'Referer: https://evil.example.test/' "http://localhost:$PORT/auth/logout")" 403
check "sign-out" "$(curl -s -o /dev/null -w '%{http_code}' -b "$OTHER" -H "Referer: http://localhost:$PORT/events" "http://localhost:$PORT/auth/logout")" 303
check "a page after sign-out" "$(curl -s -o /dev/null -w '%{http_code}' -b "$OTHER" "http://localhost:$PORT/events")" 307

step "when the session store or the identity provider does not answer"
# A second server with the mock faults on (src/server/faults.ts): nothing
# crashes, nobody is signed in by accident, and the sign-in pages say why.
FAULT_PORT=$((PORT + 1))
body() { curl -s --max-time 5 "${@:2}" "http://localhost:$FAULT_PORT$1" | tr -d '\0'; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${@:2}" "http://localhost:$FAULT_PORT$1"; }
contains() { if grep -q "$3" <<<"$2"; then printf '  ok   %s\n' "$1"; else printf '  FAIL %s (no "%s")\n' "$1" "$3"; failed=1; fi; }
for fault in session-store identity-provider; do
  APIARY_MOCK_FAULTS="$fault" APIARY_ALLOW_UNAUTH_DEV=1 SERVICE_TOKEN=smoke-token PORT="$FAULT_PORT" bun run start >"$WORK/fault.log" 2>&1 &
  FAULT_PID=$!
  for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$FAULT_PORT/healthz" && break; sleep 0.2; done
  echo "  -- $fault down"
  check "a page with a cookie goes to sign-in" "$(code /events -b "$COOKIE")" 307
  check "a direct handler refuses" "$(code /api/live -b "$COOKIE")" 401
  check "the probe still answers" "$(code /healthz)" 200
  contains "the sign-in page says it is unavailable" "$(body /auth/login)" "temporarily unavailable"
  contains "the callback says sign-in failed" "$(body '/auth/callback?code=mock&role=admin')" "could not be completed"
  if curl -s -D - -o /dev/null "http://localhost:$FAULT_PORT/auth/callback?code=mock&role=admin" | grep -qi '^set-cookie: __Host-apiary_bff=[^;]'; then printf '  FAIL the callback set a session\n'; failed=1; else printf '  ok   no session is set\n'; fi
  check "sign-out still lets the operator out" "$(code /auth/logout -b "$COOKIE" -H "Referer: http://localhost:$FAULT_PORT/")" 303
  kill "$FAULT_PID" 2>/dev/null; wait "$FAULT_PID" 2>/dev/null || true
done

step "when the configured live backend does not answer"
BACKEND_PORT=$((PORT + 2))
APIARY_ALLOW_UNAUTH_DEV=1 SERVICE_TOKEN=smoke-token BACKEND_URL=http://127.0.0.1:1 BACKEND_TIMEOUT_MS=200 PORT="$BACKEND_PORT" bun run start >"$WORK/backend-fault.log" 2>&1 &
BACKEND_PID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$BACKEND_PORT/healthz" && break; sleep 0.2; done
BACKEND_COOKIE="$(curl -s -o /dev/null -D - "http://localhost:$BACKEND_PORT/auth/callback?code=mock&role=admin" | tr -d '\r' | sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p')"
[[ -n "$BACKEND_COOKIE" ]] || { echo "live-backend failure sign-in failed"; exit 1; }
check "a chart reports the upstream outage" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -b "$BACKEND_COOKIE" "http://localhost:$BACKEND_PORT/api/chart/os-distribution")" 502
check "the live stream reports the upstream outage" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -b "$BACKEND_COOKIE" "http://localhost:$BACKEND_PORT/api/live")" 502
# The first seeded fixture event renders on /events only when mock data leaked.
FIXTURE_MARKER="$(bun -e "import { EVENTS } from './src/data/mock/fixtures.ts'; process.stdout.write(EVENTS[0].id)")"
if ! BACKEND_PAGE="$(curl -sS --max-time 5 -b "$BACKEND_COOKIE" "http://localhost:$BACKEND_PORT/events" | tr -d '\0')"; then
  printf '  FAIL the live-backend error page did not answer\n'; failed=1
elif grep -Fq "$FIXTURE_MARKER" <<<"$BACKEND_PAGE"; then
  printf '  FAIL the live-backend error page rendered a fixture identifier\n'; failed=1
else
  printf '  ok   the live-backend error page renders no fixture identifier\n'
fi
kill "$BACKEND_PID" 2>/dev/null; wait "$BACKEND_PID" 2>/dev/null || true
BACKEND_PID=""

step "SSR link crawl, every entity tab"
bun scripts/crawl.ts "http://localhost:$PORT" 2 --samples-out "$WORK/samples.json" || failed=1

step "every page loads skeleton first in a browser, then its data"
# Needs a browser; exit 2 means none was found and the check is skipped.
bun scripts/skeletons.ts "http://localhost:$PORT" "$WORK/samples.json"
case $? in 0 | 2) ;; *) failed=1 ;; esac

step "every route shape under every mock scenario"
bun scripts/crawl.ts "http://localhost:$PORT" 1 --scenarios || failed=1

step "every kind of page at phone, tablet, laptop and 4K"
# Needs a browser; exit 2 means none was found and the check is skipped.
bun scripts/responsive.ts "http://localhost:$PORT"
case $? in 0 | 2) ;; *) failed=1 ;; esac

step "accessibility: WCAG 2.1 A/AA on every kind of page (docs/baselines)"
bun scripts/a11y.ts "http://localhost:$PORT"
case $? in 0 | 2) ;; *) failed=1 ;; esac

step "performance: page weight within the baseline (docs/baselines)"
bun scripts/perf.ts "http://localhost:$PORT"
case $? in 0 | 2) ;; *) failed=1 ;; esac

if [[ "$failed" -ne 0 ]]; then
  echo; echo "server log:"; tail -20 "$WORK/server.log"
  exit 1
fi
step "smoke passed"
