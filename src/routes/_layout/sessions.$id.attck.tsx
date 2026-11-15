import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { TechniquesPanel } from '#/components/DetailBlocks'
import { usePageQuery } from '#/lib/query'
import { sessionDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sessions/$id')

export const Route = createFileRoute('/_layout/sessions/$id/attck')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(sessionDetailQuery(parent.useParams().id))?.techniques
  return rec ? <TechniquesPanel techniques={rec} /> : <SkeletonPanels />
}
