import { pageSsr } from '#/lib/pageSsr'
import { SkeletonTable } from '#/components/SkeletonTable'
import { ActionLink } from '#/components/ActionLink'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { CapturedMailInline } from '#/components/CapturedMail'
import { Panel } from '#/components/DashboardBlocks'
import { EntityLink } from '#/components/EntityLink'
import type { HoneypotEvent, SensorReading } from '#/data/types'
import { formatClock } from '#/lib/format'
import { fieldText, readField } from '#/lib/sensorFields'
import { ZoneHeader } from '#/components/ZoneHeader'
import { useSensorPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/sensors/$sensor')

export const Route = createFileRoute('/_layout/sensors/$sensor/events')({ ssr: pageSsr, component: SensorEvents, pendingComponent: SensorEvents })

const BADGE_COLOR = { danger: 'red', warning: 'orange', success: 'green', muted: 'gray', info: 'blue' } as const

/** Time, source and port for every sensor; then the sensor's own columns,
 * read from its own fields; then the artefact it exists to capture. */
function columnsFor(reading: SensorReading): TableColumn<HoneypotEvent>[] {
  const own: TableColumn<HoneypotEvent>[] = reading.columns.map((column, index) => ({
    key: `field-${index}`,
    header: column.header,
    width: column.mono ? proportional(2) : proportional(1),
    renderCell: (row) => {
      const text = fieldText(readField(row.fields, column.field))
      if (!text) return <Text type="supporting">—</Text>
      if (column.badge) return <Token size="sm" color={BADGE_COLOR[column.badge]} label={text} />
      return <Text type={column.mono ? 'code' : 'supporting'}>{text}</Text>
    },
  }))
  const artefact = reading.artefacts.at(0)
  return [
    { key: 'timestamp', header: <ZoneHeader label="Time" />, width: pixel(128), renderCell: (row) => <EntityLink kind="event" id={row.id}>{formatClock(row.timestamp)}</EntityLink> },
    { key: 'srcIp', header: 'Source', width: pixel(140), renderCell: (row) => <EntityLink kind="source" id={row.srcIp} /> },
    { key: 'dstPort', header: 'Port', width: pixel(72), renderCell: (row) => <Text type="code">{row.dstPort}</Text> },
    ...own,
    ...(artefact
      ? [
          {
            key: 'artefact',
            header: artefact.label,
            width: proportional(2),
            renderCell: (row: HoneypotEvent) => {
              const text = fieldText(readField(row.fields, artefact.field))
              return text ? <Text type="code">{text}</Text> : <Text type="supporting">—</Text>
            },
          },
        ]
      : []),
  ]
}

/** Every sensor, read in its own terms. */
function SensorEvents() {
  const loaded = useSensorPage(parent.useParams().sensor)
  // The sensor's id is in the address: the panel and its link need no data.
  const { sensor: id } = parent.useParams()
  const detail = loaded?.detail
  return (
    <VStack gap={4}>
      <Panel title="What it captured" action={<ActionLink href={`/events?sensor=${encodeURIComponent(id)}`}>All events</ActionLink>}>
        {detail ? (
          <>
            <Text type="supporting">{detail.reading.what}. The newest events, with this sensor's own fields; open a row for the full record.</Text>
            <Table data={detail.recentEvents} columns={columnsFor(detail.reading)} idKey="id" density="compact" textOverflow="truncate" />
          </>
        ) : (
          // The columns are this sensor's own, known with its data.
          <SkeletonTable columns={[{ key: 'time', header: 'Time' }, { key: 'a', header: '' }, { key: 'b', header: '' }, { key: 'c', header: '' }]} rows={10} density="compact" />
        )}
      </Panel>
      {id === 'mailoney' && detail && <MailSessions events={detail.recentEvents} />}
    </VStack>
  )
}

/** A mail sensor's point: the messages, one session each, opened on demand. */
function MailSessions({ events }: { events: HoneypotEvent[] }) {
  // A row with no session has no message to open, so it is not listed; keying
  // on an absent id would fold every such row into one.
  const withSession = events.filter((e): e is HoneypotEvent & { sessionId: string } => Boolean(e.sessionId))
  const sessions = [...new Map(withSession.map((e) => [e.sessionId, e])).values()]
  return (
    <Panel title="Messages">
      <Text type="supporting">One per session. A session that stopped after the envelope has no body to show.</Text>
      <VStack gap={4}>
        {sessions.map((e, i) => (
          <VStack key={e.sessionId} gap={2}>
            {i > 0 && <Divider />}
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="supporting">{formatClock(e.timestamp)}</Text>
              <EntityLink kind="source" id={e.srcIp} />
              <Text type="code">{`${String(e.fields.mail_from ?? '?')} → ${String(e.fields.rcpt_to ?? '?')}`}</Text>
              <StackItem size="fill" />
              <EntityLink kind="session" id={e.sessionId}>Session</EntityLink>
            </HStack>
            <CapturedMailInline sessionId={e.sessionId} />
          </VStack>
        ))}
      </VStack>
    </Panel>
  )
}
