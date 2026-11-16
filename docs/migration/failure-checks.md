# Failure checks

These checks fail closed and keep destructive retries safe. `scripts/server-checks.sh` exercises the production build's HTTP behavior with a backend that does not answer; the named unit suites pin the responsible layer.

| Failure | Expected behavior | Automated evidence | Result |
|---|---|---|---|
| Backend unavailable | Pages show an explicit failure; direct chart/live/download handlers return 502, never fixture data disguised as live | `src/data/api.test.ts`; the closed-upstream checks in `scripts/server-checks.sh` | PASS |
| Backend overloaded | 503 with `Retry-After`; admission sheds are counted | `src/routes/api.proxy.test.ts`, `src/data/api.test.ts` | PASS |
| Redis unavailable | Existing cookies authenticate nobody; handlers return 401; sign-in sets no session; sign-out still clears the cookie; stored sessions are preserved for recovery | `src/server/faults.test.ts`, `src/server/session.test.ts` | PASS |
| Keycloak unavailable | Login reports temporary unavailability; callback reports failed exchange; discovery failure is not cached permanently | `src/server/oidc.server.test.ts` | PASS |
| Invalid environment | Process refuses before listening with a stable error code | `src/server/policy.test.ts`; `scripts/server-checks.sh` checks missing backend, missing service token, disabled OIDC, and missing issuer | PASS |
| Unsafe cross-origin request | State-changing server function requires same origin and `x-csrf-token`; cross-site logout returns 403 | `src/server/origin.test.ts`; `scripts/server-checks.sh` cross-site logout; live CSRF replay (`e2e/live/authorization.ts`) | PASS |

## Production rehearsal

Before traffic moves, repeat the Redis and Keycloak checks against the soak deployment by temporarily denying only the rewrite's dependency access. Confirm alerts fire, capture request IDs and timestamps, restore access, and verify the same session or a new sign-in works as documented. Do not run dependency-denial drills on the canonical deployment. The cutover runbook treats an uncompleted rehearsal as NO-GO.
