// The mock backend: every query the pages make, answered from the mock
// fixtures. Server-only. Pages reach it through the server functions in
// ./queries.ts (generated from this file's exports by
// scripts/gen-queries.ts), run in the page's scenario by ./backend.ts.
// Wiring the real backend replaces what answers behind those functions;
// the signatures here are the contract.
import { ApiError } from './errors'
import { ghidraArtifacts, sandboxArtifacts, sizeOf } from './mock/artifacts'
import type { ArtifactFile } from './mock/artifacts'
import { EVENTS, MOCK_USER, PASSWORDS, SENSORS, SOURCES, USERNAMES, credentialOf } from './mock/fixtures'
import {
  ATTACKERS,
  COUNTRY_CENTROIDS,
  CRED_REUSE,
  INFRA_CLUSTERS,
  KILL_CHAIN,
  NETWORK_CAMPAIGNS,
  RECORDINGS,
  REPLAYS,
  SOURCE_PROFILES,
} from './mock/investigate'
import {
  CAPE_RUNS,
  GITHUB_ANALYSES,
  REVDECK_RUNS,
  buildGhidraAnalysis,
  buildPayloadAnalysis,
  buildSandboxRun,
  findPayload,
} from './mock/evidence'
import {
  AUDIT_LOG,
  OPERATORS,
  BLOCKED_IPS,
  CONFIG_HISTORY,
  DEAD_LETTERS,
  PREFERENCES,
  PROBLEM_REPORTS,
  SERVICES,
  CONFIG,
  DEPLOYMENT_LINKS,
  ES_STORAGE,
  REPORTER_STATS,
  techniquesFor,
} from './mock/details'
import {
  ALERTS,
  ANALYSIS_RESULTS,
  ANALYZERS,
  WORKBENCH_RECIPES,
  WORKBENCH_RUNS,
  classificationOf,
  inapplicableReason,
  runStateOf,
  BAIT_CREDENTIALS,
  CANARY_TOKENS,
  CANARY_TRIGGERS,
  CANARY_TYPES,
  GENERATED_REPORTS,
  GPU_QUEUE,
  PAYLOADS,
  REPORT_DEFINITIONS,
  REPORT_ELEMENTS,
  REPORT_TEMPLATES,
  SOURCE_HEALTH,
  TOPOLOGY,
  DOWNLOAD_HASH,
} from './mock/operations'
import { AGENT_CAMPAIGNS, AUTH_FAILURES, LLM_ANALYSES, ML_ANOMALIES, MODEL_HEALTH, SCORE_TIMELINE } from './mock/monitor'
import { OVERVIEW_VIEWS } from './mock/overview'
import { readingOf, sensorReading } from './mock/sensors'
import { MOCK_NOW, createRng } from './mock/random'
import { generatePassword, inRange, nextScheduledRun, redact } from './shared'
import { clusterHref } from '#/lib/entities'
import type {
  AgentCampaign,
  CapeRun,
  GhidraAnalysis,
  PageRequest,
  Paged,
  GithubAnalysis,
  PayloadAnalysis,
  RevDeckRun,
  SandboxRun,
  DeadLetter,
  EventDetail,
  IpProfile,
  Preferences,
  ProblemReport,
  ProblemStatus,
  ReplayDetail,
  SearchGroup,
  SessionDetail,
  SettingsData,
  AlertGroup,
  AlertRecord,
  AnalysisResult,
  AnalysisResultsData,
  AnalysisRunConfig,
  AnalyzerCatalog,
  AnalyzerId,
  WorkbenchRun,
  WorkbenchRunChild,
  BaitCredential,
  CanaryToken,
  CanaryTokenType,
  CanaryTrigger,
  CapturedPayload,
  GeneratedReport,
  ReportDefinition,
  FacetValue,
  Facets,
  ReportPreview,
  ReportsData,
  SourceHealth,
  Topology,
  AttackerEntity,
  ClusterKind,
  CredEdge,
  EventFilters,
  EventKind,
  EventType,
  EventsPage,
  InfraCluster,
  KillChainData,
  MapPoint,
  NetworkCampaign,
  Recording,
  Replay,
  SensorDetail,
  SensorSummary,
  SourceProfile,
  AuthEventsData,
  CountRow,
  Disposition,
  LlmAnalysis,
  MlAnomaliesData,
  SemanticSearchResult,
  HoneypotEvent,
  Kpi,
  OverviewData,
  OverviewViews,
  SessionSummary,
  SourceNetwork,
  TimelineItem,
  SessionUser,
  TimeBucket,
  AsnEntity,
  CampaignEntity,
  ClusterEntity,
  IdentityEntity,
  IdentityFusion,
  NetworkEntity,
  SharedSignal,
  SourceGroup,
  MlAnomaly,
  IocEntity,
  IocHubKind,
  IocRow,
  TimelineEntity,
  RelatedGroup,
  CapturedMail,
  ConfigProblems,
  ShellConfig,
  ConfigSection,
  DashboardConfig,
} from './types'
import { validateSection } from './mock/config'
import { resolveAll, simulate, withIncidents } from './mock/incidents'
import type { Incident } from './incidents'
import { mailFor } from './mock/mail'

const HOUR = 3_600_000

/** Simulated backend behavior: VITE_MOCK_LATENCY_MS=800 exercises pending
 * states, VITE_MOCK_FAIL=1 makes every call fail to exercise error states. */
async function mockDelay({ canFail = true } = {}): Promise<void> {
  const ms = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 0)
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
  if (canFail && import.meta.env.VITE_MOCK_FAIL === '1') throw new Error('Mock backend unavailable (VITE_MOCK_FAIL=1)')
}

/** The hourly bucket of the last 24 h a timestamp falls in. Live events
 * arrive after the mock clock; they belong to the current hour. */
function hourIndex(timestamp: string): number {
  return Math.min(23, 23 - Math.floor((MOCK_NOW - Date.parse(timestamp)) / HOUR))
}

function hourly(events: HoneypotEvent[]): number[] {
  const counts = new Array<number>(24).fill(0)
  for (const event of events) counts[hourIndex(event.timestamp)] += 1
  return counts
}

function countBy(values: Array<string | undefined>, limit: number): CountRow[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ id: label, label, count }))
}

function kpi(id: string, label: string, events: HoneypotEvent[], value = events.length): Kpi {
  // Previous-period value is synthetic: ±35% around the current value.
  const rng = createRng(id.length * 7919 + value)
  return { id, label, value, previous: Math.round(value * (0.65 + rng() * 0.7)), trend: hourly(events) }
}

/** Who is signed in: answered from the request's session by the backend
 * (src/data/backend.ts); the fixture operator for internal callers. */
export async function getSessionUser(): Promise<SessionUser | null> {
  // The session comes from the auth layer, not the data backend; keeping it
  // up lets page errors render inside the shell.
  await mockDelay({ canFail: false })
  return MOCK_USER
}

export async function getOverview(): Promise<OverviewData> {
  await mockDelay()
  const logins = EVENTS.filter((e) => e.type === 'login.success')
  const downloads = EVENTS.filter((e) => e.type === 'file.download')
  const firstPerSource = [...new Map(EVENTS.map((e) => [e.srcIp, e])).values()]
  const firstPerSession = [...new Map(EVENTS.map((e) => [e.sessionId, e])).values()]

  const protocolTotals = countBy(EVENTS.map((e) => e.protocol), 8)
  const topProtocols = protocolTotals.slice(0, 5).map((row) => row.label)
  const timeline: TimeBucket[] = Array.from({ length: 24 }, (_, i) => ({
    time: new Date(MOCK_NOW - (24 - i) * HOUR).toISOString(),
    total: 0,
    byProtocol: {},
  }))
  for (const event of EVENTS) {
    const bucket = timeline[hourIndex(event.timestamp)]
    bucket.total += 1
    if (event.protocol) bucket.byProtocol[event.protocol] = (bucket.byProtocol[event.protocol] ?? 0) + 1
  }

  return {
    generatedAt: new Date(MOCK_NOW).toISOString(),
    kpis: [
      kpi('events', 'Events', EVENTS),
      kpi('sources', 'Unique sources', firstPerSource),
      kpi('sessions', 'Sessions', firstPerSession),
      kpi('logins', 'Successful logins', logins),
      kpi('payloads', 'Payloads captured', downloads),
    ],
    timeline,
    topProtocols,
    topSources: [...SOURCES].sort((a, b) => b.events - a.events).slice(0, 8),
    topCountries: countBy(EVENTS.map((e) => e.country), 8),
    topUsernames: countBy(EVENTS.map((e) => e.username), USERNAMES.length).slice(0, 8),
    topPasswords: countBy(EVENTS.map((e) => e.password), PASSWORDS.length).slice(0, 8),
    recentEvents: EVENTS.slice(0, 12),
    sensors: countBy(EVENTS.map((e) => e.sensor), SENSORS.length).map((row) => ({ sensor: row.label, events: row.count })),
  }
}

// ---- Monitor ---------------------------------------------------------------

const DAY = 24 * HOUR
const within24h = (timestamp: string) => MOCK_NOW - Date.parse(timestamp) < DAY

export async function getMlAnomalies(): Promise<MlAnomaliesData> {
  await mockDelay()
  const recent = ML_ANOMALIES.filter((a) => within24h(a.timestamp))
  return {
    anomalies: ML_ANOMALIES.map((a) => ({ ...a })),
    total24h: recent.reduce((sum, a) => sum + a.folded, 0),
    openBacklog: ML_ANOMALIES.filter((a) => a.status === 'open').reduce((sum, a) => sum + a.folded, 0),
    // Folded rows stand for several anomalies, so every breakdown counts them
    // at full weight and the tiles add up to the 24h total.
    bySeverity: countBy(recent.flatMap((a) => Array<string>(a.folded).fill(a.severity)), 5),
    topSources: countBy(recent.flatMap((a) => (a.srcIp ? Array<string>(a.folded).fill(a.srcIp) : [])), 10),
    eventTypes: [...new Set(ML_ANOMALIES.map((a) => a.eventType))].sort(),
    scoreTimeline: SCORE_TIMELINE,
    modelHealth: MODEL_HEALTH,
  }
}

/** Mock write: marks anomalies acknowledged ("seen, no verdict"). */
export async function acknowledgeAnomalies(ids: string[]): Promise<number> {
  await mockDelay()
  let changed = 0
  for (const anomaly of ML_ANOMALIES) {
    if (ids.includes(anomaly.id) && anomaly.status === 'open') {
      anomaly.status = 'acknowledged'
      changed += 1
    }
  }
  return changed
}

export async function acknowledgeAllAnomalies(): Promise<number> {
  return acknowledgeAnomalies(ML_ANOMALIES.filter((a) => a.status === 'open').map((a) => a.id))
}

/** Mock write: records (or with 'open', retracts) an operator verdict. */
export async function setAnomalyDisposition(ids: string[], status: Disposition | 'open', reason: string): Promise<void> {
  await mockDelay()
  for (const anomaly of ML_ANOMALIES) {
    if (!ids.includes(anomaly.id)) continue
    anomaly.status = status
    anomaly.dispositionReason = status === 'open' ? undefined : reason || undefined
  }
}

export async function getLlmAnalyses(): Promise<LlmAnalysis[]> {
  await mockDelay()
  return LLM_ANALYSES
}

/** Mock semantic search: ranks session summaries by word overlap. */
export async function semanticSearch(query: string): Promise<SemanticSearchResult> {
  await mockDelay()
  const words = new Set(query.toLowerCase().split(/\W+/).filter((w) => w.length > 2))
  if (words.size === 0) return { available: true, hits: [] }
  const hits = LLM_ANALYSES.filter((a) => a.docType === 'session' && a.summary)
    .map((a) => {
      // Summary hits count double; intent/behavior tags count once.
      const summary = a.summary.toLowerCase()
      const tags = `${a.intent} ${a.behaviors.join(' ')}`.toLowerCase()
      const points = [...words].reduce((sum, w) => sum + (summary.includes(w) ? 2 : 0) + (tags.includes(w) ? 1 : 0), 0)
      return { id: a.id, score: points / (3 * words.size), severity: a.severity, summary: a.summary, sessionId: a.sessionId }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  return { available: true, hits }
}

export async function getAgentCampaigns(): Promise<AgentCampaign[]> {
  await mockDelay()
  return AGENT_CAMPAIGNS
}

export async function getAuthEvents(): Promise<AuthEventsData> {
  await mockDelay()
  const recent = AUTH_FAILURES.filter((e) => within24h(e.timestamp))
  return {
    events: AUTH_FAILURES,
    failed24h: recent.length,
    byClient: countBy(recent.map((e) => e.clientId), 10),
    topSources: countBy(recent.map((e) => e.ip), 10),
  }
}

// ---- Investigate -----------------------------------------------------------

const KIND_TYPES: Record<EventKind, EventType[]> = {
  connection: ['connection'],
  login: ['login.failed', 'login.success'],
  'login-success': ['login.success'],
  command: ['command.input'],
  download: ['file.download'],
  http: ['http.request'],
  protocol: ['protocol.request'],
  alert: ['ids.alert'],
}

/** `30m`, `6h`, `7d` → milliseconds; anything else → no window. */
function sinceMs(since?: string): number | undefined {
  const match = since?.match(/^(\d+)([mhd])$/)
  if (!match) return undefined
  return Number(match[1]) * { m: 60_000, h: HOUR, d: DAY }[match[2] as 'm' | 'h' | 'd']
}

/** The page a request asks for, out of every matching row. */
function pageOf<T>(rows: T[], { offset = 0, limit }: PageRequest = {}): Paged<T> {
  const start = Math.max(0, Math.floor(offset))
  return { rows: limit === undefined ? rows.slice(start) : rows.slice(start, start + Math.max(0, limit)), total: rows.length, offset: start }
}

/** Events matching the filters, newest first, one page at a time. */
function filteredEvents(filters: EventFilters): HoneypotEvent[] {
  const window = sinceMs(filters.since)
  const anyOf = (list: string | number | undefined, value: string) => list === undefined || String(list).split(',').includes(value)
  const kinds = filters.kind?.split(',').filter((k): k is EventKind => k in KIND_TYPES)
  return EVENTS.filter(
    (e) =>
      anyOf(filters.ip, e.srcIp) &&
      anyOf(filters.sensor, e.sensor) &&
      anyOf(filters.country, e.country ?? '') &&
      anyOf(filters.proto, e.protocol ?? '') &&
      anyOf(filters.port, String(e.dstPort)) &&
      anyOf(filters.persona, e.persona ?? '') &&
      anyOf(filters.site, e.site ?? '') &&
      anyOf(filters.asset, e.asset ?? '') &&
      anyOf(filters.org, e.org ?? '') &&
      anyOf(filters.provider, e.provider ?? '') &&
      anyOf(filters.city, e.city ?? '') &&
      (filters.fingerprint === undefined || e.fingerprint === filters.fingerprint) &&
      (!kinds?.length || kinds.some((kind) => KIND_TYPES[kind].includes(e.type))) &&
      (window === undefined || MOCK_NOW - Date.parse(e.timestamp) <= window),
  )
}

export async function getEvents(filters: EventFilters & PageRequest): Promise<EventsPage> {
  await mockDelay()
  const rows = filteredEvents(filters)
  return {
    ...pageOf(rows, filters),
    values: {
      sensors: SENSORS.map((s) => s.id),
      countries: [...new Set(EVENTS.map((e) => e.country ?? ''))].sort(),
      protos: [...new Set(EVENTS.map((e) => e.protocol ?? ''))].sort(),
      ports: [...new Set(EVENTS.map((e) => e.dstPort))].sort((a, b) => a - b),
    },
  }
}

export async function getSourceProfiles(): Promise<{ sources: SourceProfile[]; mapPoints: MapPoint[] }> {
  await mockDelay()
  const byCountry = countBy(EVENTS.map((e) => e.country), 50)
  const mapPoints = byCountry.flatMap((row) => {
    const centroid = COUNTRY_CENTROIDS[row.label] as [number, number] | undefined
    return centroid ? [{ country: row.label, lat: centroid[0], lon: centroid[1], events: row.count }] : []
  })
  return { sources: SOURCE_PROFILES, mapPoints }
}

export async function getNetworkCampaigns(): Promise<{ campaigns: NetworkCampaign[]; credReuse: CredEdge[] }> {
  await mockDelay()
  return { campaigns: NETWORK_CAMPAIGNS, credReuse: CRED_REUSE }
}

export async function getInfraClusters(): Promise<InfraCluster[]> {
  await mockDelay()
  return INFRA_CLUSTERS
}

export async function getAttackers(): Promise<AttackerEntity[]> {
  await mockDelay()
  return ATTACKERS
}

export async function getKillChain(): Promise<KillChainData> {
  await mockDelay()
  return KILL_CHAIN
}

export async function getCommands(page?: PageRequest): Promise<Paged<HoneypotEvent>> {
  await mockDelay()
  return pageOf(
    EVENTS.filter((e) => e.type === 'command.input'),
    page,
  )
}

/** Sensors ordered busiest first. */
export async function getSensorCatalog(): Promise<SensorSummary[]> {
  await mockDelay()
  return [...SENSORS].sort((a, b) => b.eventsLast24h - a.eventsLast24h).map((s) => ({ sensor: s.id, events: s.eventsLast24h }))
}

export async function getSensorDetail(id: string): Promise<SensorDetail | null> {
  await mockDelay()
  const sensor = SENSORS.find((s) => s.id === id)
  if (!sensor) return null
  const events = EVENTS.filter((e) => e.sensor === id)
  const timeline: TimeBucket[] = Array.from({ length: 24 }, (_, i) => ({
    time: new Date(MOCK_NOW - (24 - i) * HOUR).toISOString(),
    total: 0,
    byProtocol: {},
  }))
  for (const event of events) {
    const bucket = timeline[hourIndex(event.timestamp)]
    bucket.total += 1
    if (event.protocol) bucket.byProtocol[event.protocol] = (bucket.byProtocol[event.protocol] ?? 0) + 1
  }
  const reading = sensorReading(sensor, events)
  return {
    sensor,
    uniqueSources: new Set(events.map((e) => e.srcIp)).size,
    firstSeen: SOURCES.map((s) => s.firstSeen).sort()[0],
    timeline,
    measures: reading.measures,
    topSources: countBy(events.map((e) => e.srcIp), 10),
    topCountries: countBy(events.map((e) => e.country), 10),
    topLists: reading.topLists,
    byType: countBy(events.map((e) => e.type), 10),
    recentEvents: events.slice(0, 15),
    reading: reading.reading,
  }
}

export async function getRecordings(ip?: string): Promise<Recording[]> {
  await mockDelay()
  return ip ? RECORDINGS.filter((r) => r.srcIp === ip) : RECORDINGS
}

export async function getReplay(shasum: string): Promise<Replay | null> {
  await mockDelay()
  return REPLAYS.get(shasum) ?? null
}

export type LookupTarget =
  | { kind: 'payload'; value: string }
  | { kind: 'cluster'; clusterKind: string; value: string }
  | { kind: 'not-found'; value: string }

/** Resolves a hex value to the payload or cluster that knows it. */
export async function resolveHash(value: string): Promise<LookupTarget> {
  await mockDelay()
  const hit = INFRA_CLUSTERS.find(
    (c) => (c.kind === 'payload' || c.kind === 'fingerprint') && c.value.toLowerCase().replace(/^hassh:/, '') === value,
  )
  if (PAYLOADS.some((p) => p.hash === value)) return { kind: 'payload', value }
  return hit ? { kind: 'cluster', clusterKind: hit.kind, value: hit.value } : { kind: 'not-found', value }
}

// ---- Operations ------------------------------------------------------------

/** Same-class alerts collapse into one row: the kind plus the message with
 * hash-like and dotted-quad tokens blanked. */
function alertClass(alert: AlertRecord): string {
  return `${alert.kind}|${alert.message.replace(/\b[0-9a-f]{16,}\b/gi, '#').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '#')}`
}

export async function getAlerts(): Promise<AlertGroup[]> {
  await mockDelay()
  const groups = new Map<string, AlertRecord[]>()
  for (const alert of ALERTS) {
    // Acknowledged and open members of one class land in separate groups so
    // each tab shows only its own records.
    const key = `${alertClass(alert)}|${alert.acknowledged}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ ...alert })
  }
  return [...groups]
    .map(([id, members]) => ({
      id,
      kind: members[0].kind,
      message: members.length > 1 ? members[0].message.replace(/\b[0-9a-f]{16,}\b/gi, '<hash>') : members[0].message,
      severity: members[0].severity,
      count: members.reduce((sum, m) => sum + m.count, 0),
      firstSeen: members.map((m) => m.firstSeen).sort()[0],
      lastSeen: members.map((m) => m.lastSeen).sort().at(-1)!,
      acknowledged: members[0].acknowledged,
      members,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

/** Open (unacknowledged) alert records: the sidebar's count, polled by
 * the shell, so it stays one cheap number rather than the grouped list. */
export async function getOpenAlertCount(): Promise<number> {
  await mockDelay()
  return ALERTS.filter((alert) => !alert.acknowledged).length
}

/** Mock write: acknowledges (or reopens) the given alert keys. */
export async function setAlertsAcknowledged(keys: string[], acknowledged: boolean): Promise<number> {
  await mockDelay()
  let changed = 0
  for (const alert of ALERTS) {
    if (keys.includes(alert.key) && alert.acknowledged !== acknowledged) {
      alert.acknowledged = acknowledged
      alert.acknowledgedBy = acknowledged ? MOCK_USER.name : undefined
      changed += 1
    }
  }
  return changed
}

export async function acknowledgeAllAlerts(): Promise<number> {
  return setAlertsAcknowledged(ALERTS.filter((a) => !a.acknowledged).map((a) => a.key), true)
}

export async function getSourceHealth(): Promise<SourceHealth> {
  await mockDelay()
  return withIncidents(SOURCE_HEALTH)
}

export async function getTopology(): Promise<Topology> {
  await mockDelay()
  return TOPOLOGY
}

const HISTORY_FIELDS: Record<string, (e: HoneypotEvent) => string> = {
  'source.ip': (e) => e.srcIp,
  ip: (e) => e.srcIp,
  sensor: (e) => e.sensor,
  'honeypot.event': (e) => e.type,
  event: (e) => e.type,
  protocol: (e) => e.protocol ?? '',
  port: (e) => String(e.dstPort),
  country: (e) => e.country ?? '',
  session: (e) => e.sessionId ?? '',
  username: (e) => e.username ?? '',
  'honeypot.persona_id': (e) => e.persona ?? '',
  persona: (e) => e.persona ?? '',
  'honeypot.site_id': (e) => e.site ?? '',
  'honeypot.asset_id': (e) => e.asset ?? '',
  'honeypot.organization': (e) => e.organization ?? '',
  'honeypot.canonical_fingerprint': (e) => e.fingerprint ?? '',
  'source.as.type': (e) => e.provider ?? '',
  'source.geo.city_name': (e) => e.city ?? '',
}

/** Mock of the archive's Lucene passthrough: `field:value` terms and free
 * text, joined with AND. Unknown fields match nothing. */
/** Archive search: at most 500 matches, like the real endpoint, paged. */
export async function searchHistory(query: string, page?: PageRequest): Promise<Paged<HoneypotEvent>> {
  await mockDelay()
  const terms = query
    .split(/\s+AND\s+/i)
    .map((t) => t.trim())
    .filter(Boolean)
  const matches = EVENTS.filter((event) =>
    terms.every((term) => {
      const match = term.match(/^([\w.]+):"?([^"]*)"?$/)
      if (match) {
        const field = HISTORY_FIELDS[match[1]] as ((e: HoneypotEvent) => string) | undefined
        return field ? field(event).toLowerCase().includes(match[2].toLowerCase()) : false
      }
      return JSON.stringify(event).toLowerCase().includes(term.toLowerCase())
    }),
  ).slice(0, 500)
  return pageOf(matches, page)
}

// ---- Reports ---------------------------------------------------------------

export async function getReports(): Promise<ReportsData> {
  await mockDelay()
  return {
    templates: REPORT_TEMPLATES,
    elements: REPORT_ELEMENTS,
    definitions: REPORT_DEFINITIONS.map((d) => structuredClone(d)),
    generated: [...GENERATED_REPORTS],
  }
}

/** Mock write: creates (empty id) or replaces a definition. */
export async function saveReportDefinition(definition: ReportDefinition): Promise<ReportDefinition> {
  await mockDelay()
  const draft = structuredClone(definition)
  // The scheduler recomputes the next run from the saved schedule.
  const schedule = draft.schedule ? { ...draft.schedule, nextRunAt: nextScheduledRun(draft.schedule, MOCK_NOW) } : null
  const saved = { ...draft, schedule, id: definition.id || `def-${Date.now().toString(36)}`, created: definition.created || new Date(MOCK_NOW).toISOString() }
  const index = REPORT_DEFINITIONS.findIndex((d) => d.id === saved.id)
  if (index >= 0) REPORT_DEFINITIONS[index] = saved
  else REPORT_DEFINITIONS.unshift(saved)
  return saved
}

export async function deleteReportDefinition(id: string): Promise<void> {
  await mockDelay()
  const index = REPORT_DEFINITIONS.findIndex((d) => d.id === id)
  if (index >= 0) REPORT_DEFINITIONS.splice(index, 1)
}

export async function generateReport(definitionId: string): Promise<GeneratedReport | null> {
  await mockDelay()
  const definition = REPORT_DEFINITIONS.find((d) => d.id === definitionId)
  if (!definition) return null
  const report: GeneratedReport = {
    id: `rpt-${Date.now().toString(36)}`,
    title: definition.name || definition.branding.title,
    template: definition.template,
    origin: 'manual',
    createdAt: new Date(MOCK_NOW).toISOString(),
    sizeBytes: 200 * 1024 + definition.elements.length * 90 * 1024,
    definitionId,
  }
  GENERATED_REPORTS.unshift(report)
  return report
}

export async function deleteGeneratedReport(id: string): Promise<void> {
  await mockDelay()
  const index = GENERATED_REPORTS.findIndex((r) => r.id === id)
  if (index >= 0) GENERATED_REPORTS.splice(index, 1)
}

const facet = (values: Array<string | undefined>, limit = 500): FacetValue[] => countBy(values, limit).map((r) => ({ value: r.label, count: r.count }))

/** Every value each filter can take, busiest first, for pickers that list
 * them all under the field. */
export async function getFacets(_kind = 'events', filters: EventFilters = {}): Promise<Facets> {
  await mockDelay()
  const events = filteredEvents(filters)
  return {
    sensors: facet(events.map((e) => e.sensor)),
    sources: facet(events.map((e) => e.srcIp)),
    countries: facet(events.map((e) => e.country)),
    protocols: facet(events.map((e) => e.protocol)),
    ports: facet(events.map((e) => String(e.dstPort))),
    signatures: facet(events.filter((e) => e.type === 'ids.alert').map((e) => e.summary)),
    kinds: (Object.keys(KIND_TYPES) as EventKind[]).map((kind) => ({ value: kind, ...(kind === 'login-success' ? { label: 'login (successful)' } : {}), count: events.filter((e) => KIND_TYPES[kind].includes(e.type)).length })),
    personas: facet(events.flatMap((e) => (e.persona ? [e.persona] : []))),
    providers: facet(events.map((e) => e.provider)),
    cities: facet(events.flatMap((e) => (e.city ? [e.city] : []))),
  }
}

/** What a draft definition would cover. The first scope filter that leaves
 * nothing to report is named, so the wizard can send the operator back to
 * that field rather than render an empty PDF. */
const SAMPLE_ROWS = 4
const formatCount = (n: number) => n.toLocaleString('en-US')

async function draftPreview(definition: ReportDefinition): Promise<ReportPreview> {
  await mockDelay()
  const { window, ip, sensor, port, signature } = definition.scope
  const list = (values: string[]) => values.join(', ')
  const filters: Array<[NonNullable<ReportPreview['emptyFilter']>['field'], string, (e: HoneypotEvent) => boolean]> = [
    ['window', `No events in the last ${window}.`, (e) => inRange(e.timestamp, window, MOCK_NOW)],
    ['ip', `${list(ip)} sent nothing in this window.`, (e) => ip.length === 0 || ip.includes(e.srcIp)],
    ['sensor', `${sensor.length === 1 ? 'Sensor' : 'Sensors'} ${list(sensor)} recorded nothing in this window.`, (e) => sensor.length === 0 || sensor.includes(e.sensor)],
    ['port', `Nothing reached port ${list(port)} in this window.`, (e) => port.length === 0 || port.includes(String(e.dstPort))],
    ['signature', `No IDS alert matching ${signature.map((x) => `“${x}”`).join(' or ')} in this window.`, (e) => signature.length === 0 || (e.type === 'ids.alert' && signature.some((x) => (e.summary ?? '').toLowerCase().includes(x.toLowerCase())))],
  ]
  let events = EVENTS
  let emptyFilter: ReportPreview['emptyFilter']
  for (const [field, message, keep] of filters) {
    const next = events.filter(keep)
    if (next.length === 0 && !emptyFilter) emptyFilter = { field, message }
    events = next
  }
  const sources = new Set(events.map((e) => e.srcIp))
  const rowsFor: Record<string, number> = {
    summary: 6,
    timeline: new Set(events.map((e) => e.timestamp.slice(0, 13))).size,
    sources: sources.size,
    credentials: new Set(events.flatMap((e) => credentialOf(e) ?? [])).size,
    commands: new Set(events.map((e) => e.command).filter(Boolean)).size,
    payloads: events.filter((e) => DOWNLOAD_HASH.has(e.id)).length,
    campaigns: NETWORK_CAMPAIGNS.filter((c) => [...sources].some((x) => membersOfCidr(c.cidr)?.includes(x))).length,
    attck: techniquesFor(events).length,
    appendix: Math.min(events.length, definition.appendixLimit),
  }
  // The first rows each section prints, so the review step shows real content.
  const top = (values: Array<string | undefined>): Array<[string, string]> => {
    const counts = new Map<string, number>()
    for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, SAMPLE_ROWS).map(([v, n]) => [v, formatCount(n)])
  }
  const techniques = techniquesFor(events)
  const samples: Record<string, { columns: [string, string]; sample: Array<[string, string]> }> = {
    summary: {
      columns: ['Measure', 'Value'],
      sample: [
        ['Events', formatCount(events.length)],
        ['Sources', formatCount(sources.size)],
        ['Sessions', formatCount(new Set(events.map((e) => e.sessionId)).size)],
        ['Sensors', formatCount(new Set(events.map((e) => e.sensor)).size)],
        ['Credentials tried', formatCount(rowsFor.credentials)],
        ['Commands run', formatCount(rowsFor.commands)],
      ],
    },
    timeline: { columns: ['Busiest hour (UTC)', 'Events'], sample: top(events.map((e) => `${e.timestamp.slice(0, 13).replace('T', ' ')}:00`)) },
    sources: { columns: ['Source', 'Events'], sample: top(events.map((e) => e.srcIp)) },
    credentials: { columns: ['Username : password', 'Tries'], sample: top(events.filter((e) => e.username).map((e) => `${e.username} : ${e.password ?? ''}`)) },
    commands: { columns: ['Command', 'Runs'], sample: top(events.map((e) => e.command)) },
    payloads: { columns: ['SHA-256', 'Downloads'], sample: top(events.map((e) => DOWNLOAD_HASH.get(e.id)?.slice(0, 16))) },
    campaigns: { columns: ['Network', 'Events'], sample: NETWORK_CAMPAIGNS.filter((c) => [...sources].some((x) => membersOfCidr(c.cidr)?.includes(x))).slice(0, SAMPLE_ROWS).map((c) => [c.cidr, formatCount(c.events)]) },
    attck: { columns: ['Technique', 'Events'], sample: techniques.slice(0, SAMPLE_ROWS).map((t) => [`${t.id} ${t.name}`, formatCount(t.events)]) },
    appendix: { columns: ['Time (UTC)', 'Event'], sample: events.slice(0, SAMPLE_ROWS).map((e) => [e.timestamp.slice(0, 19).replace('T', ' '), `${e.srcIp} ${e.type}`]) },
  }
  const sections = definition.elements.map((id) => {
    const rows = rowsFor[id] ?? 0
    const { columns, sample } = samples[id] ?? { columns: ['', ''] as [string, string], sample: [] }
    return { id, label: REPORT_ELEMENTS.find((e) => e.id === id)?.label ?? id, rows, pages: Math.max(1, Math.ceil(rows / 40)), columns, sample }
  })
  return {
    period: { from: new Date(MOCK_NOW - (RANGE_MS[window] ?? DAY)).toISOString(), to: new Date(MOCK_NOW).toISOString() },
    events: events.length,
    sources: sources.size,
    sensors: new Set(events.map((e) => e.sensor)).size,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    sections,
    pages: 1 + sections.reduce((n, s) => n + s.pages, 0),
    emptyFilter,
  }
}

/** The mock always has a preview. The live tier has none (APIARY#3524), so
 * the signature admits null and the wizard must work without one. */
export async function previewReport(definition: ReportDefinition): Promise<ReportPreview | null> {
  return draftPreview(definition)
}

/** Generates a PDF from a draft, saving the draft as a reusable definition
 * first when asked to (a one-off report keeps no definition). */
/** One sample's own PDF report; it joins the report history like any other. */
export async function generatePayloadReport(hash: string): Promise<GeneratedReport | null> {
  await mockDelay()
  const payload = findPayload(hash)
  if (!payload) return null
  const report: GeneratedReport = {
    id: `rpt-payload-${payload.hash}-${Date.now().toString(36)}`,
    title: `Payload report ${payload.hash.slice(0, 12)}`,
    template: 'payload',
    origin: 'manual',
    createdAt: new Date(MOCK_NOW).toISOString(),
    sizeBytes: 96 * 1024,
    definitionId: '',
  }
  GENERATED_REPORTS.unshift(report)
  return report
}

export async function generateReportFrom(definition: ReportDefinition, keep: boolean): Promise<{ report: GeneratedReport; definition?: ReportDefinition }> {
  await mockDelay()
  const saved = keep ? await saveReportDefinition(definition) : undefined
  const preview = await draftPreview(definition)
  const report: GeneratedReport = {
    id: `rpt-${Date.now().toString(36)}`,
    title: definition.name || definition.branding.title,
    template: definition.template,
    origin: 'manual',
    createdAt: new Date(MOCK_NOW).toISOString(),
    sizeBytes: 120 * 1024 + preview.pages * 60 * 1024,
    definitionId: saved?.id ?? '',
  }
  GENERATED_REPORTS.unshift(report)
  return { report, definition: saved }
}

// ---- Tools -----------------------------------------------------------------

export async function getCanarytokens(): Promise<{ types: CanaryTokenType[]; tokens: CanaryToken[]; triggers: CanaryTrigger[] }> {
  await mockDelay()
  return { types: CANARY_TYPES, tokens: [...CANARY_TOKENS], triggers: CANARY_TRIGGERS }
}

/** Mock write: mints a token as the self-hosted Canarytokens platform would. */
export async function createCanarytoken(input: { type: string; memo: string; snippet?: string; image?: { name: string; contentType: string; base64: string } }): Promise<CanaryToken> {
  await mockDelay()
  // What the platform itself refuses, before anything is minted.
  const kind = CANARY_TYPES.find((t) => t.type === input.type)
  if (!kind) throw new ApiError('invalid', 'createCanarytoken', { detail: `Unknown token type ${input.type}.` })
  if (kind.requiresUpload && !input.image) throw new ApiError('invalid', 'createCanarytoken', { detail: `${kind.label} needs an image to serve.` })
  if (input.snippet && !kind.supportsSnippet) throw new ApiError('invalid', 'createCanarytoken', { detail: `${kind.label} does not take a text snippet.` })
  const id = Array.from(crypto.getRandomValues(new Uint8Array(13)), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 25)
  const token: CanaryToken = {
    id,
    type: input.type,
    memo: input.memo,
    url: `http://canary.example.test/tags/${id}/index.html`,
    hostname: `${id}.canary.example.test`,
    createdAt: new Date(MOCK_NOW).toISOString(),
    createdBy: MOCK_USER.name,
    // A web image is served from the platform, not planted as a file.
    artifact: input.type === 'web_image' ? undefined : `${input.type}-${id.slice(0, 6)}`,
  }
  CANARY_TOKENS.unshift(token)
  return token
}

// Visually unambiguous alphabet (no 0/O, 1/l/I).


export async function getCredentials(): Promise<{ credentials: BaitCredential[]; tokens: CanaryToken[]; targets: string[] }> {
  await mockDelay()
  return {
    credentials: BAIT_CREDENTIALS.map((c) => ({ ...c })),
    tokens: CANARY_TOKENS,
    targets: SENSORS.filter((s) => s.kind === 'Cowrie').map((s) => s.id),
  }
}

/** Mock write: provisioning implants the file immediately (not a draft). */
export async function provisionCredential(input: Pick<BaitCredential, 'path' | 'target' | 'username' | 'password' | 'memo' | 'template'>): Promise<BaitCredential> {
  await mockDelay()
  const credential: BaitCredential = {
    ...input,
    template: input.template || 'username={{username}}\npassword={{password}}',
    id: `cred-${Date.now().toString(36)}`,
    createdAt: new Date(MOCK_NOW).toISOString(),
    createdBy: MOCK_USER.name,
  }
  BAIT_CREDENTIALS.unshift(credential)
  return credential
}

export async function rotateCredential(id: string, password?: string): Promise<void> {
  await mockDelay()
  const credential = BAIT_CREDENTIALS.find((c) => c.id === id)
  if (!credential) return
  credential.password = password || generatePassword()
  credential.rotatedAt = new Date(MOCK_NOW).toISOString()
  credential.rotatedBy = MOCK_USER.name
}

export async function linkCredentialToken(id: string, tokenId?: string): Promise<void> {
  await mockDelay()
  const credential = BAIT_CREDENTIALS.find((c) => c.id === id)
  if (credential) credential.linkedTokenId = tokenId
}

// ---- Evidence --------------------------------------------------------------

export async function getPayloads(): Promise<{ payloads: CapturedPayload[]; sources: CountRow[] }> {
  await mockDelay()
  return { payloads: PAYLOADS, sources: countBy(PAYLOADS.flatMap((p) => p.sources), 10) }
}

export async function getAnalysisResults(range?: string): Promise<AnalysisResultsData> {
  await mockDelay()
  return {
    // The analyzers' results in the app-wide range; runs, the queue and the
    // catalogs are not results and are always shown whole.
    results: ANALYSIS_RESULTS.filter((r) => r.analyzer === 'workbench' || inRange(r.at, range, MOCK_NOW)),
    gpuQueue: GPU_QUEUE.map((j) => ({ ...j })),
    analyzers: ANALYZERS,
    runs: WORKBENCH_RUNS.filter((r) => r.owner === MOCK_USER.name).map((r) => structuredClone(r)),
    recipes: WORKBENCH_RECIPES,
  }
}

/** The analyzers for one sample: its classification, and which analyzers
 * apply to it and why not. */
export async function getAnalyzerCatalog(hash: string): Promise<AnalyzerCatalog | null> {
  await mockDelay()
  const payload = PAYLOADS.find((p) => p.hash === hash.toLowerCase())
  if (!payload) return null
  return {
    classification: classificationOf(payload),
    analyzers: ANALYZERS.map((a) => {
      const reason = inapplicableReason(a, payload)
      return { ...a, applicable: !reason, ...(reason ? { reason } : {}) }
    }),
  }
}

/** Mock write: queues an analysis run of a captured payload with every
 * option the operator set; GPU analyzers also land on the GPU queue. An
 * identical run still in flight is reused instead. */
export async function startAnalysisRun(config: AnalysisRunConfig): Promise<{ run: WorkbenchRun; reused: boolean } | null> {
  await mockDelay()
  const payload = PAYLOADS.find((p) => p.hash === config.hash.toLowerCase())
  if (!payload) return null
  for (const id of config.analyzers) {
    const info = ANALYZERS.find((a) => a.id === id)
    const reason = info ? inapplicableReason(info, payload) : 'Unknown analyzer.'
    if (reason) throw new ApiError('invalid', 'startAnalysisRun', { detail: `${info?.label ?? id}: ${reason}` })
  }
  const same = (r: WorkbenchRun) => r.hash === payload.hash && (r.state === 'queued' || r.state === 'running') && r.children.map((c) => c.analyzerId).sort().join() === [...config.analyzers].sort().join()
  const inFlight = WORKBENCH_RUNS.find(same)
  if (inFlight) return { run: structuredClone(inFlight), reused: true }
  const options = Object.fromEntries(config.analyzers.map((id) => [id, config.options[id]]))
  const run: AnalysisResult = {
    id: `wb-${Date.now().toString(36)}`,
    analyzer: 'workbench',
    hash: payload.hash,
    file: `${payload.hash.slice(0, 12)}`,
    at: new Date(MOCK_NOW).toISOString(),
    owner: MOCK_USER.name,
    recipe: config.analyzers.join('+'),
    state: 'queued',
    summary: 'Workbench run',
    detail: { analyzers: config.analyzers, options },
  }
  ANALYSIS_RESULTS.unshift(run)
  const now = new Date(MOCK_NOW).toISOString()
  const children: WorkbenchRunChild[] = config.analyzers.map((analyzerId) => ({ analyzerId, label: ANALYZERS.find((a) => a.id === analyzerId)!.label, state: 'queued', createdAt: now, updatedAt: now, attempts: 0, retryable: false, cancelable: true }))
  const recipe = WORKBENCH_RECIPES.find((r) => r.analyzers.map((a) => a.analyzerId).sort().join() === [...config.analyzers].sort().join())
  const workbenchRun: WorkbenchRun = { id: run.id, hash: payload.hash, payloadKind: payload.kind, owner: MOCK_USER.name, label: run.summary, ...(recipe ? { recipeId: recipe.id, recipeName: recipe.name } : {}), state: 'queued', createdAt: now, updatedAt: now, children }
  WORKBENCH_RUNS.unshift(workbenchRun)
  for (const id of config.analyzers.filter((a) => a === 'ghidra' || a === 'revdeck')) {
    GPU_QUEUE.unshift({
      jobId: `gpu-${Date.now().toString(36).slice(-4)}${id[0]}`,
      requestedAt: new Date(MOCK_NOW).toISOString(),
      jobType: id === 'ghidra' ? 'ghidra-summary' : 'revdeck',
      model: 'qwen2.5-coder:14b',
      status: 'queued',
      attempts: 0,
      abortRequested: false,
      ref: payload.hash.slice(0, 16),
      vramMib: 10_240,
    })
  }
  return { run: structuredClone(workbenchRun), reused: false }
}

/** Mock write: its owner retries a failed or cancelled analyzer of a run,
 * or cancels one still queued or running. */
export async function setRunChild(runId: string, analyzerId: AnalyzerId, action: 'retry' | 'cancel'): Promise<WorkbenchRun | null> {
  await mockDelay()
  const run = WORKBENCH_RUNS.find((r) => r.id === runId && r.owner === MOCK_USER.name)
  const child = run?.children.find((c) => c.analyzerId === analyzerId)
  if (!run || !child) return null
  if (action === 'retry' ? !child.retryable : !child.cancelable) throw new ApiError('invalid', 'setRunChild', { detail: `${child.label} cannot be ${action === 'retry' ? 'retried' : 'cancelled'} now.` })
  const now = new Date().toISOString()
  if (action === 'retry') Object.assign(child, { state: 'queued', reason: undefined, retryable: false, cancelable: true, updatedAt: now })
  else Object.assign(child, { state: 'cancelled', reason: 'Cancelled by its owner.', retryable: true, cancelable: false, updatedAt: now })
  run.state = runStateOf(run.children)
  run.updatedAt = now
  return structuredClone(run)
}

/** Mock write: only a still-queued job can be aborted. */
export async function abortGpuJob(jobId: string): Promise<boolean> {
  await mockDelay()
  const job = GPU_QUEUE.find((j) => j.jobId === jobId)
  if (job?.status !== 'queued') return false
  job.abortRequested = true
  job.status = 'aborted'
  return true
}

// ---- Detail pages ----------------------------------------------------------

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  await mockDelay()
  const event = EVENTS.find((e) => e.id === id)
  if (!event) return null
  return {
    event,
    session: EVENTS.filter((e) => e.sessionId === event.sessionId && e.id !== id).slice(0, 25),
    // Same 5-tuple in spirit: same source address and port on the same sensor.
    connection: EVENTS.filter((e) => e.srcIp === event.srcIp && e.sensor === event.sensor && e.dstPort === event.dstPort && e.id !== id).slice(0, 10),
    source: EVENTS.filter((e) => e.srcIp === event.srcIp && e.sessionId !== event.sessionId).slice(0, 25),
    hashes: [DOWNLOAD_HASH.get(event.id)].filter((h): h is string => h !== undefined),
    recordingShasum: RECORDINGS.find((r) => r.session === event.sessionId)?.shasum,
    reading: readingOf(event.sensor),
  }
}

export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  await mockDelay()
  const events = EVENTS.filter((e) => e.sessionId === id)
  if (events.length === 0) return null
  return {
    id,
    events,
    srcIp: events[0].srcIp,
    country: events[0].country ?? '',
    first: events.at(-1)!.timestamp,
    last: events[0].timestamp,
    sensors: countBy(events.map((e) => e.sensor), 10),
    commands: countBy(events.map((e) => e.command), 15),
    credentials: countBy(events.map(credentialOf), 15),
    payloads: countBy(events.map((e) => DOWNLOAD_HASH.get(e.id)), 10),
    techniques: techniquesFor(events),
    recordingShasum: RECORDINGS.find((r) => r.session === id)?.shasum,
  }
}

export async function getIpProfile(ip: string): Promise<IpProfile | null> {
  await mockDelay()
  const source = SOURCES.find((s) => s.ip === ip)
  const profile = SOURCE_PROFILES.find((p) => p.ip === ip)
  if (!source || !profile) return null
  const events = EVENTS.filter((e) => e.srcIp === ip)
  return {
    source: { ...profile, asn: source.asn, asNumber: Number(source.asn.replace(/\D/g, '')) || null, riskScore: source.riskScore, tags: source.tags },
    blocked: BLOCKED_IPS.has(ip),
    ...(BLOCKED_IPS.has(ip) ? { block: { ...BLOCKED_IPS.get(ip)! } } : {}),
    confirmedMalicious: sandboxConfirmed().has(ip),
    events,
    sensors: countBy(events.map((e) => e.sensor), 10),
    credentials: countBy(events.map(credentialOf), 10),
    commands: countBy(events.map((e) => e.command), 10),
    // The request path alone, whatever the method: it is the URL indicator's value.
    paths: countBy(events.filter((e) => e.type === 'http.request').map((e) => (e.summary ?? '').split(' ')[1]), 10),
    ports: countBy(events.map((e) => String(e.dstPort)), 10),
    protocols: countBy(events.map((e) => e.protocol), 10),
    sessions: countBy(events.map((e) => e.sessionId), 10),
    payloads: countBy(events.map((e) => DOWNLOAD_HASH.get(e.id)), 10),
    alerts: countBy(events.filter((e) => e.type === 'ids.alert').map((e) => e.summary), 10),
    techniques: techniquesFor(events),
    correlation: {
      totalMatches: events.length + Math.round(events.length * 0.4),
      tunnelConnections: Math.round(events.length * 0.3),
      distinctSensors: new Set(events.map((e) => e.sensor)).size,
      tunnelOsGuesses: tunnelOsGuesses([ip]),
    },
    attackerId: ATTACKERS.find((a) => a.ips.includes(ip))?.id,
  }
}

/** p0f's stack fingerprints for portbridge tunnel connections: one or two
 * guesses per address, stable per address. */
const P0F_GUESSES = ['Linux 2.2.x-3.x', 'Linux 3.11 and newer', 'Linux 2.6.x', 'Windows 7 or 8', 'FreeBSD 9.x or newer', 'Mac OS X']
function tunnelOsGuesses(ips: string[]): string[] {
  const seen = new Map<string, number>()
  for (const ip of ips) {
    const last = Number(ip.split('.').at(-1))
    // A third of addresses were never fingerprinted over the tunnel.
    if (last % 3 === 0) continue
    for (const guess of [P0F_GUESSES[last % P0F_GUESSES.length], ...(last % 4 === 1 ? [P0F_GUESSES[(last + 1) % P0F_GUESSES.length]] : [])]) seen.set(guess, (seen.get(guess) ?? 0) + 1)
  }
  return [...seen].sort((a, b) => b[1] - a[1]).map(([guess]) => guess)
}

let confirmed: Set<string> | undefined
/** Addresses a sandbox detonation both found in the sample and connected
 * to. */
function sandboxConfirmed(): Set<string> {
  if (!confirmed) {
    confirmed = new Set()
    for (const payload of PAYLOADS.filter((p) => p.dynamic)) {
      const run = buildSandboxRun(payload)
      const referenced = new Set(run.staticIocs.remoteIps)
      for (const ip of run.network.remoteIps) if (referenced.has(ip)) confirmed.add(ip)
    }
  }
  return confirmed
}

/** Every manually blocked address, as the VPS firewall pulls them. */
export async function getBlockedIps(): Promise<string[]> {
  await mockDelay()
  return [...BLOCKED_IPS.keys()]
}

/** Mock write: adds/removes the address on the portbridge manual blackhole,
 * as the signed-in operator. `expiresDays` is the block's length in days
 * (0 = until lifted); it is required when blocking, as on the live endpoint. */
export async function setIpBlocked(ip: string, blocked: boolean, expiresDays?: number): Promise<void> {
  await mockDelay()
  if (blocked) {
    if (expiresDays === undefined || !Number.isInteger(expiresDays) || expiresDays < 0) throw new Error('a block needs a duration in whole days; 0 means permanent')
    const at = new Date()
    BLOCKED_IPS.set(ip, { by: MOCK_USER.name, at: at.toISOString(), ...(expiresDays > 0 ? { expiresAt: new Date(at.getTime() + expiresDays * 86_400_000).toISOString() } : {}) })
  } else BLOCKED_IPS.delete(ip)
}

export async function getReplayDetail(shasum: string): Promise<ReplayDetail | null> {
  await mockDelay()
  const replay = REPLAYS.get(shasum)
  if (!replay) return null
  const sessions = RECORDINGS.filter((r) => r.shasum === shasum)
  const ip = sessions.find((r) => r.srcIp)?.srcIp
  const events = ip ? EVENTS.filter((e) => e.srcIp === ip) : []
  return {
    replay,
    sessions,
    attacker: ip
      ? {
          ip,
          events: events.length,
          sessions: new Set(events.map((e) => e.sessionId)).size,
          commands: countBy(events.map((e) => e.command), 10),
          credentials: countBy(events.map(credentialOf), 10),
          sensors: countBy(events.map((e) => e.sensor), 10),
          sessionIds: countBy(events.map((e) => e.sessionId), 10),
        }
      : null,
  }
}

/** Grouped search across everything the dashboard shows: the palette asks
 * for a few per group, the search page for more. `moreHref` is where a
 * group's full list lives when it has one beyond the search page. */
export async function searchAll(query: string, limit = 8): Promise<SearchGroup[]> {
  await mockDelay()
  const q = query.trim().toLowerCase()
  if (!q) return []
  const has = (...values: Array<string | number | undefined>) => values.some((v) => v !== undefined && String(v).toLowerCase().includes(q))
  const history = `/history?q=${encodeURIComponent(q)}`
  const groups: SearchGroup[] = []
  const add = (id: string, title: string, items: SearchGroup['items'], moreHref?: string) => {
    // Within a group, and across groups, what the query names exactly comes
    // first: `cowrie` is the sensor before it is an alert that mentions it.
    const ranked = items.map((item) => ({ ...item, label: item.label.length > 96 ? `${item.label.slice(0, 95)}…` : item.label, rank: rankOf(item.label) })).sort((a, b) => a.rank - b.rank)
    if (ranked.length) groups.push({ id, title, total: ranked.length, items: ranked.slice(0, limit).map(({ rank: _, ...item }) => item), ...(ranked.length > limit && moreHref ? { moreHref } : {}) })
    best.set(id, ranked[0]?.rank ?? 3)
  }
  const rankOf = (label: string) => {
    const l = label.toLowerCase()
    return l === q ? 0 : l.startsWith(q) ? 1 : l.includes(q) ? 2 : 3
  }
  const best = new Map<string, number>()
  const distinct = <T,>(values: T[]) => [...new Set(values)]
  add('sources', 'Source IPs', SOURCES.filter((s) => s.ip.includes(q) || s.org.toLowerCase().includes(q) || s.asn.toLowerCase() === q).map((s) => ({ label: s.ip, detail: `${s.org} · ${s.country} · ${s.events} events`, href: `/sources/${s.ip}` })))
  add('networks', 'Networks', NETWORK_CAMPAIGNS.filter((c) => has(c.cidr, ...c.asns, ...c.providers)).map((c) => ({ label: c.cidr, detail: `${c.uniqueIps} IPs · ${c.events} events`, href: `/networks/${encodeURIComponent(c.cidr)}` })))
  add('asns', 'Autonomous systems', distinct(SOURCES.filter((s) => has(s.asn, s.org)).map((s) => `${s.asn}\u0000${s.org}`)).map((key) => {
    const [asn, org] = key.split('\u0000')
    return { label: asn, detail: org, href: `/asn/${encodeURIComponent(asn)}` }
  }))
  add('campaigns', 'Campaigns', NETWORK_CAMPAIGNS.filter((c) => has(c.cidr, c.explanation)).map((c) => ({ label: c.cidr, detail: `campaign · score ${c.score}`, href: `/campaigns/${encodeURIComponent(c.cidr)}` })), '/campaigns')
  add('clusters', 'Infrastructure clusters', INFRA_CLUSTERS.filter((c) => has(c.value, c.kind)).map((c) => ({ label: c.value, detail: `${c.kind} · ${c.sources} sources`, href: clusterHref(c.kind, c.value) })), '/clusters')
  add('identities', 'Attacker identities', ATTACKERS.filter((a) => has(a.id, ...a.ips, ...a.fingerprints, ...a.verdicts)).map((a) => ({ label: a.id, detail: `${a.ips.length} IPs · ${a.events} events`, href: `/identities/${encodeURIComponent(a.id)}` })), '/attackers')
  add('sessions', 'Sessions', distinct(EVENTS.filter((e) => (e.sessionId ?? '').includes(q)).map((e) => e.sessionId ?? '')).map((id) => ({ label: id, detail: 'session', href: `/sessions/${id}` })), history)
  add('commands', 'Commands', distinct(EVENTS.filter((e) => e.command?.toLowerCase().includes(q)).map((e) => e.command!)).map((c) => ({ label: c, detail: 'executed command', href: history })), history)
  add('credentials', 'Credentials', distinct(EVENTS.flatMap((e) => credentialOf(e) ?? []).filter((c) => c.toLowerCase().includes(q))).map((c) => ({ label: c, detail: 'credential pair', href: clusterHref('credential', c) })), history)
  add('payloads', 'Payloads', PAYLOADS.filter((p) => p.hash.includes(q) || p.verdict?.family?.toLowerCase().includes(q)).map((p) => ({ label: p.hash.slice(0, 24), detail: `${p.kind}${p.verdict?.family ? ` · ${p.verdict.family}` : ''}`, href: `/payloads/${p.hash}` })), '/payloads')
  add('fingerprints', 'Fingerprints', INFRA_CLUSTERS.filter((c) => c.kind === 'fingerprint' && c.value.includes(q)).map((c) => ({ label: c.value, detail: `${c.sources} sources`, href: clusterHref('fingerprint', c.value) })))
  add('signatures', 'IDS signatures', distinct(EVENTS.filter((e) => e.type === 'ids.alert' && (e.summary ?? '').toLowerCase().includes(q)).map((e) => e.summary ?? '')).map((s) => ({ label: s, detail: 'Suricata signature', href: history })), history)
  add('alerts', 'Alerts', [...new Map(ALERTS.filter((a) => has(a.key, a.kind, a.message)).map((a) => [alertClass(a), a])).entries()].map(([key, a]) => ({ label: a.message, detail: `${a.severity} · ${a.kind}`, href: `/alerts/${encodeURIComponent(key)}` })), '/alerts')
  add('anomalies', 'ML anomalies', ML_ANOMALIES.filter((a) => has(a.id, a.srcIp, a.explanation, a.sensor, a.eventType)).map((a) => ({ label: a.id, detail: `${a.severity} · ${a.srcIp ?? a.sensor} · ${a.eventType}`, href: `/ml-anomalies/${encodeURIComponent(a.id)}` })), '/ml-anomalies')
  add('llm', 'LLM analyses', LLM_ANALYSES.filter((a) => has(a.id, a.intent, a.summary, a.srcIp, a.sessionId, ...a.behaviors)).map((a) => ({ label: a.intent, detail: `${a.severity} · ${a.srcIp ?? a.docType}`, href: `/llm-analysis/${encodeURIComponent(a.id)}` })), '/llm-analysis')
  add('agent-campaigns', 'Agent campaigns', AGENT_CAMPAIGNS.filter((c) => has(c.id, ...c.categories, ...c.identifiers)).map((c) => ({ label: c.id, detail: `${c.severity} · ${c.categories.join(', ')}`, href: `/agent-campaigns/${encodeURIComponent(c.id)}` })), '/agent-campaigns')
  add('sensors', 'Sensors', SENSORS.filter((s) => has(s.id, s.name, s.kind, s.what, s.location)).map((s) => ({ label: s.name, detail: `${s.kind} · ${s.location}`, href: `/sensors/${encodeURIComponent(s.id)}` })), '/sensors')
  add('recordings', 'Session recordings', distinct(RECORDINGS.filter((r) => has(r.shasum, r.session, r.srcIp)).map((r) => r.shasum)).map((shasum) => ({ label: shasum.slice(0, 24), detail: 'terminal recording', href: `/recordings/${shasum}` })), '/recordings')
  add('reports', 'Reports', [
    ...REPORT_DEFINITIONS.filter((d) => has(d.id, d.name, d.template)).map((d) => ({ label: d.name, detail: 'report definition', href: `/reports/definitions/${encodeURIComponent(d.id)}` })),
    ...GENERATED_REPORTS.filter((g) => has(g.id, g.title)).map((g) => ({ label: g.title, detail: `generated PDF · ${g.origin}`, href: `/reports/generated/${encodeURIComponent(g.id)}` })),
  ], '/reports/library')
  add('canarytokens', 'Canarytokens', CANARY_TOKENS.filter((t) => has(t.id, t.memo, t.type, t.hostname)).map((t) => ({ label: t.memo, detail: `${t.type} token`, href: `/canarytokens/${encodeURIComponent(t.id)}` })), '/canarytokens')
  add('bait', 'Bait credentials', BAIT_CREDENTIALS.filter((b) => has(b.id, b.username, b.memo, b.target, b.path)).map((b) => ({ label: b.username, detail: `${b.target} · ${b.memo}`, href: `/credentials/${encodeURIComponent(b.id)}` })), '/credentials')
  add('analysis', 'Analysis runs', [
    ...CAPE_RUNS.filter((r) => has(r.sha)).map((r) => ({ label: r.sha.slice(0, 24), detail: `CAPE · ${r.status}`, href: `/cape/${r.sha}` })),
    ...GITHUB_ANALYSES.filter((r) => has(r.sha, r.family)).map((r) => ({ label: r.sha.slice(0, 24), detail: `GitHub analysis · ${r.status}${r.family ? ` · ${r.family}` : ''}`, href: `/github-analysis/${r.sha}` })),
    ...REVDECK_RUNS.filter((r) => has(r.sha, r.verdict)).map((r) => ({ label: r.sha.slice(0, 24), detail: `RevDeck · ${r.verdict}`, href: `/revdeck/${r.sha}` })),
    ...PAYLOADS.filter((p) => p.dynamic && p.hash.includes(q)).map((p) => ({ label: p.hash.slice(0, 24), detail: 'sandbox detonation', href: `/sandbox/${p.hash}` })),
  ], '/payload-workbench/results')
  add('dead-letters', 'Ingest dead letters', DEAD_LETTERS.filter((d) => has(d.id, d.reason, d.source, d.index)).map((d) => ({ label: d.id, detail: `${d.source} · ${d.reason}`, href: `/dead-letters/${encodeURIComponent(d.id)}` })), '/dead-letters')
  add('problems', 'Problem reports', PROBLEM_REPORTS.filter((r) => has(r.id, r.page, r.expected, r.actual)).map((r) => ({ label: r.expected, detail: `${r.status} · ${r.page}`, href: `/problem-reports/${encodeURIComponent(r.id)}` })), '/problem-reports')
  return groups.sort((a, b) => best.get(a.id)! - best.get(b.id)!)
}

export async function getDeadLetters(query: string): Promise<DeadLetter[]> {
  await mockDelay()
  const q = query.trim().toLowerCase()
  return q ? DEAD_LETTERS.filter((d) => JSON.stringify(d).toLowerCase().includes(q)) : [...DEAD_LETTERS]
}

/** Mock write: purges exactly the documents the query box shows — the same
 * `q` the list above it was loaded with, never a silently broader set. */
export async function purgeDeadLetters(query: string): Promise<number> {
  await mockDelay()
  const q = query.trim().toLowerCase()
  const hit = (d: (typeof DEAD_LETTERS)[number]) => (q ? JSON.stringify(d).toLowerCase().includes(q) : true)
  const before = DEAD_LETTERS.length
  for (let i = DEAD_LETTERS.length - 1; i >= 0; i--) if (hit(DEAD_LETTERS[i])) DEAD_LETTERS.splice(i, 1)
  return before - DEAD_LETTERS.length
}

export async function getProblemReports(): Promise<ProblemReport[]> {
  await mockDelay()
  return PROBLEM_REPORTS.map((r) => ({ ...r }))
}

/** The message a mail-sensor session captured, or null when only the
 * envelope was (an answer about the session, not a failure). */
export async function getMail(sessionId: string): Promise<CapturedMail | null> {
  await mockDelay()
  return mailFor(sessionId, EVENTS)
}

/** What the report-a-problem capture sends. */
export type ProblemReportInput = {
  page: string
  expected: string
  actual: string
  actionTrail: string[]
  consoleErrors: string[]
  networkFailures: string[]
  apiCalls: Array<{ method: string; path: string; status: number }>
  domSnapshot?: string
  userAgent: string
}

/** Secrets never survive into a stored report: credentials, tokens and
 * cookies are replaced wherever they appear, as the store's own pass does. */

export async function submitProblemReport(input: ProblemReportInput): Promise<{ id: string }> {
  await mockDelay()
  const id = `pr-${Date.now().toString(36)}`
  PROBLEM_REPORTS.unshift({
    id,
    submittedAt: new Date().toISOString(),
    submittedBy: MOCK_USER.name,
    status: 'open',
    page: input.page,
    expected: redact(input.expected),
    actual: redact(input.actual),
    consoleErrors: input.consoleErrors.map(redact),
    networkFailures: input.networkFailures.map(redact),
    apiCalls: input.apiCalls,
    actionTrail: input.actionTrail.map(redact),
    userAgent: input.userAgent,
    hasSnapshot: Boolean(input.domSnapshot),
  })
  return { id }
}

export async function setProblemStatus(id: string, status: ProblemStatus): Promise<void> {
  await mockDelay()
  const report = PROBLEM_REPORTS.find((r) => r.id === id)
  if (report) report.status = status
}

export async function getSettings(): Promise<SettingsData> {
  await mockDelay()
  return {
    user: MOCK_USER,
    users: OPERATORS.map((o) => ({ ...o })),
    preferences: { ...PREFERENCES },
    services: SERVICES.map((s) => ({ ...s })),
    history: [...CONFIG_HISTORY],
    audit: [...AUDIT_LOG],
    config: structuredClone(CONFIG),
    reporter: structuredClone(REPORTER_STATS),
    storage: structuredClone(ES_STORAGE),
    reportTemplates: REPORT_TEMPLATES,
  }
}

export async function savePreferences(next: Preferences): Promise<void> {
  await mockDelay()
  Object.assign(PREFERENCES, next)
}

function audit(action: string, fields: string[], result: 'ok' | 'rejected' = 'ok') {
  AUDIT_LOG.unshift({ id: `a-${Date.now().toString(36)}`, at: new Date(MOCK_NOW).toISOString(), actor: MOCK_USER.name, action, fields, result })
}

/** Mock write: stages an admin config section and records a revision. */
/** The operator's own preferences, which every page renders with. */
export async function getPreferences(): Promise<Preferences> {
  await mockDelay({ canFail: false })
  return { ...PREFERENCES }
}

/** The mock's "now": what relative timestamps count back from. */

/** The configuration the shell renders with on every page. */
export async function getShellConfig(): Promise<ShellConfig> {
  await mockDelay({ canFail: false })
  return { presentation: { ...CONFIG.presentation }, behavior: { ...CONFIG.behavior }, links: { ...DEPLOYMENT_LINKS } }
}


/** Section values as they were before each revision, for rollback. */
const SNAPSHOTS = new Map<string, { section: ConfigSection; value: unknown }>()

const SECTION_NAME: Record<ConfigSection, string> = { presentation: 'presentation', behavior: 'behavior', honeypot: 'honeypot', reportPresets: 'report-presets' }

/** Persist-nothing preview: what saving this section would refuse. */
export async function validateConfig<TSection extends ConfigSection>(section: TSection, value: DashboardConfig[TSection]): Promise<ConfigProblems> {
  await mockDelay()
  return validateSection(section, value, REPORT_TEMPLATES.map((t) => t.id))
}

/** Stages one config section: validated first, then recorded as a new
 * revision with what it replaced, so it can be rolled back. */
export async function saveConfigSection<TSection extends ConfigSection>(section: TSection, value: DashboardConfig[TSection]): Promise<{ ok: true; revision: number } | { ok: false; problems: ConfigProblems }> {
  await mockDelay()
  const problems = validateSection(section, value, REPORT_TEMPLATES.map((t) => t.id))
  if (Object.keys(problems).length > 0) {
    audit('config.save', Object.keys(problems).map((k) => `${SECTION_NAME[section]}.${k}`), 'rejected')
    return { ok: false, problems }
  }
  const before = CONFIG[section] as Record<string, unknown>
  const changed = Object.keys({ ...before, ...(value as Record<string, unknown>) }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify((value as Record<string, unknown>)[k]))
  CONFIG.revision += 1
  const id = `rev-${CONFIG.revision}`
  SNAPSHOTS.set(id, { section, value: structuredClone(before) })
  CONFIG[section] = structuredClone(value)
  CONFIG_HISTORY.unshift({ id, at: new Date(MOCK_NOW).toISOString(), actor: MOCK_USER.name, section: SECTION_NAME[section], summary: `Changed ${changed.join(', ') || 'nothing'}` })
  audit('config.save', changed.map((k) => `${SECTION_NAME[section]}.${k}`))
  return { ok: true, revision: CONFIG.revision }
}

export async function runServiceAction(name: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  await mockDelay()
  const service = SERVICES.find((s) => s.name === name)
  if (!service) return
  service.state = action === 'stop' ? 'exited' : 'running'
  service.uptime = action === 'stop' ? '—' : '0m'
  audit(`service.${action}`, [name])
}

export async function rollbackConfig(revisionId: string): Promise<void> {
  await mockDelay()
  const revision = CONFIG_HISTORY.find((r) => r.id === revisionId)
  if (!revision) return
  // Rolling back a revision restores what it replaced; seeded revisions
  // from before this session have no snapshot and only record the intent.
  const snapshot = SNAPSHOTS.get(revisionId)
  CONFIG.revision += 1
  if (snapshot) (CONFIG as unknown as Record<string, unknown>)[snapshot.section] = structuredClone(snapshot.value)
  CONFIG_HISTORY.unshift({ id: `rev-${CONFIG.revision}`, at: new Date(MOCK_NOW).toISOString(), actor: MOCK_USER.name, section: revision.section, summary: `Rolled back ${revision.id}` })
  audit('config.rollback', [revision.id])
}

// ---- Evidence detail -------------------------------------------------------

export async function getPayloadAnalysis(hash: string): Promise<PayloadAnalysis | null> {
  await mockDelay()
  const payload = findPayload(hash)
  return payload ? buildPayloadAnalysis(payload) : null
}

export type PayloadAction = 'sandbox' | 'ghidra' | 'github' | 'pdf'

/** Mock write: queues follow-up work on a sample. Returns what was queued. */
export async function queuePayloadAction(hash: string, action: PayloadAction): Promise<string> {
  await mockDelay()
  const labels: Record<PayloadAction, string> = {
    sandbox: 'Sandbox detonation queued',
    ghidra: 'Ghidra decompilation queued on the GPU queue',
    github: 'Submitted for GitHub publication and scanning',
    pdf: 'PDF report generation started',
  }
  if (action === 'ghidra') {
    GPU_QUEUE.push({ jobId: `gpu-${Date.now().toString(36)}`, requestedAt: new Date(MOCK_NOW).toISOString(), jobType: 'ghidra-summary', model: 'qwen2.5-coder:14b', status: 'queued', attempts: 0, abortRequested: false, ref: hash.slice(0, 16), vramMib: 10_240 })
  }
  return labels[action]
}

export async function getSandboxRun(job: string): Promise<SandboxRun | null> {
  await mockDelay()
  const payload = findPayload(job)
  return payload && payload.dynamic ? buildSandboxRun(payload) : null
}

/** Whether a Windows-sandbox detonation is live right now (mock: none is). */
export async function getSandboxLiveStatus(): Promise<{ running: boolean; job?: string; since?: string }> {
  await mockDelay()
  return { running: false }
}

export async function getGhidraAnalysis(sha: string): Promise<GhidraAnalysis | null> {
  await mockDelay()
  const payload = findPayload(sha)
  return payload && payload.kind !== 'shell script' ? buildGhidraAnalysis(payload) : null
}

/** One file of an analysis run's artifacts, as the store lists it. */
export type ArtifactRow = { filename: string; kind: string; contentType: string; sizeBytes: number; importedAt: string }

async function artifactFiles(kind: string, key: string): Promise<{ files: ArtifactFile[]; at: string } | null> {
  if (kind === 'ghidra') {
    const payload = findPayload(key)
    if (!payload || payload.kind === 'shell script') return null
    const analysis = buildGhidraAnalysis(payload)
    return { files: ghidraArtifacts(analysis), at: analysis.at }
  }
  if (kind === 'sandbox') {
    const run = await getSandboxRun(key)
    return run ? { files: sandboxArtifacts(run), at: run.at } : null
  }
  return null
}

/** The files a Ghidra (by sample) or sandbox (by job) run left behind. */
export async function getArtifacts(kind: string, key: string): Promise<ArtifactRow[] | null> {
  await mockDelay()
  const found = await artifactFiles(kind, key)
  return found?.files.map((f) => ({ filename: f.filename, kind: f.kind, contentType: f.contentType, sizeBytes: sizeOf(f.body), importedAt: found.at })) ?? null
}

/** One artifact's bytes, for its download. */
export async function getArtifactFile(kind: string, key: string, filename: string): Promise<ArtifactFile | null> {
  await mockDelay()
  return (await artifactFiles(kind, key))?.files.find((f) => f.filename === filename) ?? null
}

export async function getRevDeckRuns(): Promise<RevDeckRun[]> {
  await mockDelay()
  return REVDECK_RUNS
}

export async function getRevDeckRun(sha: string): Promise<RevDeckRun | null> {
  await mockDelay()
  return REVDECK_RUNS.find((r) => r.sha === sha) ?? null
}

export async function getCapeRuns(): Promise<CapeRun[]> {
  await mockDelay()
  return CAPE_RUNS
}

export async function getCapeRun(sha: string): Promise<CapeRun | null> {
  await mockDelay()
  return CAPE_RUNS.find((r) => r.sha === sha) ?? null
}

export async function getGithubAnalyses(): Promise<GithubAnalysis[]> {
  await mockDelay()
  return GITHUB_ANALYSES
}

export async function getGithubAnalysis(sha: string): Promise<GithubAnalysis | null> {
  await mockDelay()
  return GITHUB_ANALYSES.find((r) => r.sha === sha) ?? null
}

/** Everything behind the Overview's five views. */
export async function getOverviewViews(): Promise<OverviewViews> {
  await mockDelay()
  return OVERVIEW_VIEWS
}

// ---- Entity pages (epic #25) -----------------------------------------------

const RANGE_MS: Record<string, number> = { '1h': HOUR, '6h': 6 * HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }

/** Keeps items inside the app-wide range (default 24h). */

function summarizeSessions(events: HoneypotEvent[]): SessionSummary[] {
  const bySession = new Map<string, HoneypotEvent[]>()
  for (const e of events) {
    if (!e.sessionId) continue
    if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, [])
    bySession.get(e.sessionId)!.push(e)
  }
  return [...bySession]
    .map(([id, list]) => ({
      id,
      srcIp: list[0].srcIp,
      sensors: [...new Set(list.map((e) => e.sensor))],
      first: list.at(-1)!.timestamp,
      last: list[0].timestamp,
      events: list.length,
      logins: list.filter((e) => e.type === 'login.failed' || e.type === 'login.success').length,
      commands: list.filter((e) => e.type === 'command.input').length,
      downloads: list.filter((e) => e.type === 'file.download').length,
      recordingShasum: RECORDINGS.find((r) => r.session === id)?.shasum,
    }))
    .sort((a, b) => b.last.localeCompare(a.last))
}

export async function getSourceEvents(ip: string, range?: string): Promise<HoneypotEvent[]> {
  await mockDelay()
  return EVENTS.filter((e) => e.srcIp === ip && inRange(e.timestamp, range, MOCK_NOW))
}

export async function getSourceSessions(ip: string, range?: string): Promise<SessionSummary[]> {
  await mockDelay()
  return summarizeSessions(EVENTS.filter((e) => e.srcIp === ip && inRange(e.timestamp, range, MOCK_NOW)))
}

/** Everything that happened involving a source, newest first: its events plus
 * the anomalies, model analyses, canary triggers, and auth failures that
 * name it. */
export async function getSourceTimeline(ip: string, range?: string): Promise<TimelineItem[]> {
  return getEntityTimeline('source', ip, range)
}

export async function getSourceNetwork(ip: string): Promise<SourceNetwork | null> {
  await mockDelay()
  const source = SOURCES.find((s) => s.ip === ip)
  if (!source) return null
  const [a, b, c, d] = ip.split('.')
  const base = Math.floor(Number(d) / 64) * 64
  const cidr = `${a}.${b}.${c}.${base}/26`
  const inNet = (other: string) => {
    const parts = other.split('.')
    return `${parts[0]}.${parts[1]}.${parts[2]}` === `${a}.${b}.${c}` && Number(parts[3]) >= base && Number(parts[3]) < base + 64
  }
  return {
    cidr,
    asn: source.asn,
    org: source.org,
    country: source.country,
    neighbours: SOURCE_PROFILES.filter((p) => p.ip !== ip && inNet(p.ip)),
    campaign: NETWORK_CAMPAIGNS.find((n) => n.cidr === cidr),
  }
}

export async function getSourceIdentity(ip: string): Promise<AttackerEntity | null> {
  await mockDelay()
  return ATTACKERS.find((a) => a.ips.includes(ip)) ?? null
}

export async function getSessionSummary(id: string): Promise<SessionSummary | null> {
  await mockDelay()
  return summarizeSessions(EVENTS.filter((e) => e.sessionId === id))[0] ?? null
}

export async function getSessionEvents(id: string): Promise<HoneypotEvent[]> {
  await mockDelay()
  return EVENTS.filter((e) => e.sessionId === id)
}

/** Who delivered a payload: the download events that fetched it, their
 * sessions, and the addresses behind them. */
export async function getPayloadDelivery(hash: string): Promise<{ events: HoneypotEvent[]; sessions: SessionSummary[]; sources: CountRow[] }> {
  await mockDelay()
  const events = EVENTS.filter((e) => DOWNLOAD_HASH.get(e.id) === hash)
  const sessionIds = new Set(events.map((e) => e.sessionId))
  return {
    events,
    sessions: summarizeSessions(EVENTS.filter((e) => sessionIds.has(e.sessionId))),
    sources: countBy(events.map((e) => e.srcIp), 50),
  }
}

// ---- Entity groups (epic #25, Phase C) --------------------------------------

const cidr26 = (ip: string) => {
  const [a, b, c, d] = ip.split('.')
  return `${a}.${b}.${c}.${Math.floor(Number(d) / 64) * 64}/26`
}

function groupOf(ips: string[]): SourceGroup {
  const set = new Set(ips)
  const events = EVENTS.filter((e) => set.has(e.srcIp))
  return {
    members: SOURCE_PROFILES.filter((p) => set.has(p.ip)).sort((a, b) => b.events - a.events),
    events,
    totalMatches: events.length + Math.round(events.length * 0.35),
    tunnelConnections: Math.round(events.length * 0.28),
    tunnelOsGuesses: tunnelOsGuesses(ips),
    first: events.at(-1)?.timestamp,
    last: events[0]?.timestamp,
    sensors: countBy(events.map((e) => e.sensor), 20),
    sensorsTotal: new Set(events.map((e) => e.sensor)).size,
    countries: countBy(events.map((e) => e.country), 20),
    networks: countBy(events.map((e) => cidr26(e.srcIp)), 50),
    ports: countBy(events.map((e) => String(e.dstPort)), 20),
    credentials: countBy(events.map(credentialOf), 50),
    commands: countBy(events.map((e) => e.command), 50),
    payloads: countBy(events.map((e) => DOWNLOAD_HASH.get(e.id)), 50),
  }
}

type Signal = { kind: SharedSignal['kind']; value: string; members: string[] }

/** Credentials and networks used by two or more members: why they belong
 * together. Fingerprints and payloads come from the grouping record. */
function sharedSignals(group: SourceGroup, extra: Signal[] = []): SharedSignal[] {
  const byValue = new Map<string, Set<string>>()
  for (const e of group.events) {
    const credential = credentialOf(e)
    if (!credential) continue
    const key = `credential\u0000${credential}`
    if (!byValue.has(key)) byValue.set(key, new Set())
    byValue.get(key)!.add(e.srcIp)
  }
  const creds: Signal[] = [...byValue]
    .filter(([, ips]) => ips.size > 1)
    .map(([key, ips]) => ({ kind: 'credential', value: key.split('\u0000')[1], members: [...ips] }))
  return [...extra, ...creds]
    .sort((a, b) => b.members.length - a.members.length)
    .map((signal, i) => ({ ...signal, id: `${signal.kind}-${i}` }))
}

const membersOfCidr = (cidr: string): string[] | null => {
  const match = cidr.match(/^(\d+\.\d+\.\d+)\.(\d+)\/(\d+)$/)
  if (!match) return null
  const size = 2 ** (32 - Number(match[3]))
  const start = Number(match[2])
  return SOURCES.filter((s) => {
    const [a, b, c, d] = s.ip.split('.')
    return `${a}.${b}.${c}` === match[1] && Number(d) >= start && Number(d) < start + size
  }).map((s) => s.ip)
}

export async function getNetwork(cidr: string): Promise<NetworkEntity | null> {
  await mockDelay()
  const members = membersOfCidr(cidr)
  if (!members?.length) return null
  const first = SOURCES.find((s) => s.ip === members[0])!
  return { cidr, asn: first.asn, org: first.org, country: first.country, group: groupOf(members), campaign: NETWORK_CAMPAIGNS.find((c) => c.cidr === cidr) }
}

export async function getAsn(asn: string): Promise<AsnEntity | null> {
  await mockDelay()
  const sources = SOURCES.filter((s) => s.asn === asn)
  if (!sources.length) return null
  return { asn, orgs: [...new Set(sources.map((s) => s.org))], group: groupOf(sources.map((s) => s.ip)) }
}

export async function getCampaign(cidr: string): Promise<CampaignEntity | null> {
  await mockDelay()
  const campaign = NETWORK_CAMPAIGNS.find((c) => c.cidr === cidr)
  if (!campaign) return null
  const group = groupOf(membersOfCidr(cidr) ?? [])
  return { campaign, group, shared: sharedSignals(group) }
}

/** Addresses behind a fingerprint or payload: identities carrying it (and,
 * for payloads, whoever downloaded it); the cluster record's size otherwise. */
function sharedBy(kind: string, value: string, clusterSize: number): string[] {
  const fromIdentities = ATTACKERS.filter((a) => (kind === 'fingerprint' ? a.fingerprints : kind === 'payload' ? a.payloads : []).includes(value)).flatMap((a) => a.ips)
  const fromDownloads = kind === 'payload' ? EVENTS.filter((e) => DOWNLOAD_HASH.get(e.id) === value).map((e) => e.srcIp) : []
  const found = [...new Set([...fromIdentities, ...fromDownloads])]
  return found.length ? found : SOURCE_PROFILES.slice(0, clusterSize).map((s) => s.ip)
}

export async function getCluster(kind: string, value: string): Promise<ClusterEntity | null> {
  await mockDelay()
  const cluster = INFRA_CLUSTERS.find((c) => c.kind === kind && c.value === value)
  const members =
    kind === 'asn'
      ? SOURCES.filter((s) => s.asn === value).map((s) => s.ip)
      : kind === 'provider'
        ? SOURCES.filter((s) => s.org === value).map((s) => s.ip)
        : kind === 'credential'
          ? [...new Set(EVENTS.filter((e) => credentialOf(e) === value).map((e) => e.srcIp))]
          : sharedBy(kind, value, cluster?.sources ?? 0)
  if (!members.length) return null
  return { kind: kind as ClusterKind, value, group: groupOf(members) }
}

export async function getIdentity(id: string): Promise<IdentityEntity | null> {
  await mockDelay()
  const identity = ATTACKERS.find((a) => a.id === id)
  if (!identity) return null
  const group = groupOf(identity.ips)
  const all = identity.ips.length > 1 ? identity.ips : []
  const extra: Signal[] = all.length
    ? [
        ...identity.fingerprints.map((value) => ({ kind: 'fingerprint' as const, value, members: all })),
        ...identity.payloads.map((value) => ({ kind: 'payload' as const, value, members: all })),
      ]
    : []
  return { identity, group, shared: sharedSignals(group, extra) }
}

/** The fingerprint families the identity worker fuses on, in its order. */
const FUSION_CATEGORIES = ['JA3', 'JA4', 'p0f OS', 'SSH client', 'Payload hash', 'JA4T', 'HASSH', 'JA4SSH', 'JA4S', 'TCP signature']

export async function getIdentityFusion(id: string): Promise<IdentityFusion | null> {
  await mockDelay()
  const identity = ATTACKERS.find((a) => a.id === id)
  if (!identity) return null
  // Shared values need two members; a lone address shares nothing.
  if (identity.ips.length < 2) return { categories: FUSION_CATEGORIES, values: FUSION_CATEGORIES.map(() => 0), ips: identity.ips }
  const rng = createRng([...id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381))
  const fingerprints = identity.fingerprints.length
  const values = FUSION_CATEGORIES.map((category) => {
    if (category === 'Payload hash') return identity.payloads.length
    if (category === 'HASSH') return fingerprints
    if (category === 'SSH client') return Math.min(fingerprints, 1 + Math.floor(rng() * 2))
    // Sensors that are not deployed everywhere often contribute nothing.
    return rng() < 0.45 ? 0 : Math.floor(rng() * 4) + 1
  })
  return { categories: FUSION_CATEGORIES, values, ips: identity.ips }
}

// ---- Remaining entities (epic #25, Phase D) ----------------------------------

/** The alert-class key an alert group's page lives under (its id without the
 * acknowledged flag, so acknowledging keeps the URL). */

export interface AlertDetail {
  group: AlertGroup
  sources: string[]
  hashes: string[]
}

export async function getAlertDetail(key: string): Promise<AlertDetail | null> {
  await mockDelay()
  const members = ALERTS.filter((a) => alertClass(a) === key).map((a) => ({ ...a }))
  if (!members.length) return null
  const text = members.map((m) => m.message).join(' ')
  const known = new Set(SOURCES.map((x) => x.ip))
  return {
    group: {
      id: key,
      kind: members[0].kind,
      message: members.length > 1 ? members[0].message.replace(/\b[0-9a-f]{16,}\b/gi, '<hash>') : members[0].message,
      severity: members[0].severity,
      count: members.reduce((sum, m) => sum + m.count, 0),
      firstSeen: members.map((m) => m.firstSeen).sort()[0],
      lastSeen: members.map((m) => m.lastSeen).sort().at(-1)!,
      acknowledged: members.every((m) => m.acknowledged),
      members,
    },
    sources: [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])].filter((ip) => known.has(ip)),
    hashes: [...new Set(text.match(/\b[0-9a-f]{64}\b/gi) ?? [])],
  }
}

export async function getAnomaly(id: string): Promise<{ anomaly: MlAnomaly; event: HoneypotEvent | null } | null> {
  await mockDelay()
  const anomaly = ML_ANOMALIES.find((a) => a.id === id)
  if (!anomaly) return null
  return { anomaly, event: EVENTS.find((e) => e.id === anomaly.sourceEventId) ?? null }
}

export async function getLlmAnalysis(id: string): Promise<{ analysis: LlmAnalysis; events: HoneypotEvent[] } | null> {
  await mockDelay()
  const analysis = LLM_ANALYSES.find((a) => a.id === id)
  if (!analysis) return null
  const events = analysis.sessionId
    ? EVENTS.filter((e) => e.sessionId === analysis.sessionId)
    : analysis.payloadSha256
      ? EVENTS.filter((e) => DOWNLOAD_HASH.get(e.id) === analysis.payloadSha256)
      : analysis.srcIp
        ? EVENTS.filter((e) => e.srcIp === analysis.srcIp).slice(0, 50)
        : []
  return { analysis, events }
}

export async function getAgentCampaign(id: string): Promise<{ campaign: AgentCampaign; events: HoneypotEvent[] } | null> {
  await mockDelay()
  const campaign = AGENT_CAMPAIGNS.find((c) => c.id === id)
  if (!campaign) return null
  const ids = new Set(campaign.events.map((e) => e.eventId))
  return { campaign, events: EVENTS.filter((e) => ids.has(e.id)) }
}

// ---- IOCs and the unified timeline (epic #25, Phase E) ----------------------

const URL_RE = /https?:\/\/[^\s|;'"]+/g
/** Signatures and request paths that name a known CVE. */
const CVE_OF: Array<[RegExp, string]> = [
  [/EternalBlue|MS17-010/, 'CVE-2017-0144'],
  [/phpunit/i, 'CVE-2017-9841'],
  [/\/cgi-bin\/luci/, 'CVE-2023-1389'],
  [/boaform/, 'CVE-2018-10562'],
]

/** Every indicator one event carries, as [kind, value] pairs. */
function iocsOf(e: HoneypotEvent): Array<[IocHubKind, string]> {
  const out: Array<[IocHubKind, string]> = []
  const credential = credentialOf(e)
  if (credential) out.push(['credential', credential])
  if (e.username) out.push(['username', e.username])
  if (e.password) out.push(['password', e.password])
  if (e.command) {
    out.push(['command', e.command])
    for (const url of e.command.match(URL_RE) ?? []) out.push(['url', url], ['domain', new URL(url).hostname])
  }
  if (e.type === 'http.request') {
    const path = (e.summary ?? '').split(' ')[1]
    if (path) out.push(['url', path])
  }
  if (e.type === 'ids.alert' && e.summary) out.push(['signature', e.summary])
  for (const [re, cve] of CVE_OF) if (re.test(e.summary ?? '')) out.push(['cve', cve])
  const hash = DOWNLOAD_HASH.get(e.id)
  if (hash) out.push(['hash', hash])
  return out
}

let iocIndex: Map<string, HoneypotEvent[]> | undefined
const iocKey = (kind: string, value: string) => `${kind}\u0000${value}`
function iocEvents(kind: string, value: string): HoneypotEvent[] {
  if (!iocIndex) {
    iocIndex = new Map()
    for (const e of EVENTS) {
      for (const [k, v] of iocsOf(e)) {
        const key = iocKey(k, v)
        if (!iocIndex.has(key)) iocIndex.set(key, [])
        iocIndex.get(key)!.push(e)
      }
    }
  }
  if (kind === 'fingerprint') {
    const ips = new Set(sharedBy('fingerprint', value, 0))
    // An event links its own fingerprint even when no identity shares it.
    return EVENTS.filter((e) => ips.has(e.srcIp) || e.fingerprint === value)
  }
  return iocIndex.get(iocKey(kind, value)) ?? []
}

function iocRow(kind: IocHubKind, value: string): IocRow {
  const events = iocEvents(kind, value)
  return {
    id: iocKey(kind, value),
    kind,
    value,
    events: events.length,
    sources: new Set(events.map((e) => e.srcIp)).size,
    sessions: new Set(events.map((e) => e.sessionId)).size,
    last: events[0]?.timestamp,
  }
}

/** Every indicator seen, by kind, busiest first. */
export async function getIocCatalog(): Promise<Record<IocHubKind, IocRow[]>> {
  await mockDelay()
  iocEvents('', '')
  const kinds: IocHubKind[] = ['hash', 'domain', 'url', 'credential', 'command', 'fingerprint', 'cve', 'signature', 'username', 'password']
  const byKind = Object.fromEntries(kinds.map((kind) => [kind, [] as IocRow[]])) as Record<IocHubKind, IocRow[]>
  for (const key of iocIndex!.keys()) {
    const [kind, value] = key.split('\u0000') as [IocHubKind, string]
    byKind[kind].push(iocRow(kind, value))
  }
  const fingerprints = new Set([...INFRA_CLUSTERS.filter((c) => c.kind === 'fingerprint').map((c) => c.value), ...ATTACKERS.flatMap((a) => a.fingerprints)])
  byKind.fingerprint = [...fingerprints].map((fp) => iocRow('fingerprint', fp))
  // Every captured payload, including those that arrived without a download event.
  byKind.hash = PAYLOADS.map((p) => iocRow('hash', p.hash))
  for (const kind of Object.keys(byKind) as IocHubKind[]) byKind[kind].sort((a, b) => b.events - a.events)
  return byKind
}

export async function getIoc(kind: string, value: string): Promise<IocEntity | null> {
  await mockDelay()
  const events = iocEvents(kind, value)
  if (!events.length) return null
  const sessionIds = new Set(events.map((e) => e.sessionId))
  const sessionEvents = EVENTS.filter((e) => sessionIds.has(e.sessionId))
  return {
    kind: kind as IocHubKind,
    value,
    events,
    group: groupOf([...new Set(events.map((e) => e.srcIp))]),
    sessions: summarizeSessions(sessionEvents),
    payloads: countBy(sessionEvents.map((e) => DOWNLOAD_HASH.get(e.id)), 50),
  }
}

/** The addresses, sessions and events an entity's timeline covers. */
function timelineScope(kind: TimelineEntity, id: string): { ips: Set<string>; sessions: Set<string>; events?: HoneypotEvent[] } | null {
  const ipsOf = (ips: string[]) => ({ ips: new Set(ips), sessions: new Set<string>() })
  switch (kind) {
    case 'source':
      return ipsOf([id])
    case 'session':
      return { ips: new Set(), sessions: new Set([id]) }
    case 'network':
    case 'campaign':
      return ipsOf(membersOfCidr(id) ?? [])
    case 'asn':
      return ipsOf(SOURCES.filter((s) => s.asn === id).map((s) => s.ip))
    case 'identity':
      return ipsOf(ATTACKERS.find((a) => a.id === id)?.ips ?? [])
    case 'cluster': {
      const [clusterKind, ...rest] = id.split(':')
      const value = rest.join(':')
      return ipsOf(clusterKind === 'credential' ? iocEvents('credential', value).map((e) => e.srcIp) : sharedBy(clusterKind, value, INFRA_CLUSTERS.find((c) => c.kind === clusterKind && c.value === value)?.sources ?? 0))
    }
    case 'payload': {
      const sessions = new Set(EVENTS.filter((e) => DOWNLOAD_HASH.get(e.id) === id).map((e) => e.sessionId ?? ''))
      return { ips: new Set(), sessions }
    }
    case 'ioc': {
      const [iocKind, ...rest] = id.split(':')
      const events = iocEvents(iocKind, rest.join(':'))
      return { ips: new Set(), sessions: new Set(), events }
    }
  }
}

/** Everything that happened around one entity, newest first: its events and
 * captured payloads, plus the anomalies, model analyses, canary triggers,
 * auth failures and alerts that name its addresses or sessions. */
export async function getEntityTimeline(kind: TimelineEntity, id: string, range?: string): Promise<TimelineItem[]> {
  await mockDelay()
  const scope = timelineScope(kind, id)
  if (!scope) return []
  const { ips, sessions } = scope
  const events = scope.events ?? EVENTS.filter((e) => ips.has(e.srcIp) || (e.sessionId !== undefined && sessions.has(e.sessionId)))
  for (const e of events) {
    ips.add(e.srcIp)
    if (e.sessionId) sessions.add(e.sessionId)
  }
  // An IOC's timeline stays on its own events; other entities widen to the
  // records that name their addresses, a session only within its own window.
  const wide = kind !== 'ioc'
  const window = kind === 'session' && events.length ? [Date.parse(events.at(-1)!.timestamp) - 5 * 60_000, Date.parse(events[0].timestamp) + 5 * 60_000] : null
  const inWindow = (at: string) => !window || (Date.parse(at) >= window[0] && Date.parse(at) <= window[1])
  const items: TimelineItem[] = [
    ...events.map((e): TimelineItem => {
      const hash = DOWNLOAD_HASH.get(e.id)
      return hash
        ? { id: e.id, at: e.timestamp, kind: 'capture', title: `Payload captured: ${hash.slice(0, 16)}…`, detail: `${e.srcIp} · ${e.sensor}`, severity: e.severity, href: `/payloads/${hash}` }
        : { id: e.id, at: e.timestamp, kind: 'event', title: e.summary ?? '—', detail: `${e.srcIp} · ${e.sensor} · ${(e.protocol ?? '').toUpperCase()} ${e.dstPort}`, severity: e.severity, href: `/events/${e.id}` }
    }),
    ...(wide ? ML_ANOMALIES.filter((a) => a.srcIp && ips.has(a.srcIp)) : []).map((a): TimelineItem => ({ id: a.id, at: a.timestamp, kind: 'anomaly', title: a.explanation, detail: `ML score ${a.compositeScore.toFixed(2)} · ${a.status}`, severity: a.severity, href: `/ml-anomalies/${a.id}` })),
    ...(wide ? LLM_ANALYSES.filter((a) => (a.srcIp && ips.has(a.srcIp)) || (a.sessionId && sessions.has(a.sessionId))) : []).map((a): TimelineItem => ({ id: a.id, at: a.timestamp, kind: 'llm', title: a.summary || '(no summary)', detail: `AI-generated · ${a.intent}`, severity: a.severity, href: `/llm-analysis/${a.id}` })),
    ...(wide ? CANARY_TRIGGERS.filter((t) => ips.has(t.srcIp)) : []).map((t): TimelineItem => ({ id: t.id, at: t.triggeredAt, kind: 'canary', title: `Canarytoken fired: ${t.memo}`, detail: t.userAgent, severity: 'critical', href: `/canarytokens/triggers/${t.id}` })),
    ...(wide ? AUTH_FAILURES.filter((f) => f.ip && ips.has(f.ip)) : []).map((f): TimelineItem => ({ id: f.id, at: f.timestamp, kind: 'auth', title: `Failed login to ${f.clientId}`, detail: `${f.error}${f.username ? ` · ${f.username}` : ''}`, severity: 'medium', href: `/auth-events/${f.id}` })),
    ...(wide ? ALERTS.filter((a) => [...ips].some((ip) => a.message.includes(ip))) : []).map((a): TimelineItem => ({ id: a.key, at: a.lastSeen, kind: 'alert', title: a.message, detail: `${a.kind} · observed ${a.count}×`, severity: a.severity, href: `/alerts/${encodeURIComponent(alertClass(a))}` })),
  ]
  return items.filter((i) => inRange(i.at, range, MOCK_NOW) && (i.kind === 'event' || i.kind === 'capture' || inWindow(i.at))).sort((a, b) => b.at.localeCompare(a.at))
}

// ---- Related entities (epic #25, Phase E) -----------------------------------

const top = <T,>(items: T[], n = 6) => items.slice(0, n)

/** Identities, networks, campaigns and ASNs behind a set of addresses. */
function relatedToIps(ips: string[], skip: { network?: string; asn?: string; identity?: string; campaign?: string } = {}): RelatedGroup[] {
  const set = new Set(ips)
  const identities = ATTACKERS.filter((a) => a.id !== skip.identity && a.ips.some((ip) => set.has(ip)))
  const networks = countBy(ips.map(cidr26), 50).filter((r) => r.label !== skip.network)
  const asns = countBy(SOURCES.filter((x) => set.has(x.ip)).map((x) => x.asn), 20).filter((r) => r.label !== skip.asn)
  const campaigns = NETWORK_CAMPAIGNS.filter((c) => c.cidr !== skip.campaign && networks.some((n) => n.label === c.cidr) )
  return [
    { kind: 'identity', label: 'Attacker identities', items: top(identities).map((a) => ({ id: a.id, label: a.id.slice(0, 8), note: `${a.ips.length} IPs` })) },
    { kind: 'campaign', label: 'Campaigns', items: top(campaigns).map((c) => ({ id: c.cidr, note: `score ${c.score}` })) },
    { kind: 'network', label: 'Networks', items: top(networks).map((n) => ({ id: n.label, note: `${n.count} ${n.count === 1 ? 'address' : 'addresses'}` })) },
    { kind: 'asn', label: 'Autonomous systems', items: top(asns).map((a) => ({ id: a.label, note: `${a.count} ${a.count === 1 ? 'address' : 'addresses'}` })) },
  ]
}

const sourcesOf = (events: HoneypotEvent[]): RelatedGroup => ({
  kind: 'source',
  label: 'Source IPs',
  items: top(countBy(events.map((e) => e.srcIp), 50)).map((r) => ({ id: r.label, note: `${r.count} events` })),
})
const payloadsOf = (events: HoneypotEvent[]): RelatedGroup => ({
  kind: 'payload',
  label: 'Payloads',
  items: top(countBy(events.map((e) => DOWNLOAD_HASH.get(e.id)), 50)).map((r) => ({ id: r.label, label: `${r.label.slice(0, 12)}…` })),
})
const sessionsOf = (events: HoneypotEvent[]): RelatedGroup => ({
  kind: 'session',
  label: 'Sessions',
  items: top(countBy(events.map((e) => e.sessionId), 200)).map((r) => ({ id: r.label, note: `${r.count} events` })),
})

/** What else the entity on screen touches, for its Overview tab. Empty
 * groups are dropped. */
export async function getRelated(kind: TimelineEntity | 'event', id: string): Promise<RelatedGroup[]> {
  await mockDelay()
  let groups: RelatedGroup[] = []
  switch (kind) {
    case 'source': {
      const events = EVENTS.filter((e) => e.srcIp === id)
      groups = [...relatedToIps([id]), sessionsOf(events), payloadsOf(events)]
      break
    }
    case 'session': {
      const events = EVENTS.filter((e) => e.sessionId === id)
      const recording = RECORDINGS.find((r) => r.session === id)
      groups = [
        sourcesOf(events),
        { kind: 'sensor', label: 'Sensors', items: countBy(events.map((e) => e.sensor), 10).map((r) => ({ id: r.label })) },
        payloadsOf(events),
        { kind: 'recording', label: 'Recording', items: recording ? [{ id: recording.shasum, label: `${recording.shasum.slice(0, 12)}…` }] : [] },
        ...relatedToIps([...new Set(events.map((e) => e.srcIp))]),
      ]
      break
    }
    case 'event': {
      const e = EVENTS.find((x) => x.id === id)
      if (!e) return []
      const hash = DOWNLOAD_HASH.get(e.id)
      groups = [
        { kind: 'source', label: 'Source IP', items: [{ id: e.srcIp }] },
        { kind: 'session', label: 'Session', items: [{ id: e.sessionId ?? '' }] },
        { kind: 'sensor', label: 'Sensor', items: [{ id: e.sensor }] },
        { kind: 'payload', label: 'Payload', items: hash ? [{ id: hash, label: `${hash.slice(0, 12)}…` }] : [] },
        ...iocsOf(e)
          .filter(([k]) => k !== 'hash')
          .map(([k, v]): RelatedGroup => ({ kind: k, label: k, items: [{ id: v }] })),
        ...relatedToIps([e.srcIp]),
      ]
      break
    }
    case 'payload': {
      const events = EVENTS.filter((e) => DOWNLOAD_HASH.get(e.id) === id)
      const identities = ATTACKERS.filter((a) => a.payloads.includes(id))
      groups = [sourcesOf(events), sessionsOf(events), { kind: 'identity', label: 'Attacker identities', items: top(identities).map((a) => ({ id: a.id, label: a.id.slice(0, 8) })) }, ...relatedToIps(events.map((e) => e.srcIp)).filter((g) => g.kind !== 'identity')]
      break
    }
    case 'network':
      groups = relatedToIps(membersOfCidr(id) ?? [], { network: id })
      break
    case 'campaign':
      groups = relatedToIps(membersOfCidr(id) ?? [], { campaign: id })
      break
    case 'asn':
      groups = relatedToIps(SOURCES.filter((x) => x.asn === id).map((x) => x.ip), { asn: id })
      break
    case 'identity':
      groups = relatedToIps(ATTACKERS.find((a) => a.id === id)?.ips ?? [], { identity: id })
      break
    case 'cluster':
    case 'ioc': {
      const scope = timelineScope(kind, id)
      const events = scope?.events ?? EVENTS.filter((e) => scope?.ips.has(e.srcIp))
      groups = [sourcesOf(events), ...relatedToIps([...new Set(events.map((e) => e.srcIp))]), payloadsOf(events)]
      break
    }
    default:
      groups = []
  }
  return groups.filter((g) => g.items.length > 0)
}

// ---- Mock controls ------------------------------------------------------------

/** Mock only: start a simulated operational incident (the Mock data menu). */
export async function simulateIncident(incident: Incident): Promise<void> {
  simulate(incident)
}

/** Mock only: every simulated incident resolves. */
export async function resolveIncidents(): Promise<void> {
  resolveAll()
}
