import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { SkeletonTable } from './SkeletonTable'
import { ActionLink } from '#/components/ActionLink'
import { useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Grid } from '@astryxdesign/core/Grid'
import { getRouteApi } from '@tanstack/react-router'
import { inRange } from '#/data/queries'
import type { HoneypotEvent, SessionSummary, SharedSignal, SourceGroup, SourceProfile, TimelineItem, TimelineKind } from '#/data/types'
import { rangeLabel } from '#/lib/range'
import { formatClock, formatDateTime, formatDay, formatNumber, now } from '#/lib/format'
import { isBackendGap } from '#/lib/backendGap'
import type { BackendGap } from '#/lib/backendGap'
import { MiniTable, Panel, StatTile } from './DashboardBlocks'
import { EventsPanel } from './DetailBlocks'
import { EntityLink } from './EntityLink'
import { PanelBackendGap } from './PanelBackendGap'
import { SeverityToken } from './SeverityToken'

const KIND_LABEL: Record<TimelineKind, string> = {
  event: 'Event',
  capture: 'Payload capture',
  anomaly: 'ML anomaly',
  llm: 'LLM analysis',
  canary: 'Canarytoken',
  auth: 'Auth failure',
  alert: 'Alert',
}

/** Everything that happened, newest first, grouped by hour; filter by kind.
 * Each item links to its own page. */
export function Timeline({ items: loaded, empty = 'Nothing happened in this time range.' }: { items: TimelineItem[] | BackendGap | undefined; empty?: string }) {
  const [kind, setKind] = useState<'all' | TimelineKind>('all')
  if (isBackendGap(loaded)) return <PanelBackendGap detail={loaded.gap} />
  // Still loading: a few hours of entries as skeletons.
  if (!loaded)
    return (
      <VStack gap={4} aria-busy>
        {[0, 1, 2].map((hour) => (
          <VStack key={hour} gap={2}>
            <Skeleton width={140} height={14} />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} width={`${80 - row * 12}%`} height={16} />
            ))}
          </VStack>
        ))}
      </VStack>
    )
  const items = loaded
  const kinds = [...new Set(items.map((i) => i.kind))]
  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind)
  const groups = new Map<string, TimelineItem[]>()
  for (const item of shown.slice(0, 300)) {
    const hour = `${formatDay(item.at)} ${formatClock(item.at).slice(0, 2)}:00`
    if (!groups.has(hour)) groups.set(hour, [])
    groups.get(hour)!.push(item)
  }

  if (items.length === 0) return <Text type="supporting">{empty}</Text>
  return (
    <VStack gap={4}>
      {kinds.length > 1 && (
        // Many kinds do not fit a phone: the control scrolls in its own row.
        <StackItem isScrollable>
          <SegmentedControl label="Timeline kinds" size="sm" value={kind} onChange={(value) => setKind(value as 'all' | TimelineKind)}>
            <SegmentedControlItem value="all" label={`All (${items.length})`} />
            {kinds.map((k) => (
              <SegmentedControlItem key={k} value={k} label={`${KIND_LABEL[k]} (${items.filter((i) => i.kind === k).length})`} />
            ))}
          </SegmentedControl>
        </StackItem>
      )}
      {[...groups].map(([hour, list]) => (
        <VStack key={hour} gap={1}>
          <Text type="label" color="secondary">
            {hour} UTC · {list.length}
          </Text>
          <List density="compact" hasDividers>
            {list.map((item) => (
              <ListItem
                key={`${item.kind}-${item.id}`}
                // Titles carry attacker strings (long paths without spaces): they break anywhere.
                label={
                  <Text color="inherit" maxLines={2} wordBreak="break-all">
                    {item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
                  </Text>
                }
                description={item.detail}
                startContent={<Text type="supporting">{formatClock(item.at)}</Text>}
                endContent={
                  <HStack gap={1}>
                    {kinds.length > 1 && <Token size="sm" label={KIND_LABEL[item.kind]} />}
                    {item.severity && <SeverityToken severity={item.severity} />}
                  </HStack>
                }
              />
            ))}
          </List>
        </VStack>
      ))}
      {shown.length > 300 && <Text type="supporting">Showing the newest 300 of {formatNumber(shown.length)}.</Text>}
    </VStack>
  )
}

const sessionColumns: TableColumn<SessionSummary>[] = [
  { key: 'id', header: 'Session', width: pixel(152), renderCell: (row) => <EntityLink kind="session" id={row.id} /> },
  { key: 'first', header: 'Started', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.first)}</Text> },
  { key: 'events', header: 'Events', width: pixel(72), align: 'end' },
  { key: 'logins', header: 'Logins', width: pixel(72), align: 'end' },
  { key: 'commands', header: 'Commands', width: pixel(88), align: 'end' },
  { key: 'downloads', header: 'Downloads', width: pixel(96), align: 'end' },
  { key: 'sensors', header: 'Sensors', width: proportional(2), renderCell: (row) => row.sensors.join(' ') },
  { key: 'recordingShasum', header: 'Recording', width: pixel(96), renderCell: (row) => (row.recordingShasum ? <EntityLink kind="recording" id={row.recordingShasum}>replay</EntityLink> : '—') },
]

export function SessionsTable({ sessions }: { sessions: SessionSummary[] | undefined }) {
  if (!sessions) return <SkeletonTable columns={sessionColumns} rows={8} density="compact" />
  return sessions.length ? (
    <Table data={sessions} columns={sessionColumns} idKey="id" density="compact" hasHover />
  ) : (
    <Text type="supporting">No sessions in this time range.</Text>
  )
}

/** A titled list of values that each open their own page. */
export function ValueList({ title, kind, values, empty = 'Nothing recorded.' }: { title: string; kind: Parameters<typeof EntityLink>[0]['kind']; values: string[] | undefined; empty?: string }) {
  if (!values)
    return (
      <Panel title={title}>
        <VStack gap={1.5}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="60%" height={14} />
          ))}
        </VStack>
      </Panel>
    )
  return (
    <Panel title={`${title} (${values.length})`}>
      {values.length ? (
        <VStack gap={1}>
          {values.map((v) => (
            <EntityLink key={v} kind={kind} id={v} />
          ))}
        </VStack>
      ) : (
        <Text type="supporting">{empty}</Text>
      )}
    </Panel>
  )
}

const layout = getRouteApi('/_layout')

/** The app-wide range, for pages that filter data they already loaded. */
export function useRange() {
  return layout.useSearch({ select: (search) => search.range })
}

export const eventTimeline = (events: HoneypotEvent[]): TimelineItem[] =>
  events.map((e) => ({
    id: e.id,
    at: e.timestamp,
    kind: 'event',
    title: e.summary ?? '—',
    detail: [e.srcIp, e.sensor, e.protocol && `${e.protocol.toUpperCase()} ${e.dstPort}`].filter(Boolean).join(' · '),
    severity: e.severity,
    href: `/events/${e.id}`,
  }))

/** A group's events inside the app-wide range, as a timeline. */
export function RangeTimeline({ events }: { events: HoneypotEvent[] | undefined }) {
  const range = useRange()
  if (!events) return <SkeletonBlock height={320} />
  return <Timeline items={eventTimeline(events.filter((e) => inRange(e.timestamp, range, now())))} />
}

/** A group's events inside the app-wide range, newest first. */
export function RangeEvents({ events, action }: { events: HoneypotEvent[] | undefined; action?: React.ReactNode }) {
  const range = useRange()
  if (!events) return <EventsPanel title={`Events · ${rangeLabel(range).toLowerCase()}`} events={undefined} showSource action={action} />
  const shown = events.filter((e) => inRange(e.timestamp, range, now()))
  return (
    <VStack gap={2}>
      <EventsPanel title={`Events · ${rangeLabel(range).toLowerCase()} (${formatNumber(shown.length)})`} events={shown.slice(0, 200)} showSource action={action} empty="No events in this time range." />
      {shown.length > 200 && <Text type="supporting">Showing the newest 200. Open the Event explorer for all of them.</Text>}
    </VStack>
  )
}

const sourceColumns: TableColumn<SourceProfile>[] = [
  { key: 'ip', header: 'Address', width: pixel(152), renderCell: (row) => <EntityLink kind="source" id={row.ip} /> },
  { key: 'country', header: 'Country', width: pixel(80) },
  { key: 'org', header: 'Provider', width: proportional(1) },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end' },
  { key: 'sessions', header: 'Sessions', width: pixel(88), align: 'end' },
  { key: 'sensors', header: 'Sensors', width: proportional(2), renderCell: (row) => row.sensors.join(' ') },
  { key: 'last', header: 'Last seen', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.last)}</Text> },
]

/** Source IPs, busiest first, each opening its own page. */
export function SourcesTable({ sources, empty = 'No source addresses.' }: { sources: SourceProfile[] | undefined; empty?: string }) {
  if (!sources) return <SkeletonTable columns={sourceColumns} rows={10} density="compact" />
  return sources.length ? <Table data={sources} columns={sourceColumns} idKey="ip" density="compact" hasHover /> : <Text type="supporting">{empty}</Text>
}

const SIGNAL_KIND = { credential: 'credential', fingerprint: 'fingerprint', payload: 'payload', network: 'network', asn: 'asn' } as const

const signalColumns: TableColumn<SharedSignal>[] = [
  { key: 'kind', header: 'Signal', width: pixel(112), renderCell: (row) => <Token size="sm" label={row.kind} /> },
  { key: 'value', header: 'Value', width: proportional(2), renderCell: (row) => <EntityLink kind={SIGNAL_KIND[row.kind]} id={row.value} /> },
  {
    key: 'members',
    header: 'Shared by',
    width: proportional(2),
    renderCell: (row) => (
      <HStack gap={2} wrap="wrap">
        {row.members.slice(0, 4).map((ip) => (
          <EntityLink key={ip} kind="source" id={ip} />
        ))}
        {row.members.length > 4 && <Text type="supporting">+{row.members.length - 4}</Text>}
      </HStack>
    ),
  },
]

/** Why these addresses are one group: the signals two or more share. */
export function SharedSignalsTable({ signals }: { signals: SharedSignal[] | undefined }) {
  if (!signals) return <SkeletonTable columns={signalColumns} rows={5} density="compact" />
  return signals.length ? (
    <Table data={signals} columns={signalColumns} idKey="id" density="compact" />
  ) : (
    <Text type="supporting">No signal is shared by two or more members.</Text>
  )
}

/** p0f's OS guesses over the portbridge tunnel, as a tile caption. */
export function osGuessCaption(guesses: string[]): string {
  return guesses.length ? `p0f: ${guesses.slice(0, 3).join(', ')}` : 'no p0f OS guess'
}

/** What a group page opens with: the headline numbers and its newest
 * events. The leaderboards live on the Breakdown tab. `sourcesTab` and
 * `eventsTab` name this entity's tabs for those lists, when it has them. */
export function GroupOverview({ group, base, sourcesTab, eventsTab }: { group: SourceGroup | undefined; base: string; sourcesTab?: string; eventsTab?: string }) {
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
        <StatTile label="Source IPs" value={group?.members.length} href={sourcesTab && `${base}/${sourcesTab}`} />
        <StatTile label="Events" value={group?.events.length} href={eventsTab && `${base}/${eventsTab}`} />
        <StatTile label="Total matches" value={group?.totalMatches} caption="honeypot, Suricata, portbridge" />
        <StatTile label="Tunnel connections" value={group?.tunnelConnections} caption={group ? osGuessCaption(group.tunnelOsGuesses) : ''} />
        <StatTile label="Sensors reached" value={group && (group.sensorsTotal ?? group.sensors.length)} href={`${base}/breakdown`} />
      </Grid>
      <EventsPanel title="Newest events" events={group?.events.slice(0, 5)} rows={5} showSource action={eventsTab && <ActionLink href={`${base}/${eventsTab}`}>All events</ActionLink>} empty="No events." />
    </VStack>
  )
}

/** Where the group's traffic went and what it tried, as leaderboards. */
export function GroupBreakdown({ group }: { group: SourceGroup | undefined }) {
  return (
    <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
      <MiniTable title="Sensors" header="Sensor" rows={group?.sensors} entity="sensor" />
      <MiniTable title="Targeted ports" header="Port" rows={group?.ports} entity="port" />
      <MiniTable title="Credentials tried" header="user:password" rows={group?.credentials.slice(0, 10)} entity="credential" />
      <MiniTable title="Commands" header="Command" rows={group?.commands.slice(0, 10)} entity="command" />
      <MiniTable title="Networks" header="Prefix" rows={group?.networks.slice(0, 10)} entity="network" />
      <MiniTable title="Countries" header="Country" rows={group?.countries} entity="country" />
    </Grid>
  )
}

/** A block of content still loading, at its real height. */
export function SkeletonBlock({ height }: { height: number }) {
  return <Skeleton height={height} />
}

/** A detail page's body still loading: `count` panels of skeleton lines. */
export function SkeletonPanels({ count = 2, lines = 5 }: { count?: number; lines?: number }) {
  return (
    <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
      {Array.from({ length: count }, (_panel, i) => (
        <Panel key={i} title={<Skeleton width={160} height={18} />}>
          <VStack gap={2} aria-busy>
            {Array.from({ length: lines }, (_, j) => (
              <Skeleton key={j} width={`${90 - j * 9}%`} height={14} />
            ))}
          </VStack>
        </Panel>
      ))}
    </Grid>
  )
}

/** Lines of text still loading. */
export function SkeletonLines({ count = 4 }: { count?: number }) {
  return (
    <VStack gap={2} aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={`${92 - (i % 4) * 11}%`} height={14} />
      ))}
    </VStack>
  )
}

/** A record as JSON, or a skeleton of its height while it loads. */
export function JsonBlock({ value, maxHeight = 640 }: { value: unknown; maxHeight?: number }) {
  if (value === undefined) return <Skeleton height={Math.min(maxHeight, 360)} />
  return <CodeBlock isWrapped code={JSON.stringify(value, null, 2)} language="json" maxHeight={maxHeight} />
}
