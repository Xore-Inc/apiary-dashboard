// @vitest-environment jsdom
// The identity graph at fleet scale: real identities can be large, so the
// cap and the overflow node are checked here.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router'
import { AttackerGraph } from './AttackerGraph'

afterEach(cleanup)

function renderGraph(ips: string[]) {
  const root = createRootRoute({ component: () => <AttackerGraph id="0123456789abcdef" ips={ips} membersHref="#members" /> })
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterProvider router={router} />)
}

const ips = (n: number) => Array.from({ length: n }, (_, i) => `198.51.100.${i + 1}`)

describe('AttackerGraph', () => {
  it('draws every member of a small identity, and no overflow', async () => {
    renderGraph(ips(5))
    const links = await screen.findAllByRole('link', { name: /^Source / })
    expect(links).toHaveLength(5)
    // Real links: middle-click and "copy link" reach the source page.
    expect(links[0].getAttribute('href')).toBe('/sources/198.51.100.1')
    expect(screen.queryByRole('link', { name: /more members/ })).toBeNull()
  })

  it('caps a large identity and folds the rest into one node', async () => {
    renderGraph(ips(30))
    expect(await screen.findAllByRole('link', { name: /^Source / })).toHaveLength(24)
    expect(screen.getByRole('link', { name: '+6 more members' })).toBeTruthy()
  })
})
