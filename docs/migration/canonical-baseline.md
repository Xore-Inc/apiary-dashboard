# Canonical baseline

## Source of truth

- Repository: `Xore/APIARY`
- Path: `arcane/home/honeypot-dashboard/frontend-next`
- Verified commit: `62ee45d30ff49e58a8dd9db2e75e4306b84b682a`
- Inventory tracker: [#2](https://github.com/Xore/apiary-dashboard/issues/2)

The local `/home/xore/Desktop/dashboard-rewrite` copy is not the deployment source of truth. Its application `src` tree matches the pinned canonical tree after normalizing line endings, but its build/runtime configuration is incomplete and materially different.

## Verified scale

- 63 non-root route modules.
- 10 direct `/api/*` route modules.
- 3 `/auth/*` routes.
- 153 `createServerFn` declarations across routes, components, and shared libraries, counted from the syntax tree. An earlier text count of 155 also matched a comment in `lib/json.ts` and a test file.
- Direct BFF, mounted-BFF, health, metrics, download, and streaming handlers outside the navigation-only guard.

These numbers are completeness checks, not migration units. Routes will be grouped into operator workflows after their dependencies are mapped.

## Routing ownership

The canonical root route owns:

- navigation authentication and safe `return_to` redirects;
- shared shell configuration and appearance loading;
- document metadata, 404 behavior, and the root document;
- the single application-shell mount.

The canonical shell owns one topbar, one sidebar, global behavior hosts, responsive shell state, and one route-content region. Navigation metadata is centralized and drives active navigation, breadcrumbs, titles, and detail-to-parent ownership.

The rewrite preserves this ownership contract while replacing legacy markup and CSS with Astryx composition.

## Security ownership

Security is layered because TanStack navigation guards do not protect direct HTTP handlers:

1. Root `beforeLoad` protects non-auth navigation.
2. Global server-function middleware enforces same-origin requests and sessions.
3. Direct API, download, streaming, auth, metrics, and proxy handlers enforce their own boundary.
4. Redis-backed OIDC sessions, PKCE/state, safe redirects, role checks, and actor forwarding provide identity and authorization.
5. Request middleware provides CSP nonces, correlation, and observability.

Canonical production startup invokes both service-token and `OIDC_DISABLED` fail-closed assertions before accepting traffic. It does this through a Nitro boot plugin and again in the Node cluster launcher. The Bun rewrite must implement equivalent pre-listen enforcement rather than copying the Nitro mechanism.

## Runtime translation

The canonical frontend currently builds with Vite and runs under Node/Nitro. The rewrite target is Bun. Behavioral and security contracts migrate; Node/Nitro-specific startup code does not.

The destination baseline must prove:

- Bun starts only after both production security assertions pass;
- TanStack SSR receives the request CSP nonce;
- server functions and direct handlers retain separate guards;
- build, typecheck, lint, tests, production start, and HTTP smoke checks pass from a clean clone.

## Inventory status

- [x] Pin the canonical commit.
- [x] Confirm route and server-function scale.
- [x] Confirm root, shell, and navigation ownership.
- [x] Confirm global and direct-route security layers.
- [x] Record every route and direct handler: [route-matrix.md](route-matrix.md) (63 routes: 46 implemented, 17 replaced, 0 pending).
- [x] Record every server function, caller, input/output, backend dependency, and permission: [server-functions.md](server-functions.md) (153 functions: 106 behind the global session gate only, 15 that re-check the session, 30 admin-only, 2 pre-authentication).
- [x] Record every shell behavior and destination owner: [shell.md](shell.md) (27 behaviors: 22 implemented, 5 replaced, 0 unmapped).
- [x] Record route data fields, mutations, and user-visible states: [routes.md](routes.md) (45 page routes).
- [x] Link each inventory row to a bounded migration issue: [slices.md](slices.md) (#74–#83, and #5 for security).
- [x] Map every production component and every server function to an existing rewrite owner: [traceability.md](traceability.md).
- [x] Every rewrite query uses the live backend (`LIVE` in `src/data/api.ts` implements the whole contract; dash#324).

The inventory is generated from the pinned tree by `bun scripts/inventory/all.ts <frontend-next dir>`; `src/test/route-matrix.test.ts` keeps it complete.
