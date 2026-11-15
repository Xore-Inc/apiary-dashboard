import { pageSsr } from '#/lib/pageSsr'
import { JsonBlock } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { sessionDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sessions/$id')

export const Route = createFileRoute('/_layout/sessions/$id/raw')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  return (
    <Panel title="Every record in this session">
      <JsonBlock value={usePageQuery(sessionDetailQuery(parent.useParams().id))?.events} />
    </Panel>
  )
}
