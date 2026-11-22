# Release gates

Issue #7 proves what is equivalent, exposes every known deviation, and defines the reversible production transition. A green repository check is necessary but does not replace the soak and dependency drills.

## Current decision: NO-GO

Inventory, security, failure, build and live-query evidence are complete: every query has a live adapter by construction (`LIVE` in `src/data/api.ts` must implement the whole contract, `src/data/queries.contract.ts`), and there is no mock backend to fall back to (dash#324). The traffic switch remains blocked by the operator-only soak on real data and the rollback rehearsal.

| Gate | Evidence | Status |
|---|---|---|
| Route-tree and direct-handler parity | `scripts/route-matrix.ts`; `src/test/route-matrix.test.ts`; [route matrix](migration/route-matrix.md) | PASS: 63/63 mapped, 0 pending |
| Source-to-destination traceability | [traceability](migration/traceability.md), including 153 server functions and 25 components | PASS: no unexplained inventory row |
| Live backend query coverage | `LIVE: Backend` in `src/data/api.ts` (a missing query does not compile); `src/data/api.test.ts` | PASS: 111 queries, all live |
| Authorization: admin, viewer, anonymous | `src/server/authorize.test.ts`; [authorization matrix](migration/authorization-matrix.md); live: `e2e/live/authorization.ts` | PASS: 188 HTTP routes and 111 queries classified; proven live for anonymous and viewer |
| Browser acceptance | Live checks (`e2e/live/`, below): navigation, every route shape, charts, maps, graphs, the recording player, responsive shell, viewer read-only screens | Before and after every release |
| Backend unavailable/overloaded | [failure checks](migration/failure-checks.md); API, admission and proxy tests; `scripts/server-checks.sh` against a closed backend port | PASS |
| Redis unavailable | Session/fault tests | PASS; real-tier soak drill pending |
| Keycloak unavailable | OIDC tests | PASS; real-tier soak drill pending |
| Invalid environment | Boot-policy tests and production-start refusals (`scripts/server-checks.sh`, `container.yml`) | PASS |
| Unsafe cross-origin requests | Origin tests; `scripts/server-checks.sh` cross-site sign-out; live CSRF replay and cross-site sign-out (`e2e/live/authorization.ts`) | PASS |
| Production build | [production build](migration/production-build.md); `bun run build` and `scripts/server-checks.sh` in CI | PASS |
| Accessibility and performance | `docs/baselines/`; `e2e/live/a11y.ts`; `e2e/live/perf.ts` | Before and after every release |
| Operational procedures | [environment](runbooks/environment.md), [deployment](runbooks/deployment.md), [cutover](runbooks/cutover.md), [rollback](runbooks/rollback.md), [legacy removal](runbooks/legacy-removal.md) | READY |
| Rollback rehearsal before traffic switch | Cutover soak step 5 | PENDING OPERATOR ACTION |

## Go criteria

1. The live checks pass against production on the release.
2. Pull-request CI and container checks pass for the exact image digest.
3. Viewer/admin live workflows and dependency-failure drills pass on the soak host.
4. Canonical and rewrite results have no unexplained differences for the same window.
5. Rollback is rehearsed on the soak route and the canonical deployment remains healthy.

## Live checks: before and after every release

The page, browser and authorization checks need real data and a signed-in session, so they are not in GitHub CI: they run against production with the viewer test account's session, from a workstation, **before** a release (on the version in production, so a failure is known not to be the release's) and **after** it (on the new version, once deployed). See `e2e/live/README.md` for the variables and what each check proves.

```sh
BETA_URL=<the public dashboard URL> BETA_STORAGE_STATE=<viewer storage state> SHOTS_DIR=<dir> bun e2e/live/run.ts
```

The runner exits non-zero unless every check passed. A check that fails after a release and passed before it blocks the release (roll back or fix forward); one that failed before too is a known production defect with its own issue. Admin-only behavior cannot be proven this way (the only session is a viewer); an admin checks it by hand after a release.

What moved here from GitHub CI (dash#324): the browser and HTTP half of `scripts/smoke.sh` (authorization, open redirect, CSRF, sign-out, route answers), `scripts/crawl.ts`, `scripts/skeletons.ts`, `scripts/csrf.ts`, `scripts/a11y.ts`, `scripts/responsive.ts` and `scripts/perf.ts`. What stayed in CI: typecheck, lint, unit tests, build, theme and generated-file freshness, public-leak scanning, actionlint, and the production server's boot refusals and no-backend answers (`scripts/server-checks.sh`, the "Release gate (smoke)" job).

## Decisions

1. The rewrite deploys as its own Arcane project and owns a separate Redis. Canonical is unchanged during expansion and soak.
2. Traffic moves after a second-host soak by changing one proxy route. Sessions do not migrate.
3. Rollback changes that route back. Canonical remains deployable for at least seven uninterrupted days after cutover.
4. Legacy removal is a separately authorized contract phase; it is never implied by cutover approval.
