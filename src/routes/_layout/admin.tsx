// /admin: the dashboard's administration, one panel per tab: branding,
// defaults, honeypot operations, users, services, report templates,
// canarytokens, storage, dead letters, configuration history and the audit
// log. Admins only; the settings dialog keeps what is personal.
import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { PageFrame } from '#/components/PageFrame'
import { AdminPanelView } from '#/components/SettingsDialog'
import { SettingsPanelHeading } from '#/components/settings/parts'
import { PANEL_GROUPS } from '#/components/settings/registry'
import type { PaneId } from '#/components/settings/registry'
import { searchTabs } from '#/components/ViewTabs'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { settingsQuery } from '#/data/resources'

const ADMIN_PANES = PANEL_GROUPS[1].panels

export const Route = createFileRoute('/_layout/admin')({
  ssr: pageSsr,
  staticData: { viewTabs: searchTabs({ label: 'Administration', param: 'pane', tabs: () => ADMIN_PANES.map((panel) => ({ id: panel.id, label: panel.label })) }) },
  validateSearch: (search: Record<string, unknown>): { pane?: PaneId } => ({
    pane: ADMIN_PANES.some((panel) => panel.id === search.pane) ? (search.pane as PaneId) : undefined,
  }),
  // A viewer has no administration to see; the server refuses every write
  // here for them anyway.
  beforeLoad: ({ context }) => {
    if (!context.user.roles.includes('admin')) throw redirect({ to: '/' })
  },
  // The panels' data comes with the page, so an outage shows as one.
  loader: ({ context }) => ensure(context, settingsQuery()),
  component: AdminPage,
  pendingComponent: AdminPage,
})

function AdminPage() {
  const { pane = ADMIN_PANES[0].id } = Route.useSearch()
  const data = usePageQuery(settingsQuery())
  return (
    <PageFrame title="Administration" description="Settings that affect everyone: branding, defaults, operations, users and the record of changes.">
      <SettingsPanelHeading panel={pane} />
      {data ? <AdminPanelView pane={pane} initial={data} /> : <SkeletonPanels count={2} lines={6} />}
    </PageFrame>
  )
}
