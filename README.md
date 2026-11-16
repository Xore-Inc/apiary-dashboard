# APIARY Dashboard Rewrite

Clean-room dashboard rewrite using TanStack Start, Bun, and Astryx.

Planning and progress:

- [Implementation epic](https://github.com/Xore/apiary-dashboard/issues/1)
- [Upstream APIARY epic](https://github.com/Xore/APIARY/issues/3279)
- [Canonical running implementation](https://github.com/Xore/APIARY/tree/main/arcane/home/honeypot-dashboard/frontend-next)

The canonical implementation is a behavioral reference, not a component source to copy mechanically. Every migration slice must trace its routes, data, actions, security, and states before being rebuilt with current TanStack and Astryx conventions.

Current stage: every query the pages make is answered by the APIARY backend through one server-function seam (`src/data/queries.ts`, typed by `src/data/queries.contract.ts`, implemented by `src/data/api.ts`). There is no mock backend and no built-in data (dash#324): the dashboard is developed and tested against a real backend.

## Development

```bash
bun install
bun run dev          # vite dev server on 0.0.0.0:3009, usable from the LAN (needs a backend, below)
bunx tsc --noEmit    # typecheck
bun run lint
bun run test
bun run build        # production build into dist/
bun run start        # Bun production server (server.ts), configured by the environment
bun run server-checks   # the built server's boot refusals and its answers with no backend
bun run live         # the live checks against a running dashboard (e2e/live/README.md)
```

### A backend for local development

The dashboard needs a backend: without `BACKEND_URL` it refuses to start (`E-BACKEND-URL`). Locally, point it at the homeserver's backend through an SSH tunnel. The backend containers publish no host port, so the tunnel goes to their address on the Docker network:

```bash
scripts/dev-backend-tunnel.sh   # prints BACKEND_URL / BACKEND_MOUNTED_URL, keeps the tunnel open
```

It resolves `hp-apiary-backend` (port 8081) and `hp-apiary-backend-mounted` (port 8082) with `docker inspect` over `ssh homeserver` and forwards `127.0.0.1:8081` and `127.0.0.1:8082` to them (override with `DEV_SSH_HOST`, `DEV_BACKEND_CONTAINER`, `DEV_LOCAL_PORT`, …). Then, in `.env` (Bun loads it for `bun run dev`):

```bash
BACKEND_URL=http://127.0.0.1:8081
BACKEND_MOUNTED_URL=http://127.0.0.1:8082
SERVICE_TOKEN_FILE=/home/you/.config/apiary/dev-service-token                   # 0600, never in the repository
ACTOR_ASSERTION_PRIVATE_KEY_FILE=/home/you/.config/apiary/dev-actor-signing-key.pem # 0600; the backend enforces signed actors
OIDC_DISABLED=1      # no Keycloak locally: every request is the development operator (an admin)
```

The backend runs with `ACTOR_ASSERTION_MODE=enforce`, so it answers a dashboard only with the service token **and** an actor assertion signed by a key it trusts. Keep both in your own 0600 files and name them with the `_FILE` variables (the dashboard already reads both this way, and the key as an Ed25519 PEM); never put them on a command line or in the repository.

**Use a dev pair, never production's.** The homeserver's production token and signing key stay on the homeserver. A local dashboard gets a pair of its own, which the backend trusts separately (`DEV_SERVICE_TOKEN` and `DEV_ACTOR_ASSERTION_PUBLIC_KEY`, [`docs/BACKEND-TRUST-BOUNDARY.md`](https://github.com/Xore-Inc/APIARY/blob/main/docs/BACKEND-TRUST-BOUNDARY.md) in the APIARY repository):

```bash
scripts/dev-credentials.sh   # once; stdout is the public key only, so you can redirect it to a file outside the repository
```

It writes `dev-service-token` (a random 256-bit token) and `dev-actor-signing-key.pem` (an Ed25519 private key) into `~/.config/apiary/` with mode 0600, never prints either, and prints the **public** key on stdout for the backend's `DEV_ACTOR_ASSERTION_PUBLIC_KEY`; the paths for your `.env` go to stderr. It refuses to overwrite existing files unless you pass `--force` (a new pair: register the new public key again); `--public` prints the public key of the existing pair again. The token's other home is the backend's `DEV_SERVICE_TOKEN`: hand it over from the file through a pipe, never as a command-line argument. The backend accepts the dev token only together with an assertion signed by the dev key, marks everything it does as `dev` (request log, and `dev:<username>` in the audit trail), and keeps viewers read-only, so dev writes are always distinguishable from the real dashboard's. Revoke it by unsetting the pair on the backend. Without a pair the backend trusts, the dev server still starts and pages render, but every read shows "The backend did not answer" (`service token required`): `/readyz` reports the backend reachable either way. With `OIDC_DISABLED=1` every request is an admin, so writes reach the homeserver's real data: treat it like production. To sign in through Keycloak instead, set `OIDC_ISSUER_URL` and its client settings.

### Design studio

`bun run studio` builds `design-studio/index.html`: every Astryx component the dashboard uses, rendered with the real themes (palette, light/dark and contrast switch in its toolbar), in one self-contained file that opens from disk. Each component lists variants: **A** is the current decision recorded in `DESIGN.md`; add **B**, **C**… in `design-studio/specimens.tsx` to compare alternatives side by side. `PRODUCT.md` and `DESIGN.md` hold the product and visual decisions; Astryx's own guidelines (`AGENTS.md`, `bunx astryx docs`) come first.

### CI and the container image

GitHub Actions, on GitHub-hosted runners:

| Workflow | When | What |
|---|---|---|
| `ci.yml` | every pull request, pushes to main | public-repository safety (`scripts/check-public-leaks.ts`: no secrets, no real deployment addresses, test data in documentation ranges only); typecheck, lint, tests, theme and generated-file freshness, build; the release gate's server half, `scripts/server-checks.sh` (job "Release gate (smoke)", the name the ruleset requires); `actionlint` over the workflows. The page, browser and authorization checks need real data and a session: they run against production before and after every release (`e2e/live/`, `docs/release-gates.md`), not in CI |
| `container.yml` | every pull request, pushes to main, `v*` tags | builds the `Dockerfile`, checks the image refuses to boot without `BACKEND_URL` or `SERVICE_TOKEN` and serves once given them, scans it with Trivy (critical, fixable); on main and tags pushes it to `ghcr.io/xore-inc/apiary-dashboard` (`latest`, `sha-…`, the tag) with an SBOM and a signed provenance attestation (`gh attestation verify oci://ghcr.io/xore-inc/apiary-dashboard:latest --owner Xore-Inc`). Nothing deploys it yet. |
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
docker run -p 3000:3000 -e BACKEND_URL=… -e SERVICE_TOKEN=… -e OIDC_ISSUER_URL=… apiary-dashboard
# or from a mounted secret file:
# docker run -p 3000:3000 -v ./service-token:/run/secrets/service-token:ro -e SERVICE_TOKEN_FILE=/run/secrets/service-token apiary-dashboard
```

`bun run test` covers the authorization matrix, the boot policies, sessions, the adapters against recorded wire shapes, nav roll-ups and formatters, with small literal inputs; the backend's answers in a test are stubbed responses, never a mock backend.

### Signing in and security

Every page needs a session. With `OIDC_ISSUER_URL` set, `/auth/login` sends the browser to Keycloak (authorization code with PKCE; the one-time state waits in Redis under `bff:oidc:pending:` for 10 minutes), `/auth/callback` creates the session, and `/auth/logout` also ends the Keycloak session. The `admin` role of the dashboard client (`resource_access.<client>.roles`) makes an admin, anyone else is a viewer. Without `OIDC_ISSUER_URL` only a development instance with `OIDC_DISABLED=1` starts, and nobody signs in there: every request is the development operator. The session:
- an opaque id in the `__Host-apiary_bff` cookie (HttpOnly, Secure, SameSite=Lax, 12 h);
- the identity behind it in Redis under `bff:session:`, shared by every instance.

A server function call whose session has gone (401) sends the browser to sign in once, then back to the same page (`src/lib/reauth.ts`).

On the server:
- every server function passes a **same-origin check** (a cross-site state-changing call gets 403), and a state-changing one must carry the `x-csrf-token` header the dashboard's own fetch adds;
- every query is **authorized for the caller**: no session → 401; a viewer calling any write → 403 (viewers are read-only, APIARY#3857); the canonical permissions are in `src/server/authorize.ts`;
- direct handlers (`/api/*`) check the session themselves; `/healthz` is deliberately public; `/metrics` needs the service token in `x-service-token`;
- the firewall blocklist export (`/export/portbridge-manual-blackhole.txt`) takes either an export-only token (`X-Export-Token`, not the service token) or a signed-in session the query policy allows (see below);
- `/auth/logout` needs a same-origin Origin or Referer, then destroys the session.

#### Machine access: the blocklist export

`GET /export/portbridge-manual-blackhole.txt` returns the manual blackhole list, one IP per line (`text/plain`, `no-store`). It is the only URL the VPS firewall puller reads.

- Machine client: send the header `X-Export-Token: <EXPORT_TOKEN>`. The token is compared in constant time and is never taken from the URL or the query string. With `EXPORT_TOKEN` unset (the default), this path never matches. `SERVICE_TOKEN` is **not** accepted here: it reaches the whole backend, and the VPS must not hold it.
- Person: a signed-in session whose role `getBlockedIps` allows under `src/server/authorize.ts`.
- No credentials: `401 unauthorized`. A signed-in role the policy refuses: `403 forbidden`.

The VPS job sends the header from its `BLACKHOLE_EXPORT_TOKEN`, which must hold the same value as `EXPORT_TOKEN` and a different value from `SERVICE_TOKEN`. Generate one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.

#### Machine access: the backend

Calls to the backend carry `x-service-token`. When a signing key is configured they also carry `x-actor-assertion`: a short-lived (60 s) Ed25519-signed JWS naming the signed-in operator (`sub`, `username`, `role`) and bound to one request (`htm`, `htu`). The backend verifies it with the public key only, so the bearer token cannot mint an identity; see `docs/BACKEND-TRUST-BOUNDARY.md` in the APIARY repository for the claims, the `off`/`log`/`enforce` modes and the rollout order.

- The `username` claim, and the plain `x-actor-username` header, are the OIDC username, not the display name. Workbench run and recipe ownership is keyed on it.
- No assertion is sent for a call with no signed-in operator (machine reads), or when no key is configured.
- Roll back to a build that does not sign only after the backend is in `log` or `off`.

The server refuses to boot in an environment that would open it:

| Variable | |
|---|---|
| `SERVICE_TOKEN` / `SERVICE_TOKEN_FILE` | Shared secret with the backend, inline or as a path to a file holding it (a swarm secret); exactly one, and a file that is missing or empty refuses to boot. Required, unless `APIARY_ALLOW_UNAUTH_DEV=1` says this is a local instance (`E-SERVICE-TOKEN`). |
| `EXPORT_TOKEN` / `EXPORT_TOKEN_FILE` | Optional export-only secret (inline or file, as above) for the blocklist export (`X-Export-Token`). Unset turns machine access to the export off. Equal to `SERVICE_TOKEN` refuses to boot (`E-EXPORT-TOKEN`). |
| `ACTOR_ASSERTION_PRIVATE_KEY` / `ACTOR_ASSERTION_PRIVATE_KEY_FILE` | Ed25519 private key (PEM; `\n` for newlines inline) that signs operator identities for the backend. Both set, or a key that is unparsable or not Ed25519, refuses to boot (`E-ACTOR-ASSERTION-KEY`). Unset signs nothing. |
| `BACKEND_URL` | Base URL of the backend tier (an http(s) URL). Required: unset, the server refuses to start (`E-BACKEND-URL`); there is no built-in data. `BACKEND_MOUNTED_URL` names the mounted listener (sandbox, Ghidra, GitHub analysis), else `BACKEND_URL` serves those too. |
| `APIARY_ALLOW_UNAUTH_DEV` | Exactly `1`: a local development instance. `bun run dev` sets it. |
| `OIDC_DISABLED` | `1` skips sign-in: every request is the development operator, an admin. Only with `NODE_ENV=development` or `APIARY_ALLOW_UNAUTH_DEV=1` (`E-OIDC-DISABLED`). |
| `APIARY_DEV_HTTP_COOKIE` | Exactly `1`: the session cookie works over plain HTTP (`apiary_bff_dev`, not Secure), so a dev server can be used from another machine by its LAN address. Only with `NODE_ENV=development` or `APIARY_ALLOW_UNAUTH_DEV=1` (`E-DEV-HTTP-COOKIE`). `bun run dev` sets it and listens on 0.0.0.0. |
| `OIDC_ISSUER_URL` | The Keycloak realm, e.g. `https://sso.example.test/realms/apiary`. Required unless `OIDC_DISABLED=1` on a development instance (`E-OIDC-ISSUER`). |
| `OIDC_CLIENT_ID` | The dashboard's Keycloak client. Default `apiary-dashboard`. |
| `OIDC_CLIENT_SECRET` / `OIDC_CLIENT_SECRET_FILE` | Its secret, or a file holding it (the file wins). |
| `OIDC_ALLOW_INSECURE` | Exactly `1`: a plain-HTTP issuer, for a local Keycloak only. |
| `OIDC_SESSION_REDIS_URL` | Redis for sessions and pending sign-ins. Default `redis://127.0.0.1:6379/0`. |
| `EXTERNAL_URL` | The public origin, when a proxy in front changes the Host the server sees (same-origin check, Keycloak redirect URIs). |
| `MAP_TILE_URL`, `MAP_TILE_DARK_URL`, `MAP_TILE_ATTRIBUTION`, `MAP_TILE_SUBDOMAINS`, `MAP_TILE_API_KEY` | The attack map's tile provider, read at runtime and served with the shell config, never built into the bundle. Unset: keyless OpenStreetMap, darkened by a CSS filter in dark mode (CARTO's dark tiles now require a key). The URL is a Leaflet template (`{apikey}` takes the key, https only); without a dark URL, dark mode darkens the light tiles. A tile key reaches every browser in the tile URLs by design: keep it in the environment, never the repository or logs, and restrict it to the dashboard's domain at the provider. |

See `.env.example`.

### Standalone Compose deployment

`arcane/home/apiary-dashboard/compose.yml` starts the dashboard and its
session store on a host without APIARY source, `honeynet`, or APIARY log
directories. Set `BACKEND_URL` and `BACKEND_MOUNTED_URL` in that host's
deployment `.env` to reachable protected backend endpoints. The second URL
must address the mounted listener while mounted writes use a separate backend
instance. Set the image tag and digest, service token, OIDC settings, public
origin, secret directory, and the host's `DEPLOY_RUNNER_GID` there too. Review
the rendered configuration with `docker compose config --quiet` before a
deploy. Use a trusted HTTPS endpoint when the backend is outside the private
Swarm overlay; do not disable certificate verification.

Named BFF events are JSON lines on container stdout by default. Configure the
host's container log collector to ship those lines. For the existing
homeserver transition, set both backend URLs to the Docker service names and
include `compose.honeynet.yml`; that override joins the local `honeynet` and
keeps the existing `rewrite.jsonl` file sink. It requires that network and log
directory to exist on the same Docker host. The cross-host auth, mounted
write, SSE, download, and rollback smoke in [APIARY #3579](https://github.com/Xore-Inc/APIARY/issues/3579)
is still the deployment acceptance gate.

### Data cache

Pages read through TanStack Query (`src/lib/query.ts`), one `QueryClient` per router: per server request on the server, one in the browser. What the server read for a page (session, preferences, shell configuration, and the whole page for non-browser clients) reaches the browser's cache with the HTML through `@tanstack/react-router-ssr-query` and is not fetched again.

Every backend read is one `queryOptions` in `src/data/resources.ts`, keyed by its server function's name and arguments, so the same source, autonomous system or campaign is fetched once for every page that shows it. Each resource has a freshness class: **live** (alerts, the live feed) is asked again on every visit and when the tab regains focus or the network reconnects; **normal** lists are reused for 30 s; **slow** detail pages, catalogs, configuration and reports for 5 minutes; **static** answers for the life of the page. A loader calls `ensure()`: a cached answer renders at once, without the skeleton, and is revalidated in the background when stale; only a cold load waits and shows the page's own skeleton. Nothing polls, and a failed read is not retried.

The router leaves freshness to Query (`defaultPreloadStaleTime: 0`), so a hover preload's answer is what the click that follows renders. Links preload on hover or focus; a preload answers from the cache and never starts a slow panel. (Preloading a list's first rows as they scrolled into view was tried and dropped: on production each list render fired several entity reads at once and the backend's limiter shed some.) Slow panels (the related panel, entity timelines) are started by the loader without waiting and stream in under their own Suspense boundary (`src/components/Deferred.tsx`), so the page renders first; a failed panel shows as that panel's gap.

Writes are mutations (`src/data/writes.ts`, `src/lib/mutation.ts`): each names the resources it changes, which are read again when the write lands (the button stays busy until they have answered), then the routes re-run. Saving a preference and acknowledging an alert show at once and are rolled back if the backend refuses. The server functions are unchanged, so the CSRF header, the actor assertion and the sign-in flow apply as before.

### The data seam

`src/data/queries.ts` is generated by `scripts/gen-queries.ts` from the contract in `src/data/queries.contract.ts` and holds one server function per query; `src/data/api.ts` answers every one (`LIVE` must implement the whole contract, so a query without a backend answer does not compile). After adding or renaming a query, change the contract and `LIVE`, then run `bun scripts/gen-queries.ts`; CI fails when the file is stale.

**Live data:** `/api/live` relays the backend's own event stream as Server-Sent Events while the dashboard is open. The Event explorer and the overview follow it. The **Live** badge in the top bar pauses and resumes every refresh path (the choice is kept in this browser) and turns **Stalled** when the stream breaks.

**Chart and topology payloads:** `/api/chart/{name}` (the 21 allowlisted charts) and `/api/topology/flow` pass the Rust tier's payloads through, typed in `src/data/contracts/charts.ts`, for the operational checks that call them; the pages themselves read through server functions.

In dev, TanStack devtools open with **Ctrl+~** (the floating trigger is hidden so it never covers page actions).

## Stack notes

- Routing: TanStack Router file routes in `src/routes/`; `src/routeTree.gen.ts` is generated.
- UI: Astryx components (see `AGENTS.md` for the CLI workflow — `bunx astryx build "<idea>"`).
- Theme: editable neutral theme family in `src/themes/neutral/`. `neutralTheme.ts` is the root (the annotated `theme.template.ts` documents every field); `variants/*.ts` hold one family member each: one of APIARY's nine palettes (Settings → Appearance → Palette; Claude is the default) and a high-contrast twin of every palette (`*-hc.ts`), built from the helpers in `neutralVariants.ts`. A palette is a whole theme, as in APIARY: ground, chrome, surface ramp, borders, text ramp, accent family and status tones all come from it; typography, shape, motion and chart series stay the neutral ones. Settings also offers Astryx's own themes (`src/themes/astryx/<name>`, scaffolded with `bunx astryx theme add <name>`: neutral, butter, chocolate, gothic, matcha, stone, y2k) as whole designs with their own fonts, shapes and Lucide icons; they have no high-contrast twin, and their fonts, like the neutral family's, are self-hosted from `@fontsource` (imported in `styles.css`). `src/themes/appTheme.ts` maps the preferences to a member; the root route passes it to `<Theme>`, so the server renders the chosen theme and there is no flash. Then:

  ```bash
  bun run theme:build   # regenerates neutral-family.css / .js / .d.ts (every member, one stylesheet)
  bun run theme:check   # fails if the committed outputs are stale (CI runs it)
  ```

  The theme CLI runs under Bun (`bunx --bun`, with `JITI_TRY_NATIVE=0` so the family build can trace each member's ancestry) and `icons.tsx` carries a `@jsxRuntime automatic` pragma for the same loader. A new member is a new file in `variants/`, picked up by the build's glob, plus an entry in `appTheme.ts`. The palettes' values are APIARY's, imported from its vendored Xore/theme stylesheet by `scripts/import-apiary-palettes.py <APIARY checkout>` into `apiaryPalettes.generated.ts` (change them in Xore/theme, then re-import and `bun run theme:build`); `neutralVariants.ts` maps APIARY's roles onto Astryx tokens. The neutral base's own hues start from `palette.config.json` via `bunx astryx theme palette generate <config> -o <name>.generated.ts -f`.
