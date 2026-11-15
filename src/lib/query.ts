// The dashboard's data cache: TanStack Query, one client per router (#309).
//
// The router is created once per server request and once in the browser
// (src/router.tsx), and so is this client: a module-level one would serve one
// operator's answers to the next. Every read is a `queryOptions` of
// src/data/resources.ts, keyed by the server function's name and its
// arguments, so a source, an autonomous system or a campaign is fetched once
// and reused on every page that shows it.
//
// Freshness lives here, not in the router (`defaultPreloadStaleTime: 0`, as
// the router docs prescribe for an external cache): each resource has a class
// whose `staleTime` says how long an answer is shown without asking again,
// and whose `gcTime` how long an unused answer is kept for a revisit.
//
// How a page reads:
// - Its loader calls `ensure(queryClient, options)`. A miss fetches and the
//   navigation waits (the page shows its own skeleton, lib/pending.ts). A hit
//   answers at once, so the page renders from the cache with no skeleton,
//   and a stale hit is also asked again in the background.
// - Its component reads the same options with `usePageQuery`: the cached
//   answer, kept current by every refetch and invalidation. It is not
//   `useSuspenseQuery` because a page here is its own pending state (the
//   route's pendingComponent is the page, drawing skeletons for what it does
//   not have yet), and suspending there would hide that skeleton. The loader
//   has already put the data in the cache, so nothing is fetched from the
//   component. Slow panels read with `useSuspenseQuery` under their own
//   Suspense boundary instead (lib/query.ts `startQuery`).
//
// Revalidation is navigation-driven: the loader revalidates a stale answer
// on every visit, so observers do not refetch on mount (that would ask twice
// right after a cold load). Nothing polls. Focus and reconnect refetch only
// the live class, where the answer is expected to move while the tab sat in
// the background and the read is one cheap call.
import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query'
import type { DataTag, Query, QueryKey } from '@tanstack/react-query'
import { isBackendGap } from '#/lib/backendGap'
import { orPending } from '#/lib/pending'

const SECOND = 1000
const MINUTE = 60 * SECOND

/** How fast a resource's answer moves, and so how long it is reused. */
export type Freshness = 'live' | 'normal' | 'slow' | 'static'

export const FRESHNESS: Record<Freshness, { staleTime: number; gcTime: number; refetchOnWindowFocus: boolean; refetchOnReconnect: boolean }> = {
  /** The live feed, alerts, the alert count: asked again on every visit and
   * when the tab comes back. */
  live: { staleTime: 0, gcTime: 5 * MINUTE, refetchOnWindowFocus: true, refetchOnReconnect: true },
  /** Lists and aggregates: reused for 30 s (the backend's own shared read
   * cache, BACKEND_READ_CACHE_TTL_MS, is 15 s). */
  normal: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE, refetchOnWindowFocus: false, refetchOnReconnect: false },
  /** Detail pages, catalogs, configuration, admin, reports: minutes. An
   * operator bouncing list → detail → back finds the detail kept. */
  slow: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE, refetchOnWindowFocus: false, refetchOnReconnect: false },
  /** Fixed for the life of the page: the mock clock, whether mock scenarios
   * may show. */
  static: { staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false },
}

/** The client for one router: one per server request, one in the browser. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        ...FRESHNESS.normal,
        // A failed read is shown as it failed (the page's error and gap
        // states); retrying an overloaded backend only adds to its load.
        retry: false,
        refetchOnMount: false,
      },
      mutations: { retry: false },
    },
  })
}

/** The options of one resource read: what loaders, components and
 * invalidations share. */
export type ResourceOptions<TData> = {
  queryKey: DataTag<QueryKey, TData, Error>
  queryFn: () => Promise<TData>
  staleTime: (query: Query<TData, Error, TData, QueryKey>) => number
  gcTime: number
  refetchOnWindowFocus: boolean
  refetchOnReconnect: boolean
  meta: { freshness: Freshness }
}

/** The options of one backend resource: keyed by the server function's name
 * and its arguments, so every page asking for the same thing shares it. A
 * panel's "the backend does not serve this yet" answer (lib/backendGap) is
 * never reused: the next visit asks again. */
export function resource<TArgs extends unknown[], TData>(name: string, read: (...args: TArgs) => Promise<TData>, freshness: Freshness): (...args: TArgs) => ResourceOptions<TData> {
  const { staleTime, ...rest } = FRESHNESS[freshness]
  return (...args) =>
    queryOptions({
      queryKey: [name, ...args] as QueryKey,
      queryFn: () => read(...args),
      ...rest,
      staleTime: (query: Query<TData, Error, TData, QueryKey>) => (isBackendGap(query.state.data) ? 0 : staleTime),
      meta: { freshness },
    }) as ResourceOptions<TData>
}

const noop = () => {}

/** What a loader awaits: the cached answer at once when there is one (asked
 * again in the background when stale), else the fetch. */
export function ensure<TData>(queryClient: QueryClient, options: ResourceOptions<TData>): Promise<TData> {
  // query() with the resource's own staleTime is a no-op on a fresh answer
  // and a fetch on a stale one; a failure shows on the page's observer.
  if (queryClient.getQueryData(options.queryKey) !== undefined) void queryClient.query(options).catch(noop)
  return queryClient.query({ ...options, staleTime: 'static' })
}

/** A slow read a loader starts without waiting for it: the page renders
 * with its fast data, and the panel reading this under a Suspense boundary
 * fills in when it answers (the router's deferred-data pattern for an
 * external cache). */
export function startQuery<TData>(queryClient: QueryClient, options: ResourceOptions<TData>): void {
  void queryClient.query(options).catch(noop)
}

/** A page's read of what its loader put in the cache: undefined while the
 * page is its own pending state (lib/pending.ts), else the current answer,
 * kept current by every refetch and invalidation. */
export function usePageQuery<TData>(options: ResourceOptions<TData>): TData | undefined {
  return orPending(useQuery(options).data)
}
