import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { AckButton } from '#/components/details/Alert'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { SeverityToken } from '#/components/SeverityToken'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { alertDetailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/alerts/$key')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Alert views', basePath: (params) => `/alerts/${encodeURIComponent(params.key)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, alertDetailQuery(params.key))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => (
    <NotFound
      title="Alert"
      description="No alert of this class is on record."
    />
  ),
  component: AlertLayout,
  pendingComponent: AlertLayout,
})

function AlertLayout() {
  const loaded = usePageQuery(alertDetailQuery(Route.useParams().key))
  const { key } = Route.useParams()
  const group = loaded?.group
  return (
    <EntityFrame
      kind={group ? `Alert · ${group.kind}` : "Alert"}
      title={<Pending width={320}>{group && group.message}</Pending>}
      basePath={`/alerts/${encodeURIComponent(key)}`}
      tokens={group && (<>
          <SeverityToken severity={group.severity} />
          <Token
            label={group.acknowledged ? 'acknowledged' : 'new'}
            size="sm"
            color={group.acknowledged ? 'gray' : 'orange'}
          />
        </>)}
      actions={group && (<AckButton group={group} />)}
      facts={[
        { label: 'Observed', value: group && (formatNumber(group.count))},
        { label: 'Records', value: group && (formatNumber(group.members.length))},
        { label: 'First seen', value: group && (formatDateTime(group.firstSeen))},
        { label: 'Last seen', value: group && (formatDateTime(group.lastSeen))},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'members', label: 'Members' }, { id: 'evidence', label: 'Evidence' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { group, sources, hashes } = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'members', label: 'Members', count: group?.members.length },
    { id: 'evidence', label: 'Evidence', count: sources.length + hashes.length },
  ]
}
