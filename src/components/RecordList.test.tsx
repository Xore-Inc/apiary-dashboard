// @vitest-environment jsdom
// A list's rows open their entity page through a real link in the first
// cell, so the keyboard, screen readers, middle-click and "copy link" reach
// it; a click anywhere on the row still opens it.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { neutralTheme } from '#/themes/neutral/neutral-family'
import { RecordList } from './RecordList'
import { RouterLink } from './RouterLink'

afterEach(cleanup)

type Row = { id: string; name: string; colour: string }
const rows: Row[] = [
  { id: 'a', name: 'Alpha', colour: 'teal' },
  { id: 'b', name: 'Beta', colour: 'amber' },
]

/** The list, and a detail route whose loader stands for the entity reads a
 * row's page makes (a server function per row). Preloading as the app has it. */
function renderList(listRows: Row[] = rows, onThingLoad: (id: string) => void = () => {}) {
  const root = createRootRoute()
  const list = createRoute({
    getParentRoute: () => root,
    path: '/things',
    component: () => (
      <RecordList
        title="Things"
        rows={listRows}
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'colour', header: 'Colour' },
        ]}
        getId={(row) => row.id}
        getHref={(row) => `/things/${row.id}`}
        emptyState={{ title: 'No things', description: 'None yet.' }}
      />
    ),
  })
  const thing = createRoute({ getParentRoute: () => root, path: '/things/$id', loader: ({ params }) => { onThingLoad(params.id) }, component: () => <p>thing page</p> })
  const router = createRouter({ routeTree: root.addChildren([list, thing]), history: createMemoryHistory({ initialEntries: ['/things'] }), defaultPreload: 'intent', defaultPreloadStaleTime: 0 })
  render(
    <Theme theme={neutralTheme}>
      <LinkProvider component={RouterLink}>
        <RouterProvider router={router} />
      </LinkProvider>
    </Theme>,
  )
  return router
}

describe('RecordList', () => {
  it('links each row from its first cell, and the row is not a second tab stop', async () => {
    renderList()
    const link = await screen.findByRole('link', { name: 'Alpha' })
    expect(link.getAttribute('href')).toBe('/things/a')
    expect(link.closest('tr')?.getAttribute('tabindex')).toBeNull()
  })

  it('opens the row in the app from the link and from anywhere on the row', async () => {
    const router = renderList()
    await userEvent.click(await screen.findByRole('link', { name: 'Alpha' }))
    await screen.findByText('thing page')
    expect(router.state.location.pathname).toBe('/things/a')
    await router.navigate({ href: '/things' })
    await userEvent.click(await screen.findByText('amber'))
    await screen.findByText('thing page')
    expect(router.state.location.pathname).toBe('/things/b')
  })

  it('preloads no row as it comes into view, only on intent (#309: viewport preloading shed reads on production)', async () => {
    const observed = new Set<Element>()
    const original = window.IntersectionObserver
    window.IntersectionObserver = class {
      observe(el: Element) {
        observed.add(el)
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
    try {
      const many = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}`, colour: 'teal' }))
      renderList(many)
      await screen.findByRole('link', { name: 'Row 0' })
      expect([...observed].filter((el) => el.getAttribute('href')?.startsWith('/things/'))).toEqual([])
    } finally {
      window.IntersectionObserver = original
    }
  })

  it('rendering a list reads no entity: the row loaders stay idle even when every row is on screen (#309)', async () => {
    const original = window.IntersectionObserver
    // Every observed element reports itself visible at once, the worst case
    // for any viewport-triggered preloading.
    window.IntersectionObserver = class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.callback([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    } as unknown as typeof IntersectionObserver
    try {
      const loaded: string[] = []
      const many = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}`, colour: 'teal' }))
      renderList(many, (id) => loaded.push(id))
      await screen.findByRole('link', { name: 'Row 0' })
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(loaded).toEqual([])
      // Intent still preloads: the hovered row, and only it.
      await userEvent.hover(screen.getByRole('link', { name: 'Row 3' }))
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(loaded).toEqual(['r3'])
    } finally {
      window.IntersectionObserver = original
    }
  })
})
