import { pageSsr } from '#/lib/pageSsr'
import { JsonBlock } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { eventDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/events/$id')

export const Route = createFileRoute('/_layout/events/$id/raw')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  // The document as stored, not the page's summary of it: every field the
  // index holds, scrubbed only where the API scrubs (#3213).
  return (
    <Panel title="The complete record">
      <JsonBlock value={usePageQuery(eventDetailQuery(parent.useParams().id))?.record} maxHeight={960} />
    </Panel>
  )
}
