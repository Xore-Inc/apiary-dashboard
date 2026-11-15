import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { EventsPanel } from '#/components/DetailBlocks'
import { usePageQuery } from '#/lib/query'
import { eventDetailQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/events/$id')

export const Route = createFileRoute('/_layout/events/$id/connection')({ ssr: pageSsr, component: Tab, pendingComponent: Tab })

function Tab() {
  const d = usePageQuery(eventDetailQuery(parent.useParams().id))
  return <EventsPanel title="The rest of this connection" events={d?.connection} empty="No other event on this connection." />
}
