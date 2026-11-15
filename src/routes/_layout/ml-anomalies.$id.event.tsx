import { pageSsr } from '#/lib/pageSsr'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import { formatDateTime } from '#/lib/format'
import { usePageQuery } from '#/lib/query'
import { anomalyQuery } from '#/data/resources'

const parent = getRouteApi('/_layout/ml-anomalies/$id')

export const Route = createFileRoute('/_layout/ml-anomalies/$id/event')({
  ssr: pageSsr,
  component: AnomalyEvent,
  pendingComponent: AnomalyEvent,
})

/** The raw event the models scored. */
function AnomalyEvent() {
  const loaded = usePageQuery(anomalyQuery(parent.useParams().id))
  const a = loaded?.anomaly
  const event = loaded?.event
  if (!event)
    return (
      <Text type="supporting">The source event has aged out of the index.</Text>
    )
  return (
    <Panel
      title="The scored event"
      action={
        <EntityLink kind="event" id={event.id}>
          Open event
        </EntityLink>
      }
    >
      <Text type="code">{event.summary ?? '—'}</Text>
      <MetadataList label={{ position: 'start', width: 112 }}>
        <MetadataListItem label="Time">
          {formatDateTime(event.timestamp)}
        </MetadataListItem>
        <MetadataListItem label="Type">{event.type}</MetadataListItem>
        <MetadataListItem label="Session">
          {event.sessionId ? <EntityLink kind="session" id={event.sessionId} /> : <Text type="supporting">—</Text>}
        </MetadataListItem>
        <MetadataListItem label="Index">
          <Text type="code">{a?.sourceIndex}</Text>
        </MetadataListItem>
      </MetadataList>
    </Panel>
  )
}
