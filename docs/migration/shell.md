# Shell behaviors

Every behavior of the canonical dashboard's shell (`Xore/APIARY@62ee45d`) and who owns it in the rewrite. The canonical owners are `components/AppShell.tsx`, `Topbar.tsx`, `Sidebar.tsx`, the global hosts they mount, `routes/__root.tsx`, and the `lib/` modules those use. They were read from the source; the doc comments there say what each behavior is for.

**Statuses**

| Status | Meaning |
|---|---|
| **implemented** | the behavior exists at the destination |
| **replaced** | the need is met another way; the note says how |

| # | Behavior (canonical owner) | Rewrite owner | Status | Note |
|---|---|---|---|---|
| 1 | One shell, one content region (`AppShell`) | `ShellAppShell` on the Astryx `AppShell` | implemented | Composition tests in `ShellAppShell.test.tsx`. |
| 2 | Sidebar collapse on desktop, persisted (`AppShell`, `localStorage hp-sidebar-collapsed`) | Astryx `SideNav` collapsible; `ShellSideNav` | implemented | Starts collapsed from the *collapsed sidebar* preference. A toggle is not remembered across loads (the preference is). |
| 3 | Mobile off-canvas drawer with scrim, closes on navigation and Escape (`AppShell`, ≤520 px) | Astryx `mobileNav` drawer, below 1024 px | implemented | Server renders the drawer layout from a width cookie or the User-Agent (#68). |
| 4 | Skip link to the main content (`AppShell`) | Astryx `AppShell` “Skip to content” | implemented | |
| 5 | Document title follows navigation, the screen reader's cue (`AppShell`, WCAG 2.4.2) | `_layout` `head` ← `lib/title.ts` | implemented | `{page} — {app}` by default; admins set the format (Branding) (#109). Rendered by the server too. |
| 6 | Settings as a modal from anywhere; navigating dismisses it (`AppShell` → `SettingsModal`) | `SettingsDialog`, opened by `?settings=<pane>`; administration at `/admin` | implemented | The dialog holds the personal panels (search, deep links, dirty-leave guard); the administration panels are a page of their own, admins only, in the sidebar (#4 decision). |
| 7 | Recent investigations: the last five targets in the sidebar, built from `{kind, value}` so a stored entry cannot become an unsafe link (`lib/recent.ts`, `Sidebar`) | `lib/recent.ts`, *Recent* in `ShellSideNav` | implemented | Same storage key and shape as the Go shell, so the list follows the operator across tiers. |
| 8 | Predictive prefetch, layer 1: intent preload on hover and touch (`router defaultPreload`) | `router.tsx` `defaultPreload: 'intent'`, `RouterLink` | implemented | |
| 9 | Predictive prefetch, layer 2: warm the likely next routes when idle, switchable off (`lib/prefetch.ts`) | `lib/prefetch.ts` in `ShellAppShell` | implemented | Same predictions and `hp-prefetch` switch; Settings → Navigation & tables. |
| 10 | Command palette on `/` and ⌘K; multi-line field; arrow keys cycle rows; focus returns to the opener (`CommandPalette`) | Astryx `CommandPalette` on ⌘K/Ctrl+K and `/` | implemented | `/` is ignored while typing in a field. |
| 11 | Palette searches IPs, sessions, hashes, credentials, commands and signatures live, grouped (`CommandPalette` → `/api/v1/search`) | `lib/paletteSource.ts` → `searchAll` | implemented | Pages at once, entities from two characters on; a stale answer is dropped. |
| 12 | Report a problem: floating button behind the admin switch, rolling capture (clicks and navigation, console errors, failed calls, DOM snapshot), redacted twice (`ProblemReportButton`) | `ProblemReportButton` | implemented | Server-side redaction runs before the live backend submission. |
| 13 | Confirmation before destructive actions (`ConfirmHost`, `confirmAction`) | Astryx `AlertDialog` per action | replaced | Each action owns its dialog instead of one global host. |
| 14 | Flash: one live region for outcomes, copy feedback and notices (`FlashHost`) | Astryx `ToastViewport` + banners, `useGuardedAction` | replaced | |
| 15 | Operational toasts: sensor stale, ingest stalled or behind, cluster yellow or red, pipeline unreachable (`LiveToasts` → source health) | `LiveToasts`, `lib/healthConditions.ts` | implemented | Same conditions, read from source health. |
| 16 | LIVE badge: pause and resume every refresh path, stalled state (`Topbar` → `lib/live.ts`) | `LiveBadge`, `lib/live.ts` | implemented | `/api/live` proxies the live backend stream behind the stream admission gate. |
| 17 | Alerts bell with the open-alert count, polled every 60 s (`Topbar`) | `AlertBell` in the top bar, `getOpenAlertCount` | implemented | Every 60 s while live is on, and after each navigation (#107). |
| 18 | Theme cycler in the top bar (`Topbar`) | Theme in Settings → Appearance | replaced | One click further; the top bar keeps room for the page's views. |
| 19 | Breadcrumb from the navigation metadata (`Topbar` ← `lib/nav.ts`) | `ShellBreadcrumbs` ← `lib/nav.ts` | implemented | Left out on pages with view tabs, where the tabs say which view (#67). |
| 20 | Account menu: settings, sign out, role badge (`Sidebar`) | `ShellSideNav` account menu; Settings → Account | implemented | Role shown in Settings → Account; sign-out also there (#60, #62). |
| 21 | Navigation metadata drives active item, breadcrumb, title and detail-to-parent roll-up (`lib/nav.ts`) | `lib/nav.ts`, `lib/navFamilies.ts` | implemented | Tested in `nav.test.ts`; it also supplies row 5's title. |
| 22 | Shell configuration read once in the root loader: banner, report-a-problem switch, app name (`__root` loader → `/api/v1/config`) | `_layout` loader → `getShellConfig` | implemented | Also read-only mode, labels, footer and deployment links (#58, #62). |
| 23 | Appearance before first paint: cookie hint, reconciled with the stored preference once per session (`lib/appearanceCookie.ts`, `__root` boot script) | Root loader reads the preferences and renders the attributes server-side | replaced | No flash because the server renders the theme. Durable preference storage is the backend's (`/api/v1/preferences`), not an inventory gap. |
| 24 | Humane 404: empty-state voice with one action (`__root notFoundComponent`) | `NotFound` | implemented | |
| 25 | Navigation guard: unauthenticated navigation goes to `/auth/login` with a safe `return_to` (`__root beforeLoad`) | `_layout` beforeLoad, `lib/returnTo.ts`, `src/server/session.ts` | implemented | Keycloak sessions (#5); proven live by `e2e/live/authorization.ts`. |
| 26 | Session expiry noticed on return to a hidden tab, and a 401 goes through sign-in once (`lib/useSessionWatch.ts`, `lib/reauth.ts`) | `lib/reauth.ts` redirects the first 401 through sign-in and returns to the page | replaced | Detection is request-driven rather than a hidden-tab timer; the Redis session is authoritative. |
| 27 | CSP nonce on every script, versioned stylesheet URL (`__root` head) | Per-response nonce scope plus Vite content-hashed assets | implemented | `scripts/server-checks.sh` checks a fresh nonce on every response and every script tag. |

**Totals:** 22 implemented, 5 replaced, no unmapped behaviors.
