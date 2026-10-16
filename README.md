# APIARY Dashboard Rewrite

Clean-room dashboard rewrite using TanStack Start, Bun, and Astryx.

Planning and progress:

- [Implementation epic](https://github.com/Xore/apiary-dashboard/issues/1)
- [Upstream APIARY epic](https://github.com/Xore/APIARY/issues/3279)
- [Canonical running implementation](https://github.com/Xore/APIARY/tree/main/arcane/home/honeypot-dashboard/frontend-next)

The canonical implementation is a behavioral reference, not a component source to copy mechanically. Every migration slice must trace its routes, data, actions, security, and states before being rebuilt with current TanStack and Astryx conventions.

Current stage: every migration slice has a real-backend adapter behind the same server-function seam used by mock scenarios. The [backend coverage matrix](docs/migration/backend-coverage.md) records the remaining query shapes with no production endpoint or adapter; those rows block cutover instead of silently passing as parity.

## Development

```bash
bun install
bun run dev          # vite dev server on 0.0.0.0:3009, usable from the LAN (development settings)
bunx tsc --noEmit    # typecheck
bun run lint
bun run test
bun run build        # production build into dist/
SERVICE_TOKEN=… bun run start   # Bun production server (server.ts)
bun run smoke        # clean clone → install → every gate → start → HTTP and browser checks
```

### Design studio

`bun run studio` builds `design-studio/index.html`: every Astryx component the dashboard uses, rendered with the real themes (palette, light/dark and contrast switch in its toolbar), in one self-contained file that opens from disk. Each component lists variants: **A** is the current decision recorded in `DESIGN.md`; add **B**, **C**… in `design-studio/specimens.tsx` to compare alternatives side by side. `PRODUCT.md` and `DESIGN.md` hold the product and visual decisions; Astryx's own guidelines (`AGENTS.md`, `bunx astryx docs`) come first.

### CI and the container image

GitHub Actions, on GitHub-hosted runners:

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every pull request, pushes to main | public-repository safety (`scripts/check-public-leaks.ts`: no secrets, no real deployment addresses, mock data in documentation ranges only); typecheck, lint, tests, theme and generated-file freshness, build; the release gate `scripts/smoke.sh` with the runner's Chrome; `actionlint` over the workflows |
| `container.yml` | every pull request, pushes to main, `v*` tags | builds the `Dockerfile`, checks the image refuses to boot without `SERVICE_TOKEN` and serves once given one, scans it with Trivy (critical, fixable); on main and tags pushes it to `ghcr.io/xore/apiary-dashboard` (`latest`, `sha-…`, the tag) with an SBOM and a signed provenance attestation (`gh attestation verify oci://ghcr.io/xore/apiary-dashboard:latest --owner Xore`). Nothing deploys it yet. |
| `codeql.yml` | pull requests, main, weekly | CodeQL `security-extended` over the TypeScript |
| `dependency-review.yml` | pull requests | fails on a new dependency with a moderate or worse advisory |
| `pr-title.yml` | pull requests | the title is a conventional commit (it becomes the squash commit), and its kind sets the release-notes label |
| `release.yml` | `v*` tags | a GitHub Release with notes from the merged pull requests, and the production build as a tarball with a build-provenance attestation; `container.yml` pushes the image for the same tag |
| `scorecard.yml` | main, weekly | OpenSSF Scorecard supply-chain checks, into the Security tab |
| `code-review.yml` | pull requests | an automated review (Claude Code action) with inline comments; skips unless a `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` secret is set; advisory only |
| `assistant.yml` | `@claude` in a comment | answers or makes the change on a branch; owner and collaborators only |
| `bun-update.yml` | weekly (Monday) and on demand | `bun update` within package.json ranges; opens or refreshes one PR from `deps/bun-update`. With a `DEPS_PR_TOKEN` secret (fine-grained, this repository, Contents + Pull requests read/write) the PR runs the required checks; without it, checks need a push to the branch |
| `dependabot-auto-merge.yml` | Dependabot PRs | patch and minor updates merge once every required check is green; majors and 0.x minors wait for a person |

Dependabot proposes GitHub Actions and base-image updates weekly. It cannot read Bun 1.4's `bun.lock` yet, so npm packages come from `bun-update.yml` instead; TanStack packages are pinned to exact versions and move together. A ruleset on `main` requires every check above except the automated review, and blocks force pushes and deletion.

To release: `git tag v0.1.0 && git push origin v0.1.0`.

```bash
docker build -t apiary-dashboard .
docker run -p 3000:3000 -e SERVICE_TOKEN=… apiary-dashboard
```

`bun run test` covers the authorization matrix, the boot policies, sessions, nav roll-ups, formatters, and invariants over the mock backend: numbers shown on different pages must agree, and every id one page links to must resolve on its target page.

### Signing in and security

Every page needs a session. With `OIDC_ISSUER_URL` set, `/auth/login` sends the browser to Keycloak (authorization code with PKCE; the one-time state waits in Redis under `bff:oidc:pending:` for 10 minutes), `/auth/callback` creates the session, and `/auth/logout` also ends the Keycloak session. The `admin` role of the dashboard client (`resource_access.<client>.roles`) makes an admin, anyone else is a viewer. On a local instance without `OIDC_ISSUER_URL` the mock identity provider stands in: pick **Operator** (admin) or **Analyst** (viewer). The session is real:
- an opaque id in the `__Host-apiary_bff` cookie (HttpOnly, Secure, SameSite=Lax, 12 h);
- the identity behind it in Redis under `bff:session:`, shared by every instance. A local instance keeps it in memory unless `OIDC_SESSION_REDIS_URL` is set, and falls back to memory while that Redis is down.

A server function call whose session has gone (401) sends the browser to sign in once, then back to the same page (`src/lib/reauth.ts`).

On the server:
- every server function passes a **same-origin check** (a cross-site state-changing call gets 403), and a state-changing one must carry the `x-csrf-token` header the dashboard's own fetch adds;
- every query is **authorized for the caller**: no session → 401; a viewer calling an admin-only write → 403; the canonical permissions are in `src/server/authorize.ts`;
- direct handlers (`/api/*`) check the session themselves; `/healthz` is deliberately public; `/metrics` needs the service token in `x-service-token`;
- the firewall blocklist export (`/export/portbridge-manual-blackhole.txt`) takes either that service token or a signed-in session the query policy allows (see below);
- `/auth/logout` needs a same-origin Origin or Referer, then destroys the session.

#### Machine access: the blocklist export

`GET /export/portbridge-manual-blackhole.txt` returns the manual blackhole list, one IP per line (`text/plain`, `no-store`). It is the only URL the VPS firewall puller reads.

- Machine client: send the header `X-Service-Token: <SERVICE_TOKEN>`. The token is compared in constant time and is never taken from the URL or the query string. With `SERVICE_TOKEN` unset, this path never matches.
- Person: a signed-in session whose role `getBlockedIps` allows under `src/server/authorize.ts`.
- No credentials: `401 unauthorized`. A signed-in role the policy refuses: `403 forbidden`.

The VPS job sends the header from its `DASHBOARD_SERVICE_TOKEN`, which must hold the same value as `SERVICE_TOKEN`.

#### Machine access: the backend

Calls to the backend carry `x-service-token`. When a signing key is configured they also carry `x-actor-assertion`: a short-lived (60 s) Ed25519-signed JWS naming the signed-in operator (`sub`, `username`, `role`) and bound to one request (`htm`, `htu`). The backend verifies it with the public key only, so the bearer token cannot mint an identity; see `docs/BACKEND-TRUST-BOUNDARY.md` in the APIARY repository for the claims, the `off`/`log`/`enforce` modes and the rollout order.

- The `username` claim, and the plain `x-actor-username` header, are the OIDC username, not the display name. Workbench run and recipe ownership is keyed on it.
- No assertion is sent for a call with no signed-in operator (machine reads), or when no key is configured.
- Roll back to a build that does not sign only after the backend is in `log` or `off`.

The server refuses to boot in an environment that would open it:

| Variable | |
|---|---|
| `SERVICE_TOKEN` | Shared secret with the backend. Required, unless `APIARY_ALLOW_UNAUTH_DEV=1` says this is a local instance (`E-SERVICE-TOKEN`). |
| `ACTOR_ASSERTION_PRIVATE_KEY` / `ACTOR_ASSERTION_PRIVATE_KEY_FILE` | Ed25519 private key (PEM; `\n` for newlines inline) that signs operator identities for the backend. Both set, or a key that is unparsable or not Ed25519, refuses to boot (`E-ACTOR-ASSERTION-KEY`). Unset signs nothing. |
| `BACKEND_URL` | Base URL of the backend tier. Unset — the development default — leaves queries answering from the mock. Production requires it. |
| `APIARY_ALLOW_UNAUTH_DEV` | Exactly `1`: a local development instance. `bun run dev` sets it. |
| `OIDC_DISABLED` | `1` skips sign-in: everyone is a fixture admin. Only with `NODE_ENV=development` or `APIARY_ALLOW_UNAUTH_DEV=1` (`E-OIDC-DISABLED`). |
| `APIARY_DEV_HTTP_COOKIE` | Exactly `1`: the session cookie works over plain HTTP (`apiary_bff_dev`, not Secure), so a dev server can be used from another machine by its LAN address. Only with `NODE_ENV=development` or `APIARY_ALLOW_UNAUTH_DEV=1` (`E-DEV-HTTP-COOKIE`). `bun run dev` sets it and listens on 0.0.0.0. |
| `OIDC_ISSUER_URL` | The Keycloak realm, e.g. `https://sso.example.test/realms/apiary`. Required unless this is a local instance, which then uses the mock identity provider (`E-OIDC-ISSUER`). |
| `OIDC_CLIENT_ID` | The dashboard's Keycloak client. Default `apiary-dashboard`. |
| `OIDC_CLIENT_SECRET` / `OIDC_CLIENT_SECRET_FILE` | Its secret, or a file holding it (the file wins). |
| `OIDC_ALLOW_INSECURE` | Exactly `1`: a plain-HTTP issuer, for a local Keycloak only. |
| `OIDC_SESSION_REDIS_URL` | Redis for sessions and pending sign-ins. Default `redis://127.0.0.1:6379/0`. |
| `EXTERNAL_URL` | The public origin, when a proxy in front changes the Host the server sees (same-origin check, Keycloak redirect URIs). |
| `APIARY_MOCK_FAULTS` | Mock only: `session-store` and/or `identity-provider` (comma-separated) stop answering, to exercise the outage paths. Pages then go to sign-in, direct handlers answer 401, and the sign-in pages say sign-in is unavailable or failed; smoke checks both. |

See `.env.example`.

### Mock data

The mock backend (`src/data/queries.impl.ts`, fixtures in `src/data/mock/`) runs on the server only: the browser bundle has none of it. `src/data/queries.ts` is generated by `scripts/gen-queries.ts` and holds one server function per query. After adding or renaming a query, run `bun scripts/gen-queries.ts`; a test fails when the file is stale.

Mock writes (acknowledge, block, save, mint, …) change the server's in-memory state, so every page, tab and download sees them. A server restart starts from the fixtures again.

**Scenarios** make the whole backend behave a given way, so every page's empty, error, loading and role-limited states can be seen. Pick one from the **Mock data** button in the top bar, or add `?mock=<scenario>` to any URL; it sticks while you navigate. The scenario travels with each call, so two tabs in different scenarios don't affect each other.

| `?mock=` | What the backend does |
|---|---|
| `empty` | No data yet: every list empty, every count zero (catalogs and KPI tiles stay, at zero) |
| `large` | A busy deployment: six-digit counts, long lists, long values, any page of them |
| `slow` | Every call takes 2.5 s: pending skeletons |
| `partial` | The same third of the reads fail with 502 on every visit; the rest answer |
| `unavailable` | Every call fails with 502 |
| `overloaded` | Every call is shed with 503 and Retry-After: 30 |
| `expired` | Every call answers 401: session expired |
| `viewer` | The signed-in operator acts as a viewer: admin actions are disabled and refused with 403 |

**Live data:** `/api/live` streams new events as Server-Sent Events while the dashboard is open, in the fleet's proportions, from one generator on the server. The Event explorer and the overview follow it. The **Live** badge in the top bar pauses and resumes every refresh path (the choice is kept in this browser) and turns **Stalled** when the stream breaks.

**Chart and topology payloads:** `/api/chart/{name}` (the 21 allowlisted charts) and `/api/topology/flow` answer in the Rust tier's wire shapes, typed in `src/data/contracts/charts.ts`, built from the same mock data and scenarios the pages read. They are what production's proxies pass through, for the operational checks that call them; the pages themselves read through server functions.

The same menu can **simulate an incident** to see the operational toasts raise and resolve: a sensor goes silent, ingest stalls, the cluster goes red, Filebeat drops, dead letters arrive, or everything recovers. Every open tab hears it through the stream.

`bun scripts/crawl.ts <url> 1 --scenarios` signs in, opens one page of every route shape under each scenario, and fails on a page that crashes or shows the wrong state; smoke runs it.

```bash
VITE_MOCK_LATENCY_MS=800 bun run dev   # extra latency on every call, any scenario
VITE_MOCK_FAIL=1 bun run dev           # every call fails, without a scenario
```

In dev, TanStack devtools open with **Ctrl+~** (the floating trigger is hidden so it never covers page actions).

## Stack notes

- Routing: TanStack Router file routes in `src/routes/`; `src/routeTree.gen.ts` is generated.
- UI: Astryx components (see `AGENTS.md` for the CLI workflow — `bunx astryx build "<idea>"`).
- Theme: editable neutral theme family in `src/themes/neutral/`. `neutralTheme.ts` is the root (the annotated `theme.template.ts` documents every field); `variants/*.ts` hold one family member each: one of APIARY's nine palettes (Settings → Appearance → Palette; Claude is the default) and a high-contrast twin of every palette (`*-hc.ts`), built from the helpers in `neutralVariants.ts`. A palette is a whole theme, as in APIARY: ground, chrome, surface ramp, borders, text ramp, accent family and status tones all come from it; typography, shape, motion and chart series stay the neutral ones. Settings also offers Astryx's own themes (`src/themes/astryx/<name>`, scaffolded with `bunx astryx theme add <name>`: neutral, butter, chocolate, gothic, matcha, stone, y2k) as whole designs with their own fonts, shapes and Lucide icons; they have no high-contrast twin, and their fonts, like the neutral family's, are self-hosted from `@fontsource` (imported in `styles.css`). `src/themes/appTheme.ts` maps the preferences to a member; the root route passes it to `<Theme>`, so the server renders the chosen theme and there is no flash. Then:

  ```bash
  bun run theme:build   # regenerates neutral-family.css / .js / .d.ts (every member, one stylesheet)
  bun run theme:check   # fails if the committed outputs are stale (part of smoke)
  ```

  The theme CLI runs under Bun (`bunx --bun`, with `JITI_TRY_NATIVE=0` so the family build can trace each member's ancestry) and `icons.tsx` carries a `@jsxRuntime automatic` pragma for the same loader. A new member is a new file in `variants/`, picked up by the build's glob, plus an entry in `appTheme.ts`. The palettes' values are APIARY's, imported from its vendored Xore/theme stylesheet by `scripts/import-apiary-palettes.py <APIARY checkout>` into `apiaryPalettes.generated.ts` (change them in Xore/theme, then re-import and `bun run theme:build`); `neutralVariants.ts` maps APIARY's roles onto Astryx tokens. The neutral base's own hues start from `palette.config.json` via `bunx astryx theme palette generate <config> -o <name>.generated.ts -f`.
