import { pageSsr } from '#/lib/pageSsr'
import { GroupBreakdown, SkeletonPanels } from '#/components/EntityBlocks'
import { usePageQuery } from '#/lib/query'
import { asnQuery } from '#/data/resources'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'

const parent = getRouteApi('/_layout/asn/$asn')

export const Route = createFileRoute('/_layout/asn/$asn/breakdown')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(asnQuery(parent.useParams().asn))?.group
  return rec ? <GroupBreakdown group={rec} /> : <SkeletonPanels />
}
