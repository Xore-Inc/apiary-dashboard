import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { EventsPanel } from '#/components/DetailBlocks'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceEventsQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/sources/$ip')

export const Route = createFileRoute('/_layout/sources/$ip/events')({
  ssr: pageSsr,
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ params, deps, context }) => ensure(context, sourceEventsQuery(params.ip, deps.range)),
  component: SourceEvents,
  pendingComponent: SourceEvents,
})

function SourceEvents() {
  const events = usePageQuery(sourceEventsQuery(Route.useParams().ip, Route.useLoaderDeps().range))
  const { ip } = parent.useParams()
  return <EventsPanel title={events ? `Events in range (${events.length})` : "Events in range"} events={events} action={<ActionLink href={`/events?ip=${ip}`}>Filter in Event explorer</ActionLink>} empty="No events from this address in the time range." />
}
