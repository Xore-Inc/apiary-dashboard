import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { asnQuery } from '#/data/resources'
import { formatDateTime, formatNumber } from '#/lib/format'

export const Route = createFileRoute('/_layout/asn/$asn')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Autonomous system views', basePath: (params) => `/asn/${encodeURIComponent(params.asn)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const asn = await ensure(context, asnQuery(params.asn))
    if (!asn) throw notFound()
    return asn
  },
  notFoundComponent: () => <NotFound title="Autonomous system" description="No source from this autonomous system was seen." />,
  component: AsnLayout,
  pendingComponent: AsnLayout,
})

function AsnLayout() {
  const { asn } = Route.useParams()
  const a = usePageQuery(asnQuery(asn))
  return (
    <EntityFrame
      kind="Autonomous system"
      title={<Pending width={320}>{a && a.asn}</Pending>}
      description={a?.orgs.join(', ')}
      basePath={`/asn/${encodeURIComponent(asn)}`}
      facts={[
        { label: 'Source IPs', value: a && (formatNumber(a.group.members.length))},
        { label: 'Networks', value: a && (formatNumber(a.group.networks.length))},
        { label: 'Events', value: a && (formatNumber(a.group.events.length))},
        { label: 'First seen', value: a && (a.group.first ? formatDateTime(a.group.first) : '—')},
        { label: 'Last seen', value: a && (a.group.last ? formatDateTime(a.group.last) : '—')},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'sources', label: 'Sources' }, { id: 'networks', label: 'Networks' }, { id: 'events', label: 'Events' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const a = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'sources', label: 'Sources', count: a?.group.members.length },
    { id: 'networks', label: 'Networks', count: a?.group.networks.length },
    { id: 'events', label: 'Events', count: a?.group.events.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
