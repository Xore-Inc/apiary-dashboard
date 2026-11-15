import { pageSsr } from '#/lib/pageSsr'
import { GroupBreakdown, SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { networkQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/networks/$cidr')

export const Route = createFileRoute('/_layout/networks/$cidr/breakdown')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(networkQuery(parent.useParams().cidr))?.group
  return rec ? <GroupBreakdown group={rec} /> : <SkeletonPanels />
}
