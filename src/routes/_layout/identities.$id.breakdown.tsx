import { pageSsr } from '#/lib/pageSsr'
import { GroupBreakdown, SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { usePageQuery } from '#/lib/query'
import { identityQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/identities/$id')

export const Route = createFileRoute('/_layout/identities/$id/breakdown')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(identityQuery(parent.useParams().id))?.group
  return rec ? <GroupBreakdown group={rec} /> : <SkeletonPanels />
}
