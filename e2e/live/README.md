# Live checks

Playwright checks that run against a running dashboard, signed in with a real session. The dashboard has no mock backend (dash#324), so these are how its pages, its authorization and its browser behavior are tested: against production, before and after every release (`docs/release-gates.md`). GitHub CI does not run them; it has no session and no backend.

```sh
BETA_URL=<the public dashboard URL> \
BETA_STORAGE_STATE=$HOME/.config/apiary/prod-storage-state.json \
SHOTS_DIR=/tmp/live-$(date +%Y%m%d-%H%M) \
bun e2e/live/run.ts
```

- `BETA_URL`: the dashboard to check. Always from the environment, never written in the repository (the repository is public; `scripts/check-public-leaks.ts` refuses the deployment's address).
- `BETA_STORAGE_STATE`: a Playwright storage-state file with a signed-in session of the **viewer** test account. The checks only read it. Sessions last a few hours; when one has expired a check stops with exit code 3 and the runner says so. Refresh it by signing in again in a browser and saving the storage state; the checks never sign in themselves.
- `SHOTS_DIR`: screenshots and result files, one folder per check.
- `CHROME_PATH`: the browser, if not `/usr/bin/google-chrome`.
- `ONLY=authorization,crawl`: run a subset.

Each check also runs on its own (`bun e2e/live/authorization.ts`). Exit codes: 0 passed, 1 a step failed, 2 the check could not run (no URL, no session file, no browser, or a session that is not a viewer where one is needed), 3 the session was not accepted. The runner exits non-zero unless every check it ran passed.

## The checks

| Check | What it proves | Replaces (mock-based, removed from CI) |
|---|---|---|
| `authorization.ts` | Every generated route answers as its policy in `scripts/authorization-matrix.ts` says, without a session (pages → 307 to sign-in with a same-origin `return_to`, handlers → 401, `/metrics` and `/auth/logout` refuse). Server functions answer 401 without a session (the public ones answer). As the viewer, every admin-only server function (every write, and the admin-only reads) is refused with 403, each call carrying the CSRF header; `/admin` sends the viewer home; a payload download is 403. A captured write replayed without `x-csrf-token`, or from another origin, is refused by the same-origin rule. A crafted `return_to=//…` only ever reaches the identity provider, which is told to come back here. Sign-out from another site, or with no Origin, is refused. | `scripts/smoke.sh` anonymous and signed-in HTTP checks, viewer 403s, open-redirect and sign-out cases; `scripts/csrf.ts` |
| `viewer-readonly.ts` | The viewer's screens show no write control, Settings is read-only and a click sends nothing, the report wizard says it is read-only, and a refused write leaves the alerts and the preferences as they were. | the viewer scenario pages |
| `standard.ts` | A first load and client-side navigation through the main pages: skeletons replaced by data, no error state, no BFF call ≥ 400, no 5xx, no console or page error, no reload. A full load does not ask the shell's reads again; a live page revalidates on a revisit. | the browser half of `scripts/smoke.sh` |
| `crawl.ts` | Fixed answers (legacy redirects, unknown ids 404, assets and probes 200), then an SSR link crawl from every parameterless page route, every entity tab included: no link answers 4xx/5xx and no page renders an outage, overload, expiry or crash state. Writes one page per route shape to `samples.json`. | `scripts/crawl.ts`, `scripts/route-matrix.ts`'s status expectations in `scripts/smoke.sh` |
| `skeletons.ts` | One page per route shape (from the crawl) in a browser: the title paints, every skeleton is replaced by data, no error state, nothing throws. A missing source shows the not-found page. | `scripts/skeletons.ts` |
| `features.ts` | The ECharts charts are painted in light and dark, the attack-origin map has markers and tiles, the cytoscape graphs are painted with their keyboard links, a recording plays in xterm, the VNC page loads. | the dash#305 feature checks |
| `a11y.ts` | axe-core WCAG 2.1 A/AA over every kind of page, the graphs, the settings dialog and the phone layout, against `docs/baselines/accessibility.json`. | `scripts/a11y.ts` |
| `responsive.ts` | Phone, tablet, laptop and 4K: no sideways scroll, no top-bar control off screen or overlapping, the shell fits, no console error. | `scripts/responsive.ts` |
| `perf.ts` | Cold-load JavaScript and CSS within 25 % of `docs/baselines/performance.json`; HTML size and timings recorded, not gated. `--update` records a new baseline. | `scripts/perf.ts` |

## What they cannot prove

- **Admin-only paths.** The only session is the viewer test account, so nothing an admin can do is exercised live: writes succeeding, the optimistic updates of a write (#309), the admin page's panels, the preference save round trip, the report-a-problem dialog. Their logic is covered by unit tests in CI; their live behavior is checked by hand by an admin after a release.
- **Writes.** The checks never change data. Every write call is sent only where it must be refused, with arguments that would change nothing if it were not (empty lists, ids that do not exist, the viewer's own preferences unchanged); the calls that would change something are sent only after every harmless one was refused. A check run with an admin session stops before sending any of them.
- **The last hop of sign-in.** Following a crafted `return_to` to its end needs a completed sign-in at the identity provider; `src/server/oidc.server.test.ts` proves in CI that the stored return path is `/` for `//evil…`.
- **Loading states under a slow backend.** The mock's slow scenario proved each page paints its skeleton before any data arrives. A live backend answers too fast to see that reliably, so `skeletons.ts` proves the end state only.
- **Failure states.** An outage, an overload or an expired session cannot be caused on production. The pages' handling of each `ApiError` kind is covered by unit tests; the server's refusals to start and its answers with no backend (`scripts/server-checks.sh`) run in CI.
