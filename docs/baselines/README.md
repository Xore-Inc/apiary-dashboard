# Baselines

Measured on deterministic mock data so regressions are comparable. `scripts/smoke.sh` checks both on every run against the production build; each script exits 2, and smoke skips it, when no browser is available. The cutover gate repeats both against live data on the soak host.

## Accessibility (`accessibility.json`, `scripts/a11y.ts`)

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

## Performance (`performance.json`, `scripts/perf.ts`)

The same ten page kinds, cold loads at 1440×900 on the production build:

- HTML, JavaScript and CSS size, and request count;
- DOMContentLoaded and load times.

**Gates:** a page may not grow more than 25 % (and at least 5 KB) past its recorded size. Timings are recorded but not gated, because they follow the machine. `bun scripts/perf.ts <url> --update` records a new baseline after an intended change.

Re-recorded since:

- **2026-11-15, `/auth/login` HTML 12.1 → 17.3 KB (#309):** every server-rendered document now carries the data cache's hand-off (`@tanstack/react-router-ssr-query`): the reads the server made (preferences, mock clock; on shell pages also the session and shell configuration), plus about 2 KB of stream runtime the integration always emits. The browser no longer reads those again after hydration. Main itself measured 14.6–14.9 KB here, against a 15.1 KB limit. The other pages grow by the same ~3.5 KB and stay within their allowance.

What the first measurement shows (all loads under half a second locally):

- **HTML** is heaviest where pages carry the most data: the overview (~510 KB), a source (~420 KB) and the event explorer (~370 KB, even paged, mostly its filter facets). Moving those facets and the overview's views behind their own requests is the obvious next saving.
- **JavaScript** is 495–575 KB on every page, over 87–117 requests (about 48 KB less once the mock stayed on the server). Most of it is the shared shell (Astryx, the router, the charts), split into many chunks. Worth a look before cutover, together with real network conditions.
