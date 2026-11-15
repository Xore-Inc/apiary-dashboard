import { useEffect } from 'react'
import { HeadContent, Scripts, createRootRouteWithContext, useRouter, useRouterState } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { RouterLink } from '../components/RouterLink'
import { appTheme } from '#/themes/appTheme'
import { mockClockQuery, preferencesQuery } from '#/data/resources'
import { ensure } from '#/lib/query'
import type { Preferences } from '#/data/types'
import { browserTimeZone, rememberBrowserZone } from '#/lib/browserZone'
import { configureTime } from '#/lib/format'
import { refreshWhenSettled } from '#/lib/refreshWhenSettled'

import appCss from '../styles.css?url'

/** What every loader gets: the router's data cache (lib/query.ts). */
export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'APIARY',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // The APIARY favicon set, from the brand's own assets (APIARY
      // branding/assets/favicon): the optically simplified mark at small sizes,
      // the touch icon and the install manifest.
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  // The operator's preferences shape the whole document: theme mode,
  // palette, contrast, motion, evidence text, and how times read.
  // A "browser" time zone is resolved here, so the server renders it too.
  loader: async ({ context: { queryClient } }) => {
    const [prefs, mockClock] = await Promise.all([ensure(queryClient, preferencesQuery()), ensure(queryClient, mockClockQuery())])
    const followsBrowser = prefs.timezone === 'browser'
    return { ...prefs, timezone: followsBrowser ? browserTimeZone() : prefs.timezone, followsBrowser, mockClock }
  },
  shellComponent: RootDocument,
})

/** Preferences as root attributes; styles.css keys the overrides on them.
 * Palette and contrast are not among them: they pick the Astryx theme. */
function rootAttributes(prefs: Preferences | undefined): Record<string, string | undefined> {
  if (!prefs) return {}
  return {
    'data-motion': prefs.motion === 'on' ? 'reduced' : undefined,
    'data-evidence': prefs.largeEvidenceText ? 'large' : undefined,
  }
}

/** How times read, from the preferences. A preference change arrives with
 * a router refresh, so every page re-renders with it. On a first visit the
 * server cannot know the browser's zone and renders UTC; once mounted the
 * zone is left in a cookie and the router refreshes once, when idle. */
function useTimePreferences(prefs: (Preferences & { followsBrowser: boolean; mockClock: number | null }) | undefined) {
  const router = useRouter()
  const rendered = prefs?.followsBrowser ? prefs.timezone : undefined
  useEffect(() => {
    if (!rendered || !rememberBrowserZone(rendered)) return
    // Times are formatted from module state, so refresh only once the whole
    // page has hydrated with the zone the server used.
    // Only the root's loader resolves the zone: the page's own reads stay
    // as the server and the cache have them.
    const idle = requestIdleCallback(() => refreshWhenSettled(router, { filter: (match) => match.routeId === '__root__' }), { timeout: 2000 })
    return () => cancelIdleCallback(idle)
  }, [rendered, router])
  if (!prefs) return
  const { mockClock } = prefs
  configureTime({ timeZone: prefs.timezone, hour12: prefs.clock === 'h12', relative: prefs.timestamps === 'relative', now: mockClock === null ? () => Date.now() : () => mockClock })
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const prefs = useRouterState({ select: (s) => s.matches.find((m) => m.routeId === '__root__')?.loaderData })
  useTimePreferences(prefs)
  return (
    <html lang="en" {...rootAttributes(prefs)}>
      <head>
        <HeadContent />
      </head>
      <body>
        <Theme theme={appTheme(prefs?.palette, prefs?.highContrast)} mode={prefs?.theme ?? 'system'}>
          <LinkProvider component={RouterLink}>{children}</LinkProvider>
        </Theme>
        <TanStackDevtools
          // The floating trigger sat over page actions (e.g. the reports
          // wizard's Next button); open the devtools with Ctrl+~ instead.
          config={{
            position: 'bottom-right',
            triggerHidden: true,
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
