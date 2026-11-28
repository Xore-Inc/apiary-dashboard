import { pageSsr } from '#/lib/pageSsr'
import { JsonBlock } from '#/components/EntityBlocks'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { Text } from '@astryxdesign/core/Text'
import { formatNumber } from '#/lib/format'
import { usePageQuery } from '#/lib/query'
import { sessionDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sessions/$id')

export const Route = createFileRoute('/_layout/sessions/$id/raw')({
  ssr: pageSsr,
  component: TabView,
  pendingComponent: TabView,
})

function TabView() {
  const session = usePageQuery(sessionDetailQuery(parent.useParams().id))
  const shown = session?.records.length ?? 0
  // The session's search loads its first 1000 records; a longer session says so.
  const partial = !!session && session.total > shown
  return (
    <Panel title="Every record in this session">
      {partial && <Text type="supporting">{`Showing the first ${formatNumber(shown)} of ${formatNumber(session.total)} records. Open an event for its own record.`}</Text>}
      <JsonBlock value={session?.records} maxHeight={960} />
    </Panel>
  )
}
