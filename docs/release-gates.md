# Release gates

Issue #7 proves what is equivalent, exposes every known deviation, and defines the reversible production transition. A green repository check is necessary but does not replace the soak and dependency drills.

## Current decision: NO-GO

Inventory, security, failure, build and live-query evidence are complete: every production query has a live adapter ([backend coverage](migration/backend-coverage.md): 0 mock-only). The traffic switch remains blocked by the operator-only soak on real data and the rollback rehearsal. No mock-only row may be silently accepted if one reappears.

| Gate | Evidence | Status |
|---|---|---|
| Route-tree and direct-handler parity | `scripts/route-matrix.ts`; `src/test/route-matrix.test.ts`; [route matrix](migration/route-matrix.md) | PASS: 63/63 mapped, 0 pending |
| Source-to-destination traceability | [traceability](migration/traceability.md), including 153 server functions and 25 components | PASS: no unexplained inventory row |
| Live backend query coverage | `scripts/backend-coverage.ts`; [backend coverage](migration/backend-coverage.md) | PASS: 106 live, 3 local (mock-scenario controls and the no-backend replay fallback), 0 mock-only |
| Authorization: admin, viewer, anonymous | `src/server/authorize.test.ts`; [authorization matrix](migration/authorization-matrix.md) | PASS: 187 HTTP routes and 108 queries classified |
| Browser acceptance | `scripts/smoke.sh`: representative lists, details, mutations, downloads, SSE, responsive shell, expired sessions, and every mock scenario | PASS in the repository gate; repeat on soak |
| Backend unavailable/overloaded | [failure checks](migration/failure-checks.md); API, admission, proxy, and smoke tests | PASS |
| Redis unavailable | Session/fault tests and injected production-build smoke | PASS; real-tier soak drill pending |
| Keycloak unavailable | OIDC/fault tests and injected production-build smoke | PASS; real-tier soak drill pending |
| Invalid environment | Boot-policy tests and production-start refusals | PASS |
| Unsafe cross-origin requests | Origin tests and cross-site sign-out smoke | PASS |
| Production build and clean clone | [production build](migration/production-build.md); `scripts/smoke.sh` | PASS |
| Accessibility and performance | `docs/baselines/`; `scripts/a11y.ts`; `scripts/perf.ts` | PASS against recorded thresholds; repeat on soak |
| Operational procedures | [environment](runbooks/environment.md), [deployment](runbooks/deployment.md), [cutover](runbooks/cutover.md), [rollback](runbooks/rollback.md), [legacy removal](runbooks/legacy-removal.md) | READY |
| Rollback rehearsal before traffic switch | Cutover soak step 5 | PENDING OPERATOR ACTION |

## Go criteria

1. Every mock-only query used by a production route is live or has a time-bounded deviation approved by product and security owners.
2. Pull-request CI and container checks pass for the exact image digest.
3. Viewer/admin live workflows and dependency-failure drills pass on the soak host.
4. Canonical and rewrite results have no unexplained differences for the same window.
5. Rollback is rehearsed on the soak route and the canonical deployment remains healthy.

## Decisions

1. The rewrite deploys as its own Arcane project and owns a separate Redis. Canonical is unchanged during expansion and soak.
2. Traffic moves after a second-host soak by changing one proxy route. Sessions do not migrate.
3. Rollback changes that route back. Canonical remains deployable for at least seven uninterrupted days after cutover.
4. Legacy removal is a separately authorized contract phase; it is never implied by cutover approval.
