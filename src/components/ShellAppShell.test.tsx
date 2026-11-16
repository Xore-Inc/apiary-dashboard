// @vitest-environment jsdom
// Shell composition (#4): one shell, one content region, navigation metadata
// driving active item and breadcrumbs, and the palette's keyboard contract.
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '@tanstack/react-router'
import { NAV_SECTIONS } from '#/lib/nav'
import { neutralTheme } from '#/themes/neutral/neutral-family'
import { RouterLink } from './RouterLink'
import { ShellAppShell } from './ShellAppShell'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '#/lib/query'
import { searchTabs } from './ViewTabs'
import { dashboardConfig } from '#/data/adapters/settings'
import { openAlertCountQuery } from '#/data/resources'
import type { ShellConfig } from '#/data/types'

// The configuration a backend with nothing configured answers (the compiled
// defaults) with the ML panels on, so every nav item shows, plus the
// deployment's links. The shell's one read, the open alert count, is put in
// the cache where a test needs it: nothing here reaches a backend.
const DEFAULTS = dashboardConfig({ revision: 1, payload: {} })
const CONFIG: ShellConfig = {
  ...DEFAULTS,
  behavior: { ...DEFAULTS.behavior, showMlPanels: true },
  links: { kibana: 'https://kibana.example.test', evebox: 'https://evebox.example.test', arkime: 'https://arkime.example.test', accountConsole: 'https://sso.example.test/realms/apiary/account/' },
}

function TabbedPage() {
  const second = useLocation({ select: (location) => location.searchStr.includes('view=two') })
  return <p>{second ? 'second view' : 'first view'}</p>
}

const user = { name: 'Test Operator', email: 'op@example.test', roles: ['admin'] }

function renderShell(path: string, { openAlerts }: { openAlerts?: number } = {}) {
  const root = createRootRoute({ component: () => <ShellAppShell user={user} config={CONFIG} onSettingsPane={() => {}} /> })
  const page = (routePath: string, text: string) =>
    createRoute({ getParentRoute: () => root, path: routePath, component: () => <p>{text}</p> })
  const router = createRouter({
    routeTree: root.addChildren([
      page('/', 'overview content'),
      page('/events', 'events content'),
      page('/events/$id', 'event detail content'),
      page('/alerts', 'alerts content'),
      page('/sources/$ip', 'source content'),
      page('/settings', 'settings content'),
      createRoute({
        getParentRoute: () => root,
        path: '/tabbed',
        staticData: {
          viewTabs: searchTabs({
            label: 'Test views',
            param: 'view',
            tabs: () => [
              { id: 'one', label: 'View one' },
              { id: 'two', label: 'View two' },
            ],
          }),
        },
        component: TabbedPage,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const client = createQueryClient()
  if (openAlerts !== undefined) client.setQueryData(openAlertCountQuery().queryKey, openAlerts)
  render(
    <QueryClientProvider client={client}>
      <Theme theme={neutralTheme}>
        <LinkProvider component={RouterLink}>
          <RouterProvider router={router} />
        </LinkProvider>
      </Theme>
    </QueryClientProvider>,
  )
  return router
}

describe('ShellAppShell', () => {

  it('renders exactly one shell with one content region', async () => {
    renderShell('/alerts')
    expect(await screen.findByText('alerts content')).toBeTruthy()
    const regions = screen.getAllByRole('main')
    expect(regions).toHaveLength(1)
    expect(within(regions[0]).getByText('alerts content')).toBeTruthy()
    expect(screen.getAllByRole('navigation', { name: 'Side navigation' })).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: 'Page header' })).toHaveLength(1)
  })

  it('renders the full sidebar from navigation metadata', async () => {
    renderShell('/')
    await screen.findByText('overview content')
    for (const section of NAV_SECTIONS.map((s) => s.label)) {
      expect(screen.getAllByText(section).length).toBeGreaterThan(0)
    }
    const sidebar = screen.getByRole('navigation', { name: 'Side navigation' })
    for (const item of NAV_SECTIONS.flatMap((section) => section.items)) {
      expect(within(sidebar).getByRole('link', { name: item.label }).getAttribute('href')).toBe(item.to)
    }
  })

  it('marks the parent nav item for a drill-down route', async () => {
    renderShell('/events/evt-123')
    await screen.findByText('event detail content')
    const sidebar = screen.getByRole('navigation', { name: 'Side navigation' })
    const active = within(sidebar).getByRole('link', { name: 'Event explorer' })
    expect(active.getAttribute('aria-current')).toBe('page')
    // Where the page sits is its own header's trail now (PageFrame), not
    // the top bar's.
    expect(screen.queryByRole('navigation', { name: 'Current page' })).toBeNull()
  })

  it('shows the signed-in user in the account menu', async () => {
    renderShell('/')
    await screen.findByText('overview content')
    expect(screen.getByRole('button', { name: /Test Operator/ })).toBeTruthy()
  })

  it('opens the palette with Ctrl+K and navigates to the chosen page', async () => {
    const router = renderShell('/')
    await screen.findByText('overview content')
    const u = userEvent.setup()
    await u.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog')
    await u.keyboard('Alerts')
    await u.click(await within(dialog).findByText('Alerts'))
    await act(async () => {})
    expect(router.state.location.pathname).toBe('/alerts')
    expect(await screen.findByText('alerts content')).toBeTruthy()
  })

  it('opens the palette with / outside a field, and not while typing', async () => {
    renderShell('/')
    await screen.findByText('overview content')
    const field = document.createElement('input')
    document.body.append(field)
    // Typed into a field, / is just a character.
    expect(fireEvent.keyDown(field, { key: '/' })).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    field.remove()
    // Anywhere else it opens the palette, and is not typed into it.
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('shows the open-alert count on the bell in the top bar', async () => {
    renderShell('/', { openAlerts: 7 })
    await screen.findByText('overview content')
    const header = screen.getByRole('navigation', { name: 'Page header' })
    const bell = await within(header).findByRole('link', { name: 'Alerts, 7 open' }, { timeout: 3000 })
    expect(bell.getAttribute('href')).toBe('/alerts')
  })

  it("puts a page's views in the top bar and switches between them", async () => {
    renderShell('/tabbed')
    await screen.findByText('first view')
    const header = screen.getByRole('navigation', { name: 'Page header' })
    await userEvent.setup().click(within(header).getAllByText('View two')[0])
    expect(await screen.findByText('second view')).toBeTruthy()
  })

  it('shows no view tabs on a page without views', async () => {
    renderShell('/alerts')
    await screen.findByText('alerts content')
    const header = screen.getByRole('navigation', { name: 'Page header' })
    expect(within(header).queryByText('View one')).toBeNull()
  })
})
