// @vitest-environment jsdom
// The data cache (#309): freshness classes, the loader's ensure() on a hit
// and a miss, what the server hands the browser, and that a navigation
// answered from the cache never paints the page's skeleton.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClientProvider, dehydrate, hydrate } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { FRESHNESS, createQueryClient, ensure, resource, startQuery, usePageQuery } from './query'
import { PENDING_TIMING } from './pending'

const staleTimeOf = (client: QueryClient, options: { queryKey: readonly unknown[]; staleTime: (q: never) => number }) =>
  options.staleTime(client.getQueryCache().find({ queryKey: options.queryKey }) as never)

describe('freshness classes', () => {
  it('live is asked again on every visit, normal after 30 s, slow after minutes', () => {
    expect(FRESHNESS.live.staleTime).toBe(0)
    expect(FRESHNESS.normal.staleTime).toBe(30_000)
    expect(FRESHNESS.slow.staleTime).toBeGreaterThanOrEqual(60_000)
    expect(FRESHNESS.slow.gcTime).toBeGreaterThan(FRESHNESS.normal.gcTime)
    // Only the live class refetches when the tab comes back.
    expect(Object.entries(FRESHNESS).filter(([, f]) => f.refetchOnWindowFocus).map(([k]) => k)).toEqual(['live'])
  })

  it('a resource carries its class, and a backend gap is never reused', async () => {
    const client = createQueryClient()
    const ok = resource('readOk', async (id: string) => ({ id }), 'slow')('a')
    const gap = resource('readGap', async () => ({ gap: 'not yet' }), 'slow')()
    await ensure(client, ok)
    await ensure(client, gap)
    expect(ok.queryKey).toEqual(['readOk', 'a'])
    expect(ok.meta.freshness).toBe('slow')
    expect(staleTimeOf(client, ok)).toBe(FRESHNESS.slow.staleTime)
    expect(staleTimeOf(client, gap)).toBe(0)
  })

  it('the client does not retry, and observers leave revalidation to the loaders', () => {
    const defaults = createQueryClient().getDefaultOptions().queries!
    expect(defaults.retry).toBe(false)
    expect(defaults.refetchOnMount).toBe(false)
    expect(defaults.refetchOnWindowFocus).toBe(false)
  })
})

describe('ensure', () => {
  it('fetches on a miss and answers a fresh hit from the cache', async () => {
    const client = createQueryClient()
    const read = vi.fn(async (id: string) => `v-${id}`)
    const thing = resource('readThing', read, 'normal')
    expect(await ensure(client, thing('1'))).toBe('v-1')
    expect(await ensure(client, thing('1'))).toBe('v-1')
    expect(read).toHaveBeenCalledTimes(1)
    // Another argument is another entry.
    expect(await ensure(client, thing('2'))).toBe('v-2')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('answers a stale hit at once and revalidates it in the background', async () => {
    const client = createQueryClient()
    let n = 0
    let release: () => void = () => {}
    const read = vi.fn(async () => {
      n++
      if (n > 1) await new Promise<void>((resolve) => (release = resolve))
      return n
    })
    const live = resource('readLive', read, 'live')()
    expect(await ensure(client, live)).toBe(1)
    // Stale at once (live): the cached answer comes back without waiting.
    expect(await ensure(client, live)).toBe(1)
    expect(read).toHaveBeenCalledTimes(2)
    release()
    await vi.waitFor(() => expect(client.getQueryData(live.queryKey)).toBe(2))
  })

  it('a slow read is started without waiting, and shared with the next ask', async () => {
    const client = createQueryClient()
    const read = vi.fn(async () => 'slow')
    const slow = resource('readSlow', read, 'slow')()
    startQuery(client, slow)
    expect(await ensure(client, slow)).toBe('slow')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('a failed read rejects the loader and is not cached as an answer', async () => {
    const client = createQueryClient()
    const read = vi.fn(async () => {
      throw new Error('down')
    })
    const broken = resource('readBroken', read, 'normal')()
    await expect(ensure(client, broken)).rejects.toThrow('down')
    await expect(ensure(client, broken)).rejects.toThrow('down')
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('server to browser', () => {
  it('what the server read is in the browser cache, and not read again', async () => {
    const server = createQueryClient()
    const read = vi.fn(async () => ({ theme: 'dark' }))
    const prefs = resource('readPrefs', read, 'normal')
    await ensure(server, prefs())
    // The SSR integration hands the cache over this way (dehydrate on the
    // server, hydrate in the browser).
    const browser = createQueryClient()
    hydrate(browser, JSON.parse(JSON.stringify(dehydrate(server))))
    expect(await ensure(browser, prefs())).toEqual({ theme: 'dark' })
    expect(read).toHaveBeenCalledTimes(1)
  })
})

// A small app with the dashboard's router timing: a page whose pending
// component is its own skeleton, read with usePageQuery.
function app(read: (id: string) => Promise<string>, timing: { defaultPendingMs: number; defaultPendingMinMs: number } = PENDING_TIMING) {
  const queryClient = createQueryClient()
  const thing = resource('readPage', read, 'normal')
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: () => <Outlet /> })
  const Page = () => {
    const { id } = page.useParams()
    const value = usePageQuery(thing(id))
    return <p>{value ?? 'skeleton'}</p>
  }
  const page = createRoute({
    getParentRoute: () => root,
    path: '/things/$id',
    loader: ({ params, context }) => ensure(context.queryClient, thing(params.id)),
    component: Page,
    // Marked, so a test can tell the router's pending state from the page.
    pendingComponent: () => (
      <>
        <i>pending</i>
        <Page />
      </>
    ),
  })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> })
  const router = createRouter({
    routeTree: root.addChildren([home, page]),
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPreloadStaleTime: 0,
    ...timing,
  })
  return { router, queryClient }
}

describe('navigation', () => {
  it('a cold load shows the skeleton; a revisit renders from the cache without it', async () => {
    let calls = 0
    const { router, queryClient } = app(async (id) => {
      calls++
      await new Promise((resolve) => setTimeout(resolve, 400))
      return `thing ${id}`
    })
    const painted: string[] = []
    const observer = new MutationObserver(() => painted.push(document.body.textContent))
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByText('home')
    await act(() => router.navigate({ href: '/things/1' }))
    await screen.findByText('thing 1')
    expect(painted.some((t) => t.includes('skeleton'))).toBe(true)
    await act(() => router.navigate({ to: '/' }))
    await screen.findByText('home')
    // Past the router's own cache: the match is gone, the answer is not.
    router.clearCache()
    painted.length = 0
    await act(() => router.navigate({ href: '/things/1' }))
    await screen.findByText('thing 1')
    // Neither the page's skeleton nor the router's pending state.
    expect(painted.some((t) => t.includes('skeleton') || t.includes('pending'))).toBe(false)
    expect(calls).toBe(1)
    observer.disconnect()
  })

  it('(the old timing, pendingMs 0, painted the pending state even on a cache hit)', async () => {
    const { router, queryClient } = app(async (id) => `thing ${id}`, { defaultPendingMs: 0, defaultPendingMinMs: 250 })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByText('home')
    await queryClient.query({ queryKey: ['readPage', '1'], queryFn: async () => 'thing 1' })
    const painted: string[] = []
    const observer = new MutationObserver(() => painted.push(document.body.textContent))
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    await act(() => router.navigate({ href: '/things/1' }))
    await screen.findByText('thing 1')
    expect(painted.some((t) => t.includes('pending'))).toBe(true)
    observer.disconnect()
  })

  it('a hover preload is reused by the click that follows', async () => {
    const read = vi.fn(async (id: string) => `thing ${id}`)
    const { router, queryClient } = app(read)
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    await screen.findByText('home')
    await act(() => router.preloadRoute({ to: '/things/7' as never }))
    await act(() => router.navigate({ href: '/things/7' }))
    await screen.findByText('thing 7')
    expect(read).toHaveBeenCalledTimes(1)
  })
})
