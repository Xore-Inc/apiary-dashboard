// The operator's preferences, as one value for every component: the cached
// preferences read (src/data/resources.ts, so a saved or optimistically
// changed preference shows at once), with a "browser" time zone resolved to
// the zone the root loader found (the server renders it too). Outside a data
// cache (component tests) there are none: callers fall back to their
// defaults.
import { useCallback, useContext, useSyncExternalStore } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { preferencesQuery } from '#/data/resources'
import type { Preferences } from '#/data/types'

export type RootPreferences = Preferences & { followsBrowser: boolean }

const PREFS_KEY = preferencesQuery().queryKey

/** The root loader's part: the browser's zone, as the server and the browser
 * resolve it (lib/browserZone). */
export const useBrowserZone = (): string | undefined =>
  useRouterState({ select: (s) => (s.matches.find((m) => m.routeId === '__root__')?.loaderData as { browserZone?: string } | undefined)?.browserZone })

function useCached<T>(key: readonly unknown[]): T | undefined {
  const client = useContext(QueryClientContext)
  const subscribe = useCallback((notify: () => void) => (client ? client.getQueryCache().subscribe(notify) : () => {}), [client])
  const read = () => client?.getQueryData<T>(key)
  return useSyncExternalStore(subscribe, read, read)
}

export function usePreferences(): RootPreferences | undefined {
  const prefs = useCached<Preferences>(PREFS_KEY)
  const browserZone = useBrowserZone()
  if (!prefs) return undefined
  const followsBrowser = prefs.timezone === 'browser'
  return { ...prefs, timezone: followsBrowser ? (browserZone ?? 'UTC') : prefs.timezone, followsBrowser }
}

/** Table density from the density preference. */
export const tableDensity = (prefs: Preferences | undefined) => (prefs?.density === 'comfortable' ? 'balanced' : 'compact')
