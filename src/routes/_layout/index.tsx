import { pageSsr } from '#/lib/pageSsr'
import { ActionLink } from '#/components/ActionLink'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { virusTotalLink } from '#/lib/toolLinks'
import { conformanceSeries } from '#/lib/conformance'
import { OpenInMenu } from '#/components/OpenInMenu'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { Histogram, ProtocolTimeline, RankBars, SensorHeatmap, SeriesLines } from '#/components/charts'
import { CountTable, MiniTable, NotAvailable, Panel, SkeletonTiles, StatTile } from '#/components/DashboardBlocks'
import { SkeletonBlock, SkeletonPanels } from '#/components/EntityBlocks'
import { SkeletonTable } from '#/components/SkeletonTable'
import { orPending } from '#/lib/pending'
import { FeedStateLabel } from '#/components/FeedState'
import { PageFrame } from '#/components/PageFrame'
import { SeverityToken } from '#/components/SeverityToken'
import { BugAntIcon, ChartBarIcon, CpuChipIcon, FingerPrintIcon, KeyIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { searchTabs, sectionOf } from '#/components/ViewTabs'
import { WorldMap } from '#/components/WorldMap'
import { getOverview, getOverviewViews } from '#/data/queries'
import type { AttackVectors, CapturedPayload, HoneypotEvent, NetworkCampaign, OverviewViews, SensorFeed, SeriesPoint, TimeBucket, Unavailable } from '#/data/types'
import { formatClock, formatDateTime, formatNumber, formatTime } from '#/lib/format'
import { EntityLink } from '#/components/EntityLink'
import { FilterSelect } from '#/components/FilterSelect'
import { useLiveRefresh } from '#/lib/live'
import { useShellConfig } from '#/lib/session'
import { ZoneHeader } from '#/components/ZoneHeader'
import { usePreferences } from '#/lib/prefs'

const THREAT_SECTIONS = [
  { id: 'who', label: 'Who', icon: UserGroupIcon },
  { id: 'traffic', label: 'Traffic', icon: ChartBarIcon },
  { id: 'exploits', label: 'Exploits', icon: BugAntIcon },
] as const

const BEHAVIOR_SECTIONS = [
  { id: 'input', label: 'Credentials & commands', icon: KeyIcon },
  { id: 'fingerprints', label: 'Fingerprints', icon: FingerPrintIcon },
  { id: 'decoys', label: 'Decoys & ICS', icon: CpuChipIcon },
] as const

// Views with sections show them as a menu under the view's top-bar entry.
const VIEWS = [
  { id: 'live', label: 'Live operations' },
  { id: 'health', label: 'Collection health' },
  { id: 'threats', label: 'Threat landscape', sections: THREAT_SECTIONS },
  { id: 'behavior', label: 'Attacker behavior', sections: BEHAVIOR_SECTIONS },
  { id: 'evidence', label: 'Evidence & campaigns' },
] as const
type View = (typeof VIEWS)[number]['id']


/** Each headline number opens the list behind it. */
const KPI_HREF: Record<string, string> = {
  events: '/events',
  sources: '/ips',
  sessions: '/recordings',
  logins: '/events?kind=login-success',
  payloads: '/payloads',
}
/** The tiles in order. A tile the live data lacks renders as not available. */
const KPI_ORDER = ['events', 'sources', 'sessions', 'logins', 'payloads'] as const
const KPI_LABEL: Record<(typeof KPI_ORDER)[number], string> = { events: 'Events', sources: 'Unique sources', sessions: 'Sessions', logins: 'Successful logins', payloads: 'Payloads captured' }
export const Route = createFileRoute('/_layout/')({
  ssr: pageSsr,
  staticData: { viewTabs: searchTabs({ label: 'Dashboard views', param: 'view', tabs: () => [...VIEWS] }) },
  validateSearch: (search: Record<string, unknown>): { view?: View; section?: string } => ({
    view: VIEWS.some((v) => v.id === search.view) && search.view !== 'live' ? (search.view as View) : undefined,
    section: typeof search.section === 'string' && search.section ? search.section : undefined,
  }),
  loader: async () => {
    const [overview, views] = await Promise.all([getOverview(), getOverviewViews()])
    return { overview, views }
  },
  component: OverviewPage,
  pendingComponent: OverviewPage,
})

const formatBytes = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`)
const ipLink = (ip: string) => `/sources/${ip}`

/** A chart's body when the backend answered, and the not-available note when
 * the data is `null`. */
function available<T>(data: T | null, draw: (data: T) => ReactNode): ReactNode {
  return data === null ? <NotAvailable /> : draw(data)
}

/** The series a chart draws: each key the points carry but `time`, in first-seen order. */
const seriesOf = (points: SeriesPoint[]) => [...new Set(points.flatMap((p) => Object.keys(p).filter((k) => k !== 'time')))].map((key) => ({ key, label: key }))

/** The 24 hours before an instant, as ISO: the window the live charts draw. */
const dayBefore = (iso: string) => new Date(Date.parse(iso) - 24 * 3_600_000).toISOString()

// ---- Live operations ---------------------------------------------------------

const eventColumns: TableColumn<HoneypotEvent>[] = [
  { key: 'timestamp', header: <ZoneHeader label="Time" />, width: pixel(128), renderCell: (row) => <Text type="supporting">{formatClock(row.timestamp)}</Text> },
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (row) => <SeverityToken severity={row.severity} /> },
  { key: 'sensor', header: 'Sensor', width: pixel(170) },
  { key: 'srcIp', header: 'Source', width: pixel(152), renderCell: (row) => <HStack gap={1.5} vAlign="center"><Link href={ipLink(row.srcIp)}>{row.srcIp}</Link><Text type="supporting">{row.country ?? '—'}</Text></HStack> },
  // The Event explorer's widths, so the same rows read the same.
  { key: 'dstPort', header: 'Port', width: pixel(120), renderCell: (row) => (row.protocol ? `${row.dstPort}/${row.protocol}` : `${row.dstPort}`) },
  { key: 'summary', header: 'Detail', width: proportional(3), renderCell: (row) => <EntityLink kind="event" id={row.id}><Text type="code">{row.summary ?? '—'}</Text></EntityLink> },
]

function AttackVectorsPanel({ views }: { views: OverviewViews }) {
  const bySensor: Partial<Record<string, AttackVectors>> = views.vectors ?? {}
  const sensors = Object.keys(bySensor).filter((s) => !s.startsWith('suricata'))
  const [sensor, setSensor] = useState(sensors[0])
  const vectors = bySensor[sensor]
  if (views.vectors === null) return <Panel title="Attack vectors"><NotAvailable /></Panel>
  return (
    <Panel
      title="Attack vectors"
      action={
        <FilterSelect
          label="Sensor drill-down"
          isLabelHidden
          size="sm"
          width={200}
          mode="single"
          options={sensors.map((s) => ({ value: s }))}
          value={[sensor]}
          onChange={([next]) => next && setSensor(next)}
        />
      }
    >
      {vectors && (
        <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
          {/* Each table its own container, or both bleed to the card's edges and overlap. */}
          <Card variant="transparent" padding={0}>
            <VStack gap={2}>
              <Text type="supporting">Targeted ports, {sensor}, last 24h</Text>
              <CountTable header="Port" label={`Targeted ports, ${sensor}`} rows={vectors.ports} linkTo={(port) => `/events?sensor=${sensor}&port=${port}`} />
            </VStack>
          </Card>
          <Card variant="transparent" padding={0}>
            <VStack gap={2}>
              <Text type="supporting">Protocols, {sensor}, last 24h</Text>
              <CountTable header="Protocol" label={`Protocols, ${sensor}`} rows={vectors.protocols} linkTo={(proto) => `/events?sensor=${sensor}&proto=${proto}`} />
            </VStack>
          </Card>
        </Grid>
      )}
    </Panel>
  )
}

function LiveView({ views, recent, timeline, start }: { views: OverviewViews; recent: Unavailable<HoneypotEvent[]>; timeline: Unavailable<TimeBucket[]>; start: string }) {
  return (
    <VStack gap={4}>
      <Panel title="Activity, last 24h" action={<ActionLink href="/events">Event explorer</ActionLink>}>
        {available(views.heatmap, (rows) => <SensorHeatmap rows={rows} startIso={start} />)}
      </Panel>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <Panel title="Events by protocol">{available(timeline, (buckets) => <ProtocolTimeline buckets={buckets} />)}</Panel>
        <AttackVectorsPanel views={views} />
      </Grid>
      <Panel title="Attack origins" action={<ActionLink href="/ips">Attack sources</ActionLink>}>
        {available(views.mapPoints, (points) => <WorldMap points={points} />)}
      </Panel>
      <Panel title="Recent events" action={<ActionLink href="/events">All events</ActionLink>}>
        {available(recent, (rows) => <Table data={rows} columns={eventColumns} idKey="id" density="compact" textOverflow="truncate" hasHover />)}
      </Panel>
    </VStack>
  )
}

/** The live view before its data: the same panels, charts as blocks of
 * their height, the recent events as skeleton rows. */
function LiveSkeleton() {
  return (
    <VStack gap={4}>
      <Panel title="Activity, last 24h" action={<ActionLink href="/events">Event explorer</ActionLink>}>
        <SkeletonBlock height={560} />
      </Panel>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <Panel title="Events by protocol">
          <SkeletonBlock height={260} />
        </Panel>
        <Panel title="Attack vectors">
          <SkeletonBlock height={260} />
        </Panel>
      </Grid>
      <Panel title="Attack origins" action={<ActionLink href="/ips">Attack sources</ActionLink>}>
        <SkeletonBlock height={420} />
      </Panel>
      <Panel title="Recent events" action={<ActionLink href="/events">All events</ActionLink>}>
        <SkeletonTable columns={eventColumns} rows={10} density="compact" />
      </Panel>
    </VStack>
  )
}

// ---- Collection health -------------------------------------------------------

const feedColumns: TableColumn<SensorFeed>[] = [
  { key: 'sensor', header: 'Sensor', width: proportional(2), renderCell: (row) => <EntityLink kind="sensor" id={row.sensor} /> },
  { key: 'state', header: 'State', width: pixel(120), renderCell: (row) => <FeedStateLabel state={row.state} /> },
  { key: 'documents', header: 'Documents', width: pixel(104), align: 'end', renderCell: (row) => formatNumber(row.documents) },
  { key: 'lastSeen', header: 'Last event', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.lastSeen)}</Text> },
]

function HealthView({ views }: { views: OverviewViews }) {
  const showMl = useShellConfig().behavior.showMlPanels
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <Panel title="Sensor feeds" action={<ActionLink href="/source-health">Source & pipeline health</ActionLink>}>
          {available(views.feeds, (rows) => <Table data={rows} columns={feedColumns} idKey="sensor" density="compact" />)}
        </Panel>
        <MiniTable title="Protocols probed" header="Protocol" rows={views.protocols} linkTo={(p) => `/events?proto=${p}`} />
      </Grid>
      {showMl && (
        <Panel title="ML classification backlog, last 7 days" action={<ActionLink href="/ml-anomalies">ML anomalies</ActionLink>}>
          {available(views.mlBacklog, (points) => <SeriesLines data={points} series={seriesOf(points)} dayTicks />)}
        </Panel>
      )}
    </VStack>
  )
}

// ---- Threat landscape --------------------------------------------------------

function ThreatsView({ views, section }: { views: OverviewViews; section?: string }) {
  const current = sectionOf(THREAT_SECTIONS, section)
  return (
    <VStack gap={4}>
      {current === 'who' && (
        <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
          <MiniTable title="Top source IPs" header="Source" rows={views.topIps} linkTo={ipLink} />
          <MiniTable title="Top targeted ports" header="Port" rows={views.topPorts} linkTo={(p) => `/events?port=${p}`} />
          <MiniTable title="Top countries" header="Country" rows={views.countries} linkTo={(c) => `/events?country=${c}`} />
          <MiniTable title="Top autonomous systems" header="ASN" rows={views.asns} />
          <MiniTable title="Network/provider classes" header="Class" rows={views.providers} />
        </Grid>
      )}
      {current === 'traffic' && (
        <VStack gap={4}>
          <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
            <Panel title="Traffic volume, bytes/hour, last 7 days">
              {available(views.netflowBytes, (points) => <SeriesLines data={points} series={[{ key: 'bytes', label: 'Bytes' }]} format={formatBytes} dayTicks />)}
            </Panel>
            <Panel title="Traffic volume, packets/hour, last 7 days">
              {available(views.netflowPackets, (points) => <SeriesLines data={points} series={[{ key: 'packets', label: 'Packets' }]} dayTicks />)}
            </Panel>
          </Grid>
          <Panel title="Protocol-conformance violations by protocol">
            {available(views.conformance, (points) => <SeriesLines data={points} series={conformanceSeries(points)} dayTicks />)}
          </Panel>
        </VStack>
      )}
      {current === 'exploits' && (
        <Panel title="Top exploited CVEs / named incidents, last 7 days" action={<ActionLink href="/iocs?kind=cve">All CVEs</ActionLink>}>
          {available(views.cves, (rows) => <RankBars rows={rows} />)}
        </Panel>
      )}
    </VStack>
  )
}

// ---- Attacker behavior -------------------------------------------------------

/** The deep-dive bar charts, all `Unavailable<CountRow[]>` on the views. */
type CountChart = 'osDistribution' | 'tcpClusters' | 'tls' | 'ssh' | 'ja4h' | 'ja4l' | 'ja4x' | 'decoyRequests' | 'decoyClients' | 'icsFunctions'

const FINGERPRINT_BARS: Array<[string, CountChart]> = [
  ['Attacker OS distribution', 'osDistribution'],
  ['Attacker TCP-stack clusters (JA4T)', 'tcpClusters'],
  ['TLS scanner fingerprints (JA4), wire-level, last 7 days', 'tls'],
  ['SSH client software, wire-level, last 7 days', 'ssh'],
  ['HTTP client fingerprints (JA4H), last 7 days', 'ja4h'],
  ['Connection-latency fingerprints (JA4L), last 7 days', 'ja4l'],
  ['Certificate construction fingerprints (JA4X), last 7 days', 'ja4x'],
]
const DECOY_BARS: Array<[string, CountChart]> = [
  ['Decoy requests (TLS-terminated), last 7 days', 'decoyRequests'],
  ['Who reached the decoys (JA4)', 'decoyClients'],
  ['ICS function codes: what they asked the PLCs to do', 'icsFunctions'],
]

function Bars({ views, bars }: { views: OverviewViews; bars: Array<[string, CountChart]> }) {
  return (
    <Grid columns={{ minWidth: 320, max: 2, repeat: 'fit' }} gap={4}>
      {bars.map(([title, key]) => (
        <Panel key={key} title={title}>
          {available(views[key], (rows) => <RankBars rows={rows} />)}
        </Panel>
      ))}
    </Grid>
  )
}

function BehaviorView({ views, section }: { views: OverviewViews; section?: string }) {
  const current = sectionOf(BEHAVIOR_SECTIONS, section)
  return (
    <VStack gap={4}>
      {current === 'input' && (
        <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
          <MiniTable title="Top credentials (user / pass)" header="Pair" rows={views.credentials} isCode />
          <MiniTable title="Top commands" header="Command" rows={views.commands} isCode />
          <MiniTable title="Top HTTP paths" header="Path" rows={views.paths} isCode />
          <MiniTable title="SSH/telnet clients" header="Banner" rows={views.clients} isCode />
        </Grid>
      )}
      {current === 'fingerprints' && (
        <VStack gap={4}>
          <MiniTable title="Top fingerprints (HASSH / JA3 / JA4 / User-Agent)" header="Fingerprint" rows={views.fingerprints} isCode />
          <Bars views={views} bars={FINGERPRINT_BARS} />
        </VStack>
      )}
      {current === 'decoys' && (
        <VStack gap={4}>
          <Bars views={views} bars={DECOY_BARS} />
          <Panel title="Attacker time wasted (endlessh tarpit)">
            <Text type="supporting">How long each tarpitted connection stayed before giving up.</Text>
            {available(views.endlessh, (rows) => <Histogram rows={rows} />)}
          </Panel>
        </VStack>
      )}
    </VStack>
  )
}

// ---- Evidence & campaigns ----------------------------------------------------

const payloadColumns: TableColumn<CapturedPayload>[] = [
  { key: 'hash', header: 'SHA-256', width: proportional(2), renderCell: (row) => <EntityLink kind="payload" id={row.hash}><Text type="code">{`${row.hash.slice(0, 20)}…`}</Text></EntityLink> },
  { key: 'kind', header: 'Kind', width: pixel(112) },
  { key: 'sources', header: 'Source', width: pixel(120), renderCell: (row) => row.sources.join(' ') },
  { key: 'copies', header: 'Copies', width: pixel(72), align: 'end' },
  { key: 'verdict', header: 'Verdict', width: pixel(112), renderCell: (row) => (row.verdict ? <Token size="sm" label={row.verdict.family ?? row.verdict.label} color={row.verdict.label === 'malicious' ? 'red' : row.verdict.label === 'suspicious' ? 'orange' : 'green'} /> : '—') },
  { key: 'lookup', header: '', width: pixel(96), align: 'end', renderCell: (row) => <OpenInMenu compact links={[virusTotalLink(row.hash)]} /> },
]

const campaignColumns: TableColumn<NetworkCampaign>[] = [
  { key: 'score', header: 'Score', width: pixel(64), align: 'end' },
  { key: 'cidr', header: 'Network', width: proportional(2), renderCell: (row) => <EntityLink kind="campaign" id={row.cidr} /> },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
  { key: 'uniqueIps', header: 'IPs', width: pixel(56), align: 'end' },
  { key: 'sensors', header: 'Sensors', width: proportional(2), renderCell: (row) => row.sensors.join(' ') },
]

function EvidenceView({ views }: { views: OverviewViews }) {
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <MiniTable title="Suricata alerts" header="Signature" rows={views.alerts} linkTo={(sig) => `/history?q=${encodeURIComponent(sig)}`} />
        <MiniTable title="Alert categories" header="Category" rows={views.alertCategories} />
      </Grid>
      <Panel title="Captured payloads" action={<ActionLink href="/payloads">All payloads</ActionLink>}>
        {available(views.payloads, (rows) => <Table data={rows} columns={payloadColumns} idKey="hash" density="compact" />)}
      </Panel>
      <Panel title="Correlated campaigns, rolling 7 days" action={<ActionLink href="/campaigns">All campaigns</ActionLink>}>
        {available(views.campaigns, (rows) => <Table data={rows} columns={campaignColumns} idKey="cidr" density="compact" />)}
      </Panel>
    </VStack>
  )
}

// ---- Page --------------------------------------------------------------------

function OverviewPage() {
  const { overview, views } = orPending(Route.useLoaderData()) ?? {}
  const { view = 'live', section } = Route.useSearch()
  // The numbers follow the live stream, at most every refresh interval.
  useLiveRefresh((usePreferences()?.refreshSeconds ?? 10) * 1000)
  return (
    <PageFrame title="Overview" description={overview ? `Last 24 hours · generated ${formatDateTime(overview.generatedAt)}` : 'Last 24 hours'}>
      <VStack gap={5}>
        {/* The headline numbers belong to the at-a-glance view; the other
            views are deep dives and start with their own content. */}
        {view === 'live' && (
          // Two to a row on a phone, so the numbers do not fill its first screen.
          <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={4}>
            {overview ? (
              KPI_ORDER.map((id) => {
                const kpi = overview.kpis.find((k) => k.id === id)
                return kpi ? <StatTile key={id} {...kpi} href={KPI_HREF[id]} caption={kpi.caption ?? 'Last 24h vs. previous 24h'} /> : <StatTile key={id} label={KPI_LABEL[id]} value={null} href={KPI_HREF[id]} />
              })
            ) : (
              <SkeletonTiles count={5} />
            )}
          </Grid>
        )}
        {!overview || !views ? (
          view === 'live' ? <LiveSkeleton /> : <SkeletonPanels count={4} lines={6} />
        ) : (
          <>
            {view === 'live' && <LiveView views={views} recent={overview.recentEvents} timeline={overview.timeline} start={dayBefore(overview.generatedAt)} />}
            {view === 'health' && <HealthView views={views} />}
            {view === 'threats' && <ThreatsView views={views} section={section} />}
            {view === 'behavior' && <BehaviorView views={views} section={section} />}
            {view === 'evidence' && <EvidenceView views={views} />}
          </>
        )}
      </VStack>
    </PageFrame>
  )
}
