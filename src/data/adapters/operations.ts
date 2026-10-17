// Operations slice (#77): backend wire shapes → the page types the mock seam
// already serves, and back again for the admin writes. One pure function per
// endpoint; nothing here fetches. Wire shapes: ../contracts/operations.ts.
//
// A page field the wire does not carry is left out of the return type
// (Omit/Pick) rather than invented, so wiring cannot forget it — each such
// omission is a documented gap below.

import type {
  AlertGroup,
  AlertRecord,
  ContainerState,
  CountRow,
  DeadLetter,
  FeedState,
  HoneypotEvent,
  ProblemReport,
  ProblemStatus,
  Sensor,
  SensorDetail,
  SensorFeed,
  SensorSummary,
  SourceHealth,
  TimeBucket,
  Topology,
  TopologySensor,
} from '../types'
import type {
  AckAlertBody,
  AlertPageWire,
  CuratedSensorsWire,
  DeadLetterWire,
  ProblemReportPageWire,
  ProblemStatusBody,
  PurgeDeadLettersWire,
  SensorCatalogWire,
  SensorEventsWire,
  SensorMeasureWire,
  SensorOverviewWire,
  SourceHealthWire,
  TopologyWire,
} from '../contracts/operations'
import type { ServicesWire } from '../contracts/settings'

const countRows = (rows: Array<{ key: string; count: number }>): CountRow[] => rows.map((r) => ({ id: r.key, label: r.key, count: r.count }))

// ---- Alerts ----------------------------------------------------------------

/** The page's `Severity` scale is fixed, and the alert-state document has no
 * severity field at all (worker.rs writes Key/Message/Link/FirstSeen/
 * LastSeen/Count/Acknowledged/LastNotified only). Everything reads as `info`;
 * a real severity is a #79-style gap, not something to infer from the key. */
const alertSeverity = 'info' as const

/** The key's "<kind>:<discriminator>" prefix is the only kind the document
 * carries. A key with no colon is its own kind. */
const alertKind = (key: string): string => {
  const colon = key.indexOf(':')
  return colon < 0 ? key : key.slice(0, colon)
}

/** GET /api/v1/alerts?offset&size=100 — one document per alert, already one
 * per key, so the page's client-side grouping (kind + blanked message) has
 * nothing left to fold: each row becomes its own single-member group. */
export function alertPage(wire: AlertPageWire): AlertGroup[] {
  return wire.rows.map((row) => {
    const record: AlertRecord = {
      key: row.Key,
      kind: alertKind(row.Key),
      message: row.Message,
      severity: alertSeverity,
      count: row.Count,
      firstSeen: row.FirstSeen,
      lastSeen: row.LastSeen,
      acknowledged: row.Acknowledged,
      ...(row.LastNotified ? { lastNotified: row.LastNotified } : {}),
      ...(row.Link ? { link: row.Link } : {}),
    }
    return {
      id: row._doc_id,
      kind: record.kind,
      message: record.message,
      severity: alertSeverity,
      count: record.count,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      acknowledged: record.acknowledged,
      members: [record],
    }
  })
}

/** POST /api/v1/alerts/{key}/ack body. The ack POST takes a body — `ack` is
 * required (no serde default), so acknowledging and reopening are the same
 * call with the flag flipped. There is no bulk endpoint: acknowledging N
 * keys is N requests, so callers loop (see the slice's gaps). */
export const alertAckBody = (acknowledged: boolean): AckAlertBody => ({ ack: acknowledged })

// ---- Sensors ---------------------------------------------------------------

/** GET /api/v1/sensors/catalog → the sensor list the pages render. The
 * catalog is a terms aggregation: it carries a name, a count and a last-seen,
 * and nothing about a sensor's identity, ports, persona or liveness. The
 * page's Sensor wants all of those, so this returns the two fields the wire
 * can answer; the caller fills the rest (see the slice's gaps). */
export const sensorCatalog = (wire: SensorCatalogWire): SensorSummary[] => wire.sensors.map((s) => ({ sensor: s.sensor, events: s.events }))

/** GET /api/v1/source-health `sensors[]` → the feed rows. The backend judges
 * ACTIVE / QUIET / STALE against each sensor's own typical rate; the page's
 * FeedState is fresh / delayed / stale / silent, so the mapping is the
 * documented one and silent is never inferred from a quiet sensor. */
export const sensorState = (state: string): FeedState => (state === 'ACTIVE' ? 'fresh' : state === 'QUIET' ? 'delayed' : state === 'STALE' ? 'stale' : 'silent')

export const sensorFeeds = (wire: Pick<SourceHealthWire, 'sensors'>): SensorFeed[] => wire.sensors.map((s) => ({ sensor: s.sensor, state: sensorState(s.state), documents: s.documents, lastSeen: s.last_seen }))

/** The backend's pipeline verdict — "disabled" / "unreachable" / a bare HTTP
 * status string / "healthy" — onto the page's running / degraded / stopped.
 * Disabled or unreachable is stopped; a 5xx status is stopped (the pipeline
 * is not delivering); any other status string is degraded; "healthy" (and
 * any future verdict the backend adds) is running. */
export const pipelineState = (state: string): 'running' | 'degraded' | 'stopped' => {
  if (state === 'disabled' || state === 'unreachable') return 'stopped'
  const code = Number.parseInt(state, 10)
  return Number.isFinite(code) ? (code >= 500 ? 'stopped' : 'degraded') : 'running'
}

/** Ingest freshness is its own verdict on the newest indexed event, not a
 * sensor rate: healthy / delayed (>2 min) / stale (>15 min) / unknown.
 * "unknown" (age -1, nothing indexed yet) is `silent`, not `stale`. */
const ingestState = (state: string): FeedState => (state === 'healthy' ? 'fresh' : state === 'delayed' ? 'delayed' : state === 'stale' ? 'stale' : 'silent')

export function sourceHealth(wire: SourceHealthWire): SourceHealth {
  const pipeline = wire.pipeline
  return {
    clusterStatus: wire.cluster_status === 'green' || wire.cluster_status === 'red' ? wire.cluster_status : 'yellow',
    indexedDocuments: wire.total_documents,
    feeds: sensorFeeds(wire),
    ingest: { state: ingestState(wire.ingest.state), lastIngest: wire.ingest.last_ingest, ageSeconds: wire.ingest.age_seconds, recentDeadLetters: wire.ingest.recent_dead_letters },
    yara: { enabled: wire.yara.enabled, lastScan: wire.yara.last_scan, rulesSha256: wire.yara.rules_sha256, samples: wire.yara.samples, matched: wire.yara.matched, errors: wire.yara.errors },
    runtime: { uptimeSeconds: wire.runtime.uptime_seconds, rssBytes: wire.runtime.rss_bytes, vmBytes: wire.runtime.vm_bytes },
    pipeline: { state: pipelineState(pipeline.state), acked: pipeline.acked, failed: pipeline.failed, dropped: pipeline.dropped, active: pipeline.active, decodeFailures: pipeline.decode_failures },
    deadLetters: wire.ingest.recent_dead_letters,
    unattributed24h: wire.unattributed_24h,
  }
}

/** GET /api/v1/sensors/{sensor}/overview. The wire's `hourly` is a bare
 * doc-count series with no bucket timestamps, so the timeline buckets carry no
 * protocol split (byProtocol {}) and their `time` is derived from the window's
 * end backwards — a graph point, not a measurement. The page's `measures`
 * wants {label, value, peak}; the wire gives {label, total, max, unit}, and
 * nothing per-source, so `peak` is the formatted total (see gaps). */
export function sensorOverview(wire: SensorOverviewWire, sensor: Sensor, recentEvents: HoneypotEvent[]): SensorDetail {
  const timeline: TimeBucket[] = wire.hourly.map((total, i) => ({ time: new Date(Date.parse(wire.last_seen) - (wire.hourly.length - 1 - i) * 3600_000).toISOString(), total, byProtocol: {} }))
  return {
    sensor,
    uniqueSources: wire.unique_sources,
    firstSeen: wire.first_seen,
    timeline,
    measures: wire.measures.map((m) => measure(m)),
    topSources: countRows(wire.top_sources),
    topCountries: countRows(wire.top_countries),
    topLists: wire.top_lists.map((l) => ({ label: l.label, rows: countRows(l.rows) })),
    byType: [],
    recentEvents,
    reading: { what: '', columns: [], artefacts: [] },
  }
}

const UNIT_SCALE: Record<string, number> = { duration_ms: 1, duration_s: 1000, bytes: 1, count: 1 }

const measure = (m: SensorMeasureWire) => ({ label: m.label, value: m.total * (UNIT_SCALE[m.unit] ?? 1), peak: `${m.max} max` })

/** GET /api/v1/sensors/{sensor}/events?limit=200. Not the shared event row:
 * these are sensors.rs SensorEvent — the sensor's own fields, no pivots, no
 * country, no session — so this maps to HoneypotEvent with only the fields the
 * endpoint can actually answer and leaves the rest absent (see gaps). It
 * sets no `protocol`: the endpoint does not say which protocol a row is.
 *
 * `type`, `eventName` and `techniques` are filled at the api seam (sensorPageEvents)
 * because they are page types or derive from the event name. `severity`
 * is never set here: the endpoint carries no ICS severity. */
export type SensorEventGap = 'type' | 'severity' | 'eventName' | 'summary' | 'asn' | 'org' | 'techniques' | 'provider' | 'city' | 'country' | 'sessionId'

export function sensorEvents(wire: SensorEventsWire): Array<Omit<HoneypotEvent, SensorEventGap>> {
  return wire.rows.map((row) => ({
    id: row.id,
    timestamp: row.when,
    sensor: wire.sensor,
    srcIp: row.src_ip,
    dstPort: row.dst_port,
    srcPort: row.src_port,
    fields: row.fields as HoneypotEvent['fields'],
  }))
}

/** GET /api/v1/sensors — the curated views for the three pre-catalog sensors
 * (mailoney, http-honeypot, tanner). Their rows are bespoke shapes that no
 * page type in this repo models, so this returns the counts the pages can
 * show and the payloads verbatim; there is no page type to map them onto. */
export const curatedSensors = (wire: CuratedSensorsWire) => ({ mailoney: wire.mailoney.length, httpRequests: wire.http_requests.length, tanner: wire.tanner.length, rows: wire })

// ---- Fleet topology --------------------------------------------------------

/** GET /api/v1/topology. Three joins, not one document: the static shape from
 * /api/v1/topology, `feed` from /api/v1/source-health (the page renders it as
 * a column), and each container's state from /api/v1/services. The wire's
 * flow links are NAMES, and the page's Sankey wants node INDICES; the node
 * list is what makes the lookup. `value` is 1 per declared edge — the graph
 * is the fleet's shape, not a volume map. */
export function topology(wire: TopologyWire, feeds: SensorFeed[], services: ServicesWire): Topology {
  const index = new Map(wire.flow.nodes.map((n, i) => [n.name, i]))
  const containerState = new Map<string, ContainerState>(services.services.map((s) => [s.name, toContainerState(s.state)]))
  return {
    flow: {
      nodes: wire.flow.nodes.map((n) => ({ name: n.name })),
      links: wire.flow.links.map((l) => ({ source: index.get(l.source) ?? 0, target: index.get(l.target) ?? 0, value: 1 })),
    },
    sensors: wire.sensors.map((s) => ({
      sensor: s.sensor,
      ingress: s.ingress.filter(isIngress),
      hostnames: s.hostnames,
      ports: s.ports.map((p) => ({ proto: p.proto === 'udp' ? 'udp' : 'tcp', public: p.public, host: p.host })),
      rawIndex: s.rawIndex,
      feed: feeds.find((f) => f.sensor === s.sensor)?.state ?? 'silent',
    })),
    stacks: wire.stacks.map((s) => ({
      stack: s.stack,
      containers: s.containers.map((c) => ({ name: c.name, state: containerState.get(c.name) ?? 'unknown', ...(exitCode(services, c.name) !== undefined ? { exitCode: exitCode(services, c.name) } : {}) })),
    })),
  }
}

/** The backend reports Docker's own status strings; the page has four.
 * "created"/"removing"/"dead" are not running and not cleanly stopped, so
 * they read as `restarting`… except "dead", which has no counterpart. */
const toContainerState = (state: string): ContainerState => (state === 'running' ? 'running' : state === 'exited' ? 'exited' : state === 'restarting' ? 'restarting' : 'unknown')

const exitCode = (services: ServicesWire, name: string): number | undefined => {
  const found = services.services.find((s) => s.name === name)
  return found?.state === 'exited' && typeof found.exit_code === 'number' ? found.exit_code : undefined
}

/** The topology's own ingress vocabulary is traefik / portbridge / tunnel-only;
 * the page adds "direct" and "+PROXY", neither of which the wire emits. */
const isIngress = (kind: string): kind is TopologySensor['ingress'][number] => kind === 'traefik' || kind === 'portbridge' || kind === 'tunnel-only' || kind === 'direct' || kind === 'proxy'

// ---- Dead letters ----------------------------------------------------------

/** GET /api/v1/store/dead-letters?{query}. A generic store passthrough, so
 * the row IS its `_source`; the page's five fields are read out of it with no
 * canonical key guaranteed (see gaps). `index` and `_index` are not on the
 * row — the store's search does not add them — so it is left empty. */
export function deadLetters(wire: { total: number; rows: DeadLetterWire[] }): DeadLetter[] {
  return wire.rows.map((row) => {
    const { _doc_id: id, ...doc } = row
    return {
      id,
      timestamp: str(row['@timestamp']),
      reason: str(row.reason) || str(row.error),
      source: str(row.logset) || str(row.pipeline),
      index: '',
      document: doc,
    }
  })
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

/** DELETE /api/v1/store/dead-letters?q= response. The wire's `deleted` is a
 * COUNT of documents purged, which is exactly what the seam returns. */
export const purgedDeadLetters = (wire: PurgeDeadLettersWire): number => wire.deleted

// ---- Problem reports -------------------------------------------------------

/** The page's ProblemStatus has four states; the backend accepts three.
 * "fixed" and "wontfix" have no counterpart — anything the wire reports
 * outside open/triaged/closed reads as "open" (see gaps). */
const problemStatus = (status: string): ProblemStatus => (status === 'triaged' ? 'triaged' : status === 'closed' ? 'fixed' : 'open')

/** GET /api/v1/store/problem-reports?offset&size=25. `action_trail` is a list
 * of {at, kind, detail}; the page holds strings, so the detail is used and
 * the timestamp dropped. The API call's `path` is the wire's `url` with its
 * query values already redacted. `hasSnapshot` is unknowable here: the store
 * EXCLUDES dom_snapshot from every list response, so this is always false
 * rather than "we checked and there is none" (see gaps). */
export const problemReportPage = (wire: ProblemReportPageWire): ProblemReport[] =>
  wire.rows.map((row) => ({
    id: row.id,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by_name || row.submitted_by,
    status: problemStatus(row.status),
    page: row.page,
    expected: row.expected,
    actual: row.actual,
    consoleErrors: row.console_errors,
    networkFailures: row.network_failures,
    apiCalls: row.api_calls.map((c) => ({ method: c.method, path: c.url, status: c.status })),
    actionTrail: row.action_trail.map((a) => a.detail),
    userAgent: row.user_agent,
    hasSnapshot: false,
  }))

/** PATCH /api/v1/problem-reports/{id} body. The page can ask for "fixed" or
 * "wontfix"; the handler 400s on anything outside open/triaged/closed, so
 * those two are mapped onto the nearest state the backend accepts rather than
 * sent and rejected (see gaps). */
export function problemStatusBody(status: ProblemStatus): ProblemStatusBody {
  return { status: status === 'triaged' ? 'triaged' : status === 'open' ? 'open' : 'closed' }
}

