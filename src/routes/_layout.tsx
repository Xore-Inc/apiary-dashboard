import { useEffect } from 'react'
import { createFileRoute, redirect, retainSearchParams, useLocation, useNavigate } from '@tanstack/react-router'
import { DEFAULT_RANGE, isRange } from '#/lib/range'
import { usePreferences } from '#/lib/prefs'
import type { RangeId } from '#/lib/range'
import { PANE_IDS } from '#/components/SettingsDialog'
import type { PaneId } from '#/components/SettingsDialog'
import { ShellAppShell } from '#/components/ShellAppShell'
import { mockScenariosAllowedQuery, preferencesQuery, sessionUserQuery, shellConfigQuery } from '#/data/resources'
import { ensure } from '#/lib/query'
import { isScenario } from '#/data/scenarios'
import { setNavigationScenario } from '#/data/serverFn'
import type { MockScenario } from '#/data/scenarios'
import { isNarrowViewport } from '#/lib/viewport'
import { pageFor, sectionFor } from '#/lib/nav'
import { DEFAULT_TITLE_FORMAT, formatTitle } from '#/lib/title'

export const Route = createFileRoute('/_layout')({
  // `?settings=<pane>` opens the settings modal over any page; `?range=` is
  // the app-wide time range and `?mock=` the mock backend scenario, both
  // kept on every navigation.
  validateSearch: (search: Record<string, unknown>): { settings?: PaneId; range?: RangeId; mock?: MockScenario } => ({
    settings: PANE_IDS.includes(search.settings as PaneId) ? (search.settings as PaneId) : undefined,
    range: isRange(search.range) && search.range !== '24h' ? search.range : undefined,
    mock: isScenario(search.mock) && search.mock !== 'normal' ? search.mock : undefined,
  }),
  search: { middlewares: [retainSearchParams(['range', 'mock'])] },
  // Before any loader below runs: the navigation's mock scenario (every
  // query of it carries that), then the landing and default-range redirects.
  beforeLoad: async ({ search, location, context: { queryClient } }) => {
    // A switch of mock scenario changes every answer: drop the cached ones
    // (development only; production has no scenarios).
    if (setNavigationScenario(search.mock)) queryClient.removeQueries()
    // The navigation guard: no session, no page. Sign-in brings the operator
    // back here. Answered from the cache when it has the session (asked again
    // in the background after 30 s, lib/query.ts), so a navigation never
    // waits on it behind a slow page's requests.
    const [user, prefs] = await Promise.all([ensure(queryClient, sessionUserQuery()), ensure(queryClient, preferencesQuery())])
    if (!user) throw redirect({ href: `/auth/login?return_to=${encodeURIComponent(location.href)}` })
    // A fresh page load: every server render is one; in the browser only
    // the very first navigation (hydration of that same page) is.
    const fresh = typeof window === 'undefined' || firstClientLoad
    firstClientLoad = false
    const bare = location.searchStr === '' || location.searchStr === '?'
    if (fresh && bare && location.pathname === '/' && prefs.landing !== '/') throw redirect({ href: prefs.landing })
    if (fresh && search.range === undefined && prefs.defaultWindow !== DEFAULT_RANGE && isRange(prefs.defaultWindow)) {
      throw redirect({ href: `${location.pathname}${bare ? '?' : `${location.searchStr}&`}range=${prefs.defaultWindow}` })
    }
    // "Remember filters": a list opened without any comes back as it was left.
    if (!fresh && bare && prefs.rememberFilters) {
      const saved = rememberedSearch(location.pathname)
      if (saved) throw redirect({ href: `${location.pathname}${saved}` })
    }
    return { user }
  },
  loader: async ({ context }) => {
    const [config, mockScenarios] = await Promise.all([ensure(context.queryClient, shellConfigQuery()), ensure(context.queryClient, mockScenariosAllowedQuery())])
    return { user: context.user, config, mockScenarios, narrow: isNarrowViewport() }
  },
  // The document title follows navigation (WCAG 2.4.2): it is what a
  // screen reader announces on arrival and what tells tabs apart.
  head: ({ matches, loaderData }) => {
    // Index routes match with a trailing slash; the nav metadata has none.
    const pathname = (matches.at(-1)?.pathname ?? '/').replace(/(.)\/$/, '$1')
    const presentation = loaderData?.config.presentation
    return { meta: [{ title: formatTitle(presentation?.titleFormat ?? DEFAULT_TITLE_FORMAT, { page: pageFor(pathname), app: presentation?.appName || 'APIARY', section: sectionFor(pathname) }) }] }
  },
  component: LayoutComponent,
})

let firstClientLoad = true

const REMEMBER_KEY = (path: string) => `apiary.filters:${path}`

function rememberedSearch(path: string): string | null {
  try {
    return sessionStorage.getItem(REMEMBER_KEY(path))
  } catch {
    return null
  }
}

function LayoutComponent() {
  const { user, config, mockScenarios, narrow } = Route.useLoaderData()
  const prefs = usePreferences()
  const location = useLocation()
  // Keep each page's last filters for "remember filters" (this tab only).
  useEffect(() => {
    if (!prefs?.rememberFilters) return
    const kept = new URLSearchParams(location.searchStr)
    for (const key of ['settings', 'mock', 'range']) kept.delete(key)
    try {
      if ([...kept].length) sessionStorage.setItem(REMEMBER_KEY(location.pathname), `?${kept.toString()}`)
      else sessionStorage.removeItem(REMEMBER_KEY(location.pathname))
    } catch {
      /* storage unavailable: nothing is remembered */
    }
  }, [prefs?.rememberFilters, location.pathname, location.searchStr])
  const { settings } = Route.useSearch()
  // Router-level navigate: '.' is the current page, so the modal opens over
  // it (the route-bound one would resolve '.' to this layout's '/').
  const navigate = useNavigate()
  const setSettings = (pane: PaneId | undefined) =>
    void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, settings: pane }) })
  return <ShellAppShell user={user} config={config} mockScenarios={mockScenarios} narrow={narrow} settingsPane={settings} onSettingsPane={setSettings} />
}
