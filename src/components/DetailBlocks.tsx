import { CredentialStateToken } from '#/components/CredentialStateToken'
import { credentialStateOf } from '#/lib/credentialState'
import { SkeletonTable } from './SkeletonTable'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import type { HoneypotEvent, Technique } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { Panel } from './DashboardBlocks'
import { SeverityToken } from './SeverityToken'
import { EntityLink } from './EntityLink'
import { tableDensity, usePreferences } from '#/lib/prefs'

const eventColumns = (showSource: boolean): TableColumn<HoneypotEvent>[] => [
  { key: 'timestamp', header: 'Time', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.timestamp)}</Text> },
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (row) => <SeverityToken severity={row.severity} /> },
  { key: 'sensor', header: 'Sensor', width: pixel(144) },
  ...(showSource
    ? [{ key: 'srcIp', header: 'Source', width: pixel(136), renderCell: (row: HoneypotEvent) => <EntityLink kind="source" id={row.srcIp} /> }]
    : []),
  {
    key: 'summary',
    header: 'Detail',
    width: proportional(3),
    renderCell: (row) => (
      <VStack gap={0.5}>
        <EntityLink kind="event" id={row.id}><Text type="code">{row.summary ?? '—'}</Text></EntityLink>
        {credentialStateOf(row) && <CredentialStateToken event={row} />}
      </VStack>
    ),
  },
]

/** Events around a subject, each linking to its full event page. */
export function EventsPanel({ title, events, showSource = false, action, empty = 'No events.', rows = 10 }: {
  title: string
  /** Undefined while loading: the columns and `rows` skeleton rows. */
  events: HoneypotEvent[] | undefined
  showSource?: boolean
  action?: React.ReactNode
  empty?: string
  rows?: number
}) {
  const prefs = usePreferences()
  return (
    <Panel title={title} action={action}>
      {!events ? (
        <SkeletonTable columns={eventColumns(showSource)} rows={rows} density={tableDensity(prefs)} />
      ) : events.length ? (
        <Table data={events} columns={eventColumns(showSource)} idKey="id" density={tableDensity(prefs)} textOverflow={prefs?.wrapLongValues ? 'wrap' : 'truncate'} />
      ) : (
        <Text type="supporting">{empty}</Text>
      )}
    </Panel>
  )
}

export const attckUrl = (id: string) => `https://attack.mitre.org/techniques/${id.replaceAll('.', '/')}/`

const techniqueColumns: TableColumn<Technique>[] = [
  { key: 'tactic', header: 'Tactic', width: pixel(184) },
  {
    key: 'id',
    header: 'Technique',
    width: proportional(2),
    renderCell: (row) => (
      <HStack gap={2} vAlign="center">
        <Token size="sm" color="blue" label={row.id} href={attckUrl(row.id)} />
        <Text>{row.name}</Text>
      </HStack>
    ),
  },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
]

/** ATT&CK behavior mapping: context about what happened, never attribution. */
export function TechniquesPanel({ techniques }: { techniques: Technique[] | undefined }) {
  return (
    <Panel title="MITRE ATT&CK behavior mapping">
      {!techniques ? (
        <SkeletonTable columns={techniqueColumns} rows={4} density="compact" />
      ) : techniques.length ? (
        <Table data={techniques} columns={techniqueColumns} idKey="id" density="compact" />
      ) : (
        <Text type="supporting">No technique evidence in these events.</Text>
      )}
    </Panel>
  )
}
