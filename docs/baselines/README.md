# Baselines

Checked against the live dashboard by the live checks (`e2e/live/a11y.ts`, `e2e/live/perf.ts`), before and after every release (`docs/release-gates.md`); each exits 2 when no browser or session is available. Until dash#324 both ran on the mock backend in CI; the accessibility exemptions carried over unchanged, and the performance baseline was re-recorded on the live dashboard.

## Accessibility (`accessibility.json`, `e2e/live/a11y.ts`)

axe-core with the WCAG 2.1 A and AA rules, over 34 views:

- every kind of page and the overview's five views, including the world map;
- the source graph view, the Ghidra call graph and the sandbox;
- the settings dialog, the report-a-problem dialog and the payload report viewer;
- the sign-in and not-found pages;
- the phone layout, with its navigation drawer open.

Any violation not listed as an exemption fails the run.

State when recorded: no violations. One exemption, with its reason in the file: the report wizard's unreachable steps are an inactive control, which WCAG 1.4.3 exempts from contrast.

Fixed while recording:

- Graphs with clickable nodes were marked `role="img"`, which hides their links from screen readers. The call graph, attacker graph, related graph and world map are now labelled groups.
- The world map's markers could only be clicked with a mouse. They are links now.
- The payload report viewer's PDF overflowed its dialog, which made the dialog body a scroll region with no keyboard access.

## Performance (`performance.json`, `e2e/live/perf.ts`)

Ten page kinds (an entity kind measured on one entity found live), cold loads at 1440×900 on the live dashboard, as the viewer, sizes as transferred (compressed):

- HTML, JavaScript and CSS size, and request count;
- DOMContentLoaded and load times.

**Gates:** a page's JavaScript and CSS may not grow more than 25 % (and at least 5 KB) past its recorded size. HTML follows the live data and timings follow the network: both are recorded, not gated. `bun e2e/live/perf.ts --update` (with the live checks' variables) records a new baseline after an intended change.

Re-recorded since:

- **2026-11-16, on the live dashboard (dash#324):** the mock backend is gone, so the baseline moved from the production build on mock data to production itself. Sizes are compressed transfer sizes now, which is why the HTML reads ~16 KB instead of hundreds.
- **2026-11-15, `/auth/login` HTML 12.1 → 17.3 KB (#309):** every server-rendered document now carries the data cache's hand-off (`@tanstack/react-router-ssr-query`): the reads the server made (preferences, the clock; on shell pages also the session and shell configuration), plus about 2 KB of stream runtime the integration always emits. The browser no longer reads those again after hydration. Main itself measured 14.6–14.9 KB here, against a 15.1 KB limit. The other pages grow by the same ~3.5 KB and stay within their allowance.

What the first measurement (on mock data, before dash#324) showed (all loads under half a second locally):

- **HTML** is heaviest where pages carry the most data: the overview (~510 KB), a source (~420 KB) and the event explorer (~370 KB, even paged, mostly its filter facets). Moving those facets and the overview's views behind their own requests is the obvious next saving.
- **JavaScript** is 495–575 KB on every page, over 87–117 requests (about 48 KB less once the old fixtures stayed on the server). Most of it is the shared shell (Astryx, the router, the charts), split into many chunks. Worth a look before cutover, together with real network conditions.
