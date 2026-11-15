import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { EntityLink } from '#/components/EntityLink'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { networkQuery } from '#/data/resources'

// {cidr} carries a literal "/", so every link percent-encodes it.
export const Route = createFileRoute('/_layout/networks/$cidr')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Network views', basePath: (params) => `/networks/${encodeURIComponent(params.cidr)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const network = await ensure(context, networkQuery(params.cidr))
    if (!network) throw notFound()
    return network
  },
  notFoundComponent: () => <NotFound title="Network" description="Invalid prefix, or no source in it was seen." />,
  component: NetworkLayout,
  pendingComponent: NetworkLayout,
})

function NetworkLayout() {
  const n = usePageQuery(networkQuery(Route.useParams().cidr))
  const { cidr } = Route.useParams()
  return (
    <EntityFrame
      kind="Network"
      title={<Pending width={320}>{n && n.cidr}</Pending>}
      basePath={`/networks/${encodeURIComponent(cidr)}`}
      tokens={n && (<>
          {n.country && (
            <EntityLink kind="country" id={n.country}>
              <Token size="sm" color="blue" label={n.country} />
            </EntityLink>
          )}
          {n.campaign && <Token size="sm" color="orange" label={`campaign · score ${n.campaign.score}`} />}
        </>)}
      facts={[
        // Linked only when the backend names the AS number; otherwise the org alone, unlinked.
        { label: 'Autonomous system', value: n && (n.asn ? <EntityLink kind="asn" id={n.asn}>{[n.asn, n.org].filter(Boolean).join(' · ')}</EntityLink> : (n.org || '—'))},
        { label: 'Source IPs', value: n && (formatNumber(n.group.members.length))},
        { label: 'Events', value: n && (formatNumber(n.group.events.length))},
        { label: 'First seen', value: n && (n.group.first ? formatDateTime(n.group.first) : '—')},
        { label: 'Last seen', value: n && (n.group.last ? formatDateTime(n.group.last) : '—')},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'sources', label: 'Sources' }, { id: 'events', label: 'Events' }, { id: 'campaign', label: 'Campaign' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const n = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'sources', label: 'Sources', count: n?.group.members.length },
    { id: 'events', label: 'Events', count: n?.group.events.length },
    { id: 'campaign', label: 'Campaign' },
    { id: 'timeline', label: 'Timeline' },
  ]
}
