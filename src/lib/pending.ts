// A page is its own pending state: the route's pendingComponent is the page
// component itself, rendering while the loader runs. The router hands it no
// loader data then, so the page reads its data through this and draws
// skeletons for what is missing: its own layout, filled in as much as is
// known (title, tabs, filters, columns, the URL's ids), never a generic one.
//
// A browser's first load gets that skeleton from the server (lib/pageSsr), so
// the first client render must be the skeleton too, even when the loader has
// already answered: the data shows from the render after hydration.
//
// The "Loading forever" mock scenario keeps every page on that skeleton, so
// it can be checked at leisure. Its data still loads; the page never shows
// it, and navigation works as usual (a loader that never answered would hold
// up every navigation after it).
import { useHydrated, useSearch } from '@tanstack/react-router'

export function orPending<T>(data: T): T | undefined {
  const hydrated = useHydrated()
  const loading = useSearch({ strict: false, select: (search: Record<string, unknown>) => search.mock === 'loading' })
  return (typeof window === 'undefined' || hydrated) && !loading ? data : undefined
}

/** When the router shows a page's skeleton (src/router.tsx): only a load
 * still running after `defaultPendingMs`, so a navigation answered from the
 * data cache (lib/query.ts) never shows one, and then for at least
 * `defaultPendingMinMs`, so a cold load reads as loading, not a flicker. */
export const PENDING_TIMING = { defaultPendingMs: 120, defaultPendingMinMs: 300 } as const
