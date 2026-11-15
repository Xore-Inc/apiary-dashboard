// @vitest-environment jsdom
// Slow panels (#309): the page renders without waiting for them, the panel
// shows its skeleton, then its data, or its backend gap when the read
// fails; a preload never starts one.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryHistory, createRootRouteWithContext, createRoute, createRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { isBackendGap } from '#/lib/backendGap'
import { createQueryClient, ensure, resource, startQuery } from '#/lib/query'
import { Deferred } from './Deferred'

const panel = (data: string[] | { gap: string } | undefined) => <p>{data === undefined ? 'panel skeleton' : isBackendGap(data) ? `gap: ${data.gap}` : data.join(',')}</p>

function app(slowRead: () => Promise<string[]>) {
  const queryClient = createQueryClient()
  const fast = resource('readFast', async () => 'the page', 'normal')
  const slow = resource('readSlowPanel', slowRead, 'slow')
  const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: () => <Outlet /> })
  const page = createRoute({
    getParentRoute: () => root,
    path: '/page',
    loader: async ({ context }) => {
      startQuery(context, slow())
      return ensure(context, fast())
    },
    component: () => (
      <>
        <h1>{page.useLoaderData()}</h1>
        <Deferred query={slow()}>{panel}</Deferred>
      </>
    ),
  })
  const home = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> })
  const router = createRouter({ routeTree: root.addChildren([home, page]), context: { queryClient }, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

describe('a slow panel', () => {
  it('does not hold the page: the page renders, the panel fills in later', async () => {
    let answer: (rows: string[]) => void = () => {}
    const { router } = app(() => new Promise((resolve) => (answer = resolve)))
    await screen.findByText('home')
    await act(() => router.navigate({ href: '/page' }))
    await screen.findByText('the page')
    expect(screen.getByText('panel skeleton')).toBeTruthy()
    await act(async () => answer(['a', 'b']))
    await screen.findByText('a,b')
  })

  it('shows a failed read as its gap, and the page stays', async () => {
    const { router } = app(async () => {
      throw new Error('getRelated: 403 forbidden')
    })
    await screen.findByText('home')
    await act(() => router.navigate({ href: '/page' }))
    await screen.findByText('the page')
    expect(await screen.findByText(/^gap: /)).toBeTruthy()
  })
})

describe('startQuery', () => {
  it('starts the read on a navigation, never on a preload', async () => {
    const queryClient = createQueryClient()
    const read = vi.fn(async () => ['x'])
    const slow = resource('readSlowStart', read, 'slow')
    startQuery({ queryClient, preload: true }, slow())
    expect(read).not.toHaveBeenCalled()
    startQuery({ queryClient, preload: false }, slow())
    expect(read).toHaveBeenCalledTimes(1)
  })
})
