import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Token } from '@astryxdesign/core/Token'
import { RecordingDownloads } from '#/components/RecordingDownloads'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { NotFound } from '#/components/NotFound'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { SeverityToken } from '#/components/SeverityToken'
import { formatDateTime } from '#/lib/format'
import { EntityLink } from '#/components/EntityLink'
import { OpenInMenu } from '#/components/OpenInMenu'
import { useShellConfig } from '#/lib/session'
import { eventToolLinks, virusTotalLink } from '#/lib/toolLinks'
import { ensure, usePageQuery } from '#/lib/query'
import { eventDetailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/events/$id')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Event views', basePath: (params) => `/events/${encodeURIComponent(params.id)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const detail = await ensure(context, eventDetailQuery(params.id))
    if (!detail) throw notFound()
    return detail
  },
  notFoundComponent: () => <NotFound title="Event" description="No event has this id. It may have aged out of the index." />,
  component: EventLayout,
  pendingComponent: EventLayout,
})

function EventLayout() {
  const loaded = usePageQuery(eventDetailQuery(Route.useParams().id))
  const { id } = Route.useParams()
  const event = loaded?.event
  const links = useShellConfig().links

  return (
    <EntityFrame
      kind="Event"
      title={<Pending width={360}>{event && (event.summary ?? '—')}</Pending>}
      basePath={`/events/${encodeURIComponent(id)}`}
      actions={
        loaded && (
          <>
            {loaded.recordingShasum && <RecordingDownloads shasum={loaded.recordingShasum} />}
            <OpenInMenu links={[...eventToolLinks(loaded.event, links), ...loaded.hashes.slice(0, 1).map((h) => virusTotalLink(h))]} />
          </>
        )
      }
      tokens={
        event && (
          <>
            {event.severity && <SeverityToken severity={event.severity} />}
            <Token size="sm" label={event.type} />
          </>
        )
      }
      facts={[
        { label: 'Time', value: event && formatDateTime(event.timestamp) },
        { label: 'Sensor', value: event && <EntityLink kind="sensor" id={event.sensor} /> },
        { label: 'Service', value: event && (event.protocol ? `${event.protocol.toUpperCase()} ${event.dstPort}` : `port ${event.dstPort}`) },
        { label: 'Source', value: event && <EntityLink kind="source" id={event.srcIp} /> },
        { label: 'Session', value: event && (event.sessionId ? <EntityLink kind="session" id={event.sessionId} /> : '—') },
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'session', label: 'Session' }, { id: 'connection', label: 'Connection' }, { id: 'source', label: 'Source' }, { id: 'iocs', label: 'Indicators' }, { id: 'raw', label: 'Raw' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { event, session, connection, source, hashes } = data
  const iocs = hashes?.length + [event?.username, event?.password, event?.command].filter(Boolean).length + 3
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'session', label: 'Session', count: session.length },
    { id: 'connection', label: 'Connection', count: connection.length },
    { id: 'source', label: 'Source', count: source.length },
    { id: 'iocs', label: 'Indicators', count: iocs },
    { id: 'raw', label: 'Raw' },
  ]
}
