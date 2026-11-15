import { pageSsr } from '#/lib/pageSsr'
import { GroupBreakdown, SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { clusterQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/clusters/$kind/$value')

export const Route = createFileRoute('/_layout/clusters/$kind/$value/breakdown')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(clusterQuery(parent.useParams().kind, parent.useParams().value))?.group
  return rec ? <GroupBreakdown group={rec} /> : <SkeletonPanels />
}
