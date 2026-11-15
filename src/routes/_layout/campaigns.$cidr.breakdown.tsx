import { pageSsr } from '#/lib/pageSsr'
import { GroupBreakdown, SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { campaignQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/campaigns/$cidr')

export const Route = createFileRoute('/_layout/campaigns/$cidr/breakdown')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(campaignQuery(parent.useParams().cidr))?.group
  return rec ? <GroupBreakdown group={rec} /> : <SkeletonPanels />
}
