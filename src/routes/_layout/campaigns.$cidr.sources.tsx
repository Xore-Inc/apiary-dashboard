import { pageSsr } from '#/lib/pageSsr'
import { Panel } from '#/components/DashboardBlocks'
import { SourcesTable } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { campaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/campaigns/$cidr')

export const Route = createFileRoute('/_layout/campaigns/$cidr/sources')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const d = usePageQuery(campaignQuery(parent.useParams().cidr))
    return (
      <Panel title="Addresses in this campaign">
        <SourcesTable sources={d?.group.members} />
      </Panel>
    )
  }
