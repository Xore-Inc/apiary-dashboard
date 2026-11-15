import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { sessionDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sessions/$id')

export const Route = createFileRoute('/_layout/sessions/$id/commands')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return <MiniTable title="Commands run" header="Command" rows={usePageQuery(sessionDetailQuery(parent.useParams().id))?.commands} entity="command" />
}
