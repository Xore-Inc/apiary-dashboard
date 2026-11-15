import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { AlertMembers } from '#/components/details/Alert'
import { usePageQuery } from '#/lib/query'
import { alertDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/alerts/$key')

export const Route = createFileRoute('/_layout/alerts/$key/members')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const rec = usePageQuery(alertDetailQuery(parent.useParams().key))?.group
  return rec ? <AlertMembers group={rec} /> : <SkeletonPanels />
}
