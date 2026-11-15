import { pageSsr } from '#/lib/pageSsr'
import { Panel } from '#/components/DashboardBlocks'
import { SharedSignalsTable } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { campaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/campaigns/$cidr')

export const Route = createFileRoute('/_layout/campaigns/$cidr/why')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const d = usePageQuery(campaignQuery(parent.useParams().cidr))
    return (
      <Panel title="Signals two or more addresses share">
        <SharedSignalsTable signals={d?.shared} />
      </Panel>
    )
  }
