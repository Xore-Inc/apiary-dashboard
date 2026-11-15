import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { clusterQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/clusters/$kind/$value')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Infrastructure cluster views', basePath: (params) => `/clusters/${params.kind}/${encodeURIComponent(params.value)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const cluster = await ensure(context, clusterQuery(params.kind, params.value))
    if (!cluster) throw notFound()
    return cluster
  },
  notFoundComponent: () => <NotFound title="Cluster" description="Unknown kind, or no source shares this value." />,
  component: ClusterLayout,
  pendingComponent: ClusterLayout,
})

function ClusterLayout() {
  const c = usePageQuery(clusterQuery(Route.useParams().kind, Route.useParams().value))
  const { value } = Route.useParams()
  return (
    <EntityFrame
      kind={`Infrastructure cluster · ${Route.useParams().kind}`}
      title={<Pending width={320}>{c && c.value}</Pending>}
      description="Source IPs that share this signal."
      basePath={`/clusters/${c?.kind}/${encodeURIComponent(value)}`}
      tokens={c && (<Token size="sm" label={c.kind} />)}
      facts={[
        { label: 'Source IPs', value: c && (formatNumber(c.group.members.length))},
        { label: 'Events', value: c && (formatNumber(c.group.events.length))},
        { label: 'Sensors', value: c && (formatNumber(c.group.sensorsTotal ?? c.group.sensors.length))},
        { label: 'Last seen', value: c && (c.group.last ? formatDateTime(c.group.last) : '—')},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'members', label: 'Member IPs' }, { id: 'events', label: 'Events' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const c = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'members', label: 'Member IPs', count: c?.group.members.length },
    { id: 'events', label: 'Events', count: c?.group.events.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
