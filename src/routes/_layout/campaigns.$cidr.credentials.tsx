import { pageSsr } from '#/lib/pageSsr'
import { MiniTable } from '#/components/DashboardBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { campaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/campaigns/$cidr')

export const Route = createFileRoute('/_layout/campaigns/$cidr/credentials')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
    const d = usePageQuery(campaignQuery(parent.useParams().cidr))
    return <MiniTable title="Credentials tried" header="user:password" rows={d?.group.credentials} entity="credential" />
  }
