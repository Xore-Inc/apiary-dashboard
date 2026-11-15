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
import { QueryClient, queryOptions, skipToken, useQueries, useQuery } from '@tanstack/react-query'
import type { DataTag, Query, QueryKey } from '@tanstack/react-query'
import { isBackendGap } from '#/lib/backendGap'
import { orPending } from '#/lib/pending'

const SECOND = 1000
const MINUTE = 60 * SECOND

/** How fast a resource's answer moves, and so how long it is reused. */
export type Freshness = 'live' | 'normal' | 'slow' | 'static'

type Refocus = boolean | ((query: { state: { dataUpdatedAt: number } }) => boolean)

/** Asked again when the tab comes back or the network returns, unless the
 * answer is only seconds old (the page has just loaded it). */
const olderThan10s: Refocus = (query) => Date.now() - query.state.dataUpdatedAt > 10 * SECOND

export const FRESHNESS: Record<Freshness, { staleTime: number; gcTime: number; refetchOnWindowFocus: Refocus; refetchOnReconnect: Refocus }> = {
  /** The live feed, alerts, source health: asked again on every visit, and
   * when the tab comes back or the network returns. */
  live: { staleTime: 0, gcTime: 5 * MINUTE, refetchOnWindowFocus: olderThan10s, refetchOnReconnect: olderThan10s },
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
  refetchOnWindowFocus: Refocus
  refetchOnReconnect: Refocus
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

/** Where a loader reads: the router's data cache, and whether this load is
 * a preload (a hover, a predicted next page) rather than the navigation
 * itself. The layout puts `preload` in every page's router context. */
export type LoaderCache = QueryClient | { queryClient: QueryClient; preload?: boolean }

const clientOf = (cache: LoaderCache): QueryClient => (cache instanceof QueryClient ? cache : cache.queryClient)

/** What a loader awaits: the cached answer at once when there is one (asked
 * again in the background when stale), else the fetch. A preload of a page
 * whose answer is cached revalidates nothing: the navigation that follows
 * does, so hovering over or predicting a live page costs no call. */
export function ensure<TData>(cache: LoaderCache, options: ResourceOptions<TData>): Promise<TData> {
  const queryClient = clientOf(cache)
  const preload = !(cache instanceof QueryClient) && cache.preload === true
  // query() with the resource's own staleTime is a no-op on a fresh answer
  // and a fetch on a stale one; a failure shows on the page's observer.
  if (!preload && queryClient.getQueryData(options.queryKey) !== undefined) void queryClient.query(options).catch(noop)
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
 * kept current by every refetch and invalidation. Undefined options (a read
 * whose arguments are not known yet) read nothing. */
export function usePageQuery<TData>(options: ResourceOptions<TData> | undefined): TData | undefined {
  const { data } = useQuery<TData, Error, TData, QueryKey>(options ?? { queryKey: NOTHING, queryFn: skipToken })
  return orPending(options ? data : undefined)
}

const NOTHING = ['nothing'] as const

type DataOf<T> = T extends ResourceOptions<infer D> ? D : never

/** The answer type of a resource of src/data/resources.ts. */
export type ResourceData<TResource> = TResource extends (...args: never[]) => ResourceOptions<infer D> ? D : never

/** Any resource's options. `any`, not `unknown`: Query's options are
 * invariant in their data type (staleTime takes the typed Query), so a
 * list of differently typed reads has no narrower common type. */
type AnyResource = ResourceOptions<any>

/** Several reads a page combines (a payload's analyses, a sensor's detail
 * with the fleet's health): the combination once every one has answered,
 * undefined until then and while the page is its own pending state. The
 * loader awaits the same reads and combines them the same way. */
export function usePageQueries<TQueries extends readonly AnyResource[], TResult>(
  queries: readonly [...TQueries],
  combine: (data: { [K in keyof TQueries]: DataOf<TQueries[K]> }) => TResult,
): TResult | undefined {
  const combined = useQueries({
    queries,
    combine: (results) => (results.every((r) => r.data !== undefined) ? combine(results.map((r) => r.data) as { [K in keyof TQueries]: DataOf<TQueries[K]> }) : undefined),
  })
  return orPending(combined)
}

/** The loader's side of usePageQueries: every read ensured, then combined. */
export async function ensureAll<TQueries extends readonly AnyResource[]>(cache: LoaderCache, queries: readonly [...TQueries]): Promise<{ [K in keyof TQueries]: DataOf<TQueries[K]> }> {
  return (await Promise.all(queries.map((q) => ensure(cache, q)))) as { [K in keyof TQueries]: DataOf<TQueries[K]> }
}

/** The shell's reads (session, preferences, configuration, the bell's
 * count): refreshed by the navigation guard and the bell's own minute, not
 * by a page's live refresh. */
const SHELL_READS = new Set(['getSessionUser', 'getPreferences', 'getShellConfig', 'getMockClock', 'getMockScenariosAllowed', 'getOpenAlertCount'])

/** A live page's refresh (a live event, the live interval, live resuming):
 * every read the page shows is asked again in the background, the cached
 * answer staying on screen until the new one arrives. A read still running
 * is joined, not restarted, so a slow read always gets to answer (the
 * reason lib/refreshWhenSettled exists for router reloads). */
export function refreshPageData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries(
    { type: 'active', predicate: (query) => !SHELL_READS.has(String(query.queryKey[0])) && query.meta?.freshness !== 'static' },
    { cancelRefetch: false },
  )
}
