import { pageSsr } from '#/lib/pageSsr'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { EntityLink } from '#/components/EntityLink'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { campaignQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/campaigns/$cidr')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Campaign views', basePath: (params) => `/campaigns/${encodeURIComponent(params.cidr)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const campaign = await ensure(context, campaignQuery(params.cidr))
    if (!campaign) throw notFound()
    return campaign
  },
  notFoundComponent: () => <NotFound title="Campaign" description="No campaign was detected for this prefix." />,
  component: CampaignLayout,
  pendingComponent: CampaignLayout,
})

function CampaignLayout() {
  const loaded = usePageQuery(campaignQuery(Route.useParams().cidr))
  const { cidr } = Route.useParams()
  const c = loaded?.campaign
  return (
    <EntityFrame
      kind="Campaign"
      title={cidr}
      description={c?.explanation}
      basePath={`/campaigns/${encodeURIComponent(cidr)}`}
      tokens={c && (<>
          <Token size="sm" color="orange" label={`score ${c.score}`} />
          {c.scan && <Token size="sm" color="purple" label={`${c.scan} scan`} />}
        </>)}
      facts={[
        { label: 'Network', value: c && (<EntityLink kind="network" id={c.cidr} />)},
        { label: 'Source IPs', value: c && (formatNumber(c.uniqueIps))},
        { label: 'Events', value: c && (formatNumber(c.events))},
        { label: 'First seen', value: c && (formatDateTime(c.first))},
        { label: 'Last seen', value: c && (formatDateTime(c.last))},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'why', label: 'Why correlated' }, { id: 'sources', label: 'Sources' }, { id: 'credentials', label: 'Credentials reused' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { group, shared } = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'why', label: 'Why correlated', count: shared.length },
    { id: 'sources', label: 'Sources', count: group.members.length },
    { id: 'credentials', label: 'Credentials reused', count: group.credentials.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
