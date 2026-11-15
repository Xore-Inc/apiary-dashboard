// A background refresh (a live event, a polling interval, the first-visit
// time zone) re-runs the page's loaders with router.invalidate(). Started
// while a load is still running, it supersedes that load, whose answer is
// then thrown away. A page whose loaders take longer than the refresh
// interval therefore never shows data at all: on beta (2026-11-01) the
// events page refreshed on every live event at most every 3 s, the cold
// reads took 14-19 s, and the skeleton stayed until a manual reload found
// the backend's cache warm.
//
// So a background refresh waits: during a load it is remembered (once,
// however many arrive) and runs when that load has resolved. Actions an
// operator takes still call router.invalidate() directly.

type Invalidation = { filter?: (match: { routeId: string }) => boolean }

type SettlingRouter = {
  state: { status: string; isLoading: boolean }
  invalidate: (options?: Invalidation) => Promise<unknown>
  subscribe: (event: 'onResolved', fn: () => void) => () => void
}

const deferred = new WeakSet<object>()

const busy = (router: SettlingRouter) => router.state.isLoading || router.state.status === 'pending'

/** Invalidate now if the router is idle, else once its current load
 * resolves. `options.filter` limits it to some routes (the first-visit time
 * zone re-runs only the root's loader, not every page read). */
export function refreshWhenSettled(router: SettlingRouter, options?: Invalidation): void {
  if (!busy(router)) {
    void router.invalidate(options)
    return
  }
  if (deferred.has(router)) return
  deferred.add(router)
  const unsubscribe = router.subscribe('onResolved', () => {
    // A navigation can resolve into another load already under way.
    if (busy(router)) return
    unsubscribe()
    deferred.delete(router)
    void router.invalidate(options)
  })
}
