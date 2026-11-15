import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { MiniTable } from '#/components/DashboardBlocks'
import { usePageQuery } from '#/lib/query'
import { replayDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/recordings/$shasum')

export const Route = createFileRoute('/_layout/recordings/$shasum/sessions')({
  ssr: pageSsr,
  component: SessionsTab,
  pendingComponent: SessionsTab,
})

function SessionsTab() {
  const sessions = usePageQuery(replayDetailQuery(parent.useParams().shasum))?.sessions
  return (
    <MiniTable
      title="Sessions that produced this recording"
      header="Session"
      countHeader="Seconds"
      rows={sessions?.map((r) => ({ id: r.session, label: r.session, count: Math.round(r.durationMs / 1000) }))}
      entity="session"
    />
  )
}
