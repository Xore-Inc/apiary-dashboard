import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import { PagePending } from './components/PagePending'
import { PENDING_TIMING } from './lib/pending'
import { createQueryClient } from './lib/query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // The request's CSP nonce (lib/cspNonce.server.ts), read per router: the
  // server makes one per request, inside that request's scope. The global is
  // absent in the browser, so this is undefined there.
  const csp = (globalThis as typeof globalThis & { __APIARY_CSP__?: { current?: () => string | undefined } }).__APIARY_CSP__
  // One data cache per router, so per server request (#309, lib/query.ts):
  // what the server read for this page is handed to the browser's cache
  // with the HTML and is not fetched again on hydration.
  const queryClient = createQueryClient()
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    ssr: { nonce: csp?.current?.() },
    scrollRestoration: true,
    // Search params and loader data are JSON (strings, numbers, plain
    // objects; no Date or class instances cross the wire), so selectors may
    // return new objects and still re-render only when their content
    // changes (render optimizations, #309).
    defaultStructuralSharing: true,
    defaultPreload: 'intent',
    // Query owns freshness: a preload's answer sits in its cache with its
    // resource's staleTime, so the router treats its own copy as stale at
    // once and the click re-runs the loader, which answers from the cache
    // (the router docs' setting for an external cache).
    defaultPreloadStaleTime: 0,
    // The loaders only ask the cache (lib/query.ts ensure), and Query decides
    // what is stale. A loader that ran seconds ago is not re-run by a reload
    // of the same address (the first-visit time zone refresh), which would
    // ask the live reads again right after the page loaded them. Past that, a
    // revisit re-runs the loaders, so live pages revalidate on every visit.
    defaultStaleTime: 5_000,
    defaultNotFoundComponent: () => <NotFound />,
    defaultErrorComponent: DefaultCatchBoundary,
    // A navigation whose data is cached never shows a skeleton: its loaders
    // answer within the pending delay. A cold load shows the page's own
    // skeleton (each page is its own pendingComponent; this is the fallback)
    // after that short delay, held long enough to read as loading rather
    // than a flicker. A full load does the same from the server (lib/pageSsr).
    defaultPendingComponent: PagePending,
    ...PENDING_TIMING,
  })
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    // A failed read is the route's error (serialized by the router); the
    // cache hands over answers only, so the browser asks a failed read again.
    dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status !== 'error' },
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
