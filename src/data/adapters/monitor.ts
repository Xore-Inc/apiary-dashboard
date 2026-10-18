// Monitor slice (#74): backend wire shapes → the page types the mock seam
// already serves, and back again for the admin writes. One pure function
// per endpoint; nothing calls the backend yet. Wire shapes:
// ../contracts/monitor.ts. A page field the wire does not carry is left out
// of the return type (Omit/Pick) rather than invented, so wiring cannot
// forget it — each such omission is a documented gap below.

import type { Bar, PiePoint, Series } from '../contracts/charts'
import type { SourcesPageWire } from '../contracts/sources'
import type {
  AgentCampaignRow,
  AuthEventRow,
  CampaignRow,
  ConfigDoc,
  Dashboard,
  DashboardKv,
  LlmAnalysisRow,
  LlmSearchResponse,
  MlAckAllResponse,
  MlAckRecord,
  MlAcks,
  MlAnomalyRow,
  MlAnomalyStats,
  MlDispositionResponse,
  MlModelHealth,
  MlStatus,
  OverviewKpis,
  StorePage,
} from '../contracts/monitor'
import type {
  AgentCampaign,
  AnomalyStatus,
  AuthFailure,
  CountRow,
  DashboardConfig,
  FeedState,
  Kpi,
  LlmAnalysis,
  LlmDocType,
  MlAnomaly,
  ModelHealth,
  NetworkCampaign,
  OverviewSource,
  OverviewViews,
  SemanticSearchResult,
  SeriesPoint,
  Severity,
} from '../types'

const SEVERITIES: readonly string[] = ['critical', 'high', 'medium', 'low', 'info']

/** Store rows are free-form text: anything outside the scale reads as info. */
export const toSeverity = (s: string | undefined): Severity => (SEVERITIES.includes(s ?? '') ? (s as Severity) : 'info')

const toCount = (kv: DashboardKv): CountRow => ({ id: kv.key, label: kv.key, count: kv.count })

/** A dashboard key/count list as the page's `CountRow`s, in the wire's order. */
export const toCountRows = (kvs: DashboardKv[]): CountRow[] => kvs.map(toCount)

/** "" on the wire (a Python None, or an empty string the writer defaulted)
 * means absent. */
const opt = (s: string | null | undefined): string | undefined => (s ? s : undefined)

// ---- Overview --------------------------------------------------------------

/** GET /api/v1/overview/kpis → the KPI tiles the wire can fill. Only events
 * and successful logins have a real previous-period figure, so those two
 * carry it; unique sources has none (`unique_ips` is a cardinality over
 * the live index, with no yesterday to compare), so its previous is the
 * current value and the tile shows no change. `change24h` is the backend's
 * own percent string and is not used: `Kpi` has no field for it and its
 * `previous` is the number the tile computes against. The sessions and
 * payloads tiles have no counterpart on this endpoint at all. */
export function toOverviewKpis(k: OverviewKpis): Kpi[] {
  return [
    { id: 'events', label: 'Events', value: k.last24h, previous: k.previous24h, trend: k.hourly },
    { id: 'sources', label: 'Unique sources', value: k.unique_ips, previous: k.unique_ips, trend: [] },
    { id: 'logins', label: 'Successful logins', value: k.logins, previous: k.logins, trend: [] },
  ]
}

const FEED_STATE: Record<Dashboard['sensors'][number]['state'], FeedState> = {
  active: 'fresh',
  quiet: 'delayed',
  stale: 'stale',
}

/** GET /api/v1/overview/dashboard → the overview's tab views
 * (`OverviewViews`, narrowed to the fields this endpoint carries). No
 * adapter returns the whole type: the remaining views have no dashboard
 * slice — vectors, ML backlog, netflow, conformance, CVEs and the
 * OS/TCP/ICS/decoy/JA4/TLS/SSH/endlessh breakdowns; payloads need
 * kind/platform/size/verdict where the part carries shasum + count only;
 * campaigns come from /campaigns. `logins` is a bare number on the wire
 * and `OverviewViews` has no home for it. */
export type DashboardViews = {
  [K in
    | 'heatmap'
    | 'mapPoints'
    | 'feeds'
    | 'protocols'
    | 'topIps'
    | 'topPorts'
    | 'countries'
    | 'asns'
    | 'providers'
    | 'credentials'
    | 'commands'
    | 'clients'
    | 'fingerprints'
    | 'paths'
    | 'alerts'
    | 'alertCategories']: NonNullable<OverviewViews[K]>
}

/** GET /api/v1/overview/dashboard. `pct` and `label` on a heat cell are
 * dropped: `HeatmapRow.cells` is the bare count series and the backend
 * computes its own intensity. `link` and `vt` on a `Kv`/`payload` row are
 * drill-down URLs the page builds from the label itself. */
export function toOverviewViews(d: Dashboard): DashboardViews {
  return {
    heatmap: d.heatmap.map((r) => ({ sensor: r.sensor, cells: r.cells.map((c) => c.count) })),
    mapPoints: d.map_points.map((p) => ({ country: p.country, lat: p.lat, lon: p.lon, events: p.events, ips: p.ips })),
    feeds: d.sensors.map((s) => ({ sensor: s.name, state: FEED_STATE[s.state], documents: s.count, lastSeen: s.last_seen })),
    protocols: d.protocols.map(toCount),
    topIps: d.top_ips.map(toCount),
    topPorts: d.top_ports.map(toCount),
    countries: d.countries.map(toCount),
    asns: d.asns.map(toCount),
    providers: d.providers.map(toCount),
    credentials: d.top_creds.map(toCount),
    commands: d.top_commands.map(toCount),
    clients: d.clients.map(toCount),
    fingerprints: d.fingerprints.map(toCount),
    paths: d.top_paths.map(toCount),
    alerts: d.alerts.map(toCount),
    alertCategories: d.alert_cats.map(toCount),
  }
}

/** GET /api/v1/sources?size=N → the overview's top attackers. The wire lists
 * rows by event count, highest first (aggregates.rs, `_count` desc) over the
 * last 10 days, so the first `limit` ARE the top sources of that window. Only the fields the wire carries: no ASN, org, risk score,
 * tags, provider or city. An empty country on the wire is absent, not ''. */
export const overviewSources = (wire: SourcesPageWire, limit: number): OverviewSource[] =>
  wire.rows.slice(0, limit).map((row) => ({
    ip: row.ip,
    ...(row.country ? { country: row.country } : {}),
    events: row.events,
    firstSeen: row.first,
    lastSeen: row.last,
  }))

/** GET /api/v1/charts/{bar chart} (`categories` and `values` in step) → one
 * `CountRow` per category. An empty category is a real key, kept as is. */
export const barRows = (bar: Bar): CountRow[] => bar.categories.map((label, i) => ({ id: label, label, count: bar.values[i] ?? 0 }))

/** GET /api/v1/charts/{pie chart} → one `CountRow` per slice. */
export const pieRows = (points: PiePoint[]): CountRow[] => points.map((p) => ({ id: p.name, label: p.name, count: p.value }))

/** GET /api/v1/charts/{series chart} (one `Series` per source or direction)
 * → the page's `SeriesPoint`s: one row per instant, with one key per series
 * name, so a new series shows up with no page change. Instants are sorted. */
export const seriesPoints = (series: Series[]): SeriesPoint[] => {
  const byName = new Map(series.map((s) => [s.name, new Map(s.points.map((p) => [p.time, p.value]))]))
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p.time)))].sort()
  return times.map((time) => {
    const point: SeriesPoint = { time }
    for (const [name, values] of byName) {
      const value = values.get(time)
      if (value !== undefined) point[name] = value
    }
    return point
  })
}

/** GET /api/v1/campaigns → the campaign summary the overview's card reads.
 *
 * The overview needs five fields; this is deliberately NOT the
 * `NetworkCampaign` the networks page wants (adapters/sources.ts
 * `networkCampaigns` maps the same endpoint to the full page type, and
 * #76 documents the three fields that full mapping has to invent). This one
 * stays a Pick so a field this card does not render cannot creep in. */
export function toCampaignSummary(row: CampaignRow): Pick<NetworkCampaign, 'cidr' | 'events' | 'uniqueIps' | 'sensors' | 'last'> {
  return { cidr: row.cidr, events: row.events, uniqueIps: row.unique_ips, sensors: row.sensors, last: row.last }
}

/** GET /api/v1/payloads?size=15 → the captured-payload count, which is all
 * the overview's tile shows (the row type is an untyped inventory
 * document). `sources` needs `?aggs=sources`, which this tile does not ask
 * for; `source_buckets`/`source_other` are therefore unused.
 *
 * Takes the `total` rather than the page, so the evidence slice's own
 * `PayloadPageWire` (contracts/evidence.ts) is accepted as well as this
 * slice's deliberately untyped `PayloadsPage` — the two describe the same
 * endpoint and differ only in how much of the row is typed, which this
 * function does not read. */
export const toPayloadCount = (page: { total: number }): number => page.total

/** GET /api/v1/config → the five presentation fields the overview and the
 * shell read. The other eleven presentation keys (`app_name`,
 * `title_format`, `org_name`, `overview_intro`, the help-link pair,
 * `ai_disclaimer`, `privacy_notice`, `banner_expires`) are stored under the
 * same names by config.rs but are not mapped here — the settings slice
 * owns them, and widening `DashboardConfig['presentation']` is out of
 * scope for #74. A never-configured deployment returns
 * `{revision: 0, payload: {}}`, so the block is absent and every field
 * reads as its empty string. */
export function toPresentation(doc: ConfigDoc): Pick<DashboardConfig['presentation'], 'dashboardTitle' | 'dashboardSubtitle' | 'footerText' | 'bannerText' | 'bannerSeverity'> {
  const p = doc.payload.presentation ?? {}
  const sev = p.banner_severity ?? ''
  return {
    dashboardTitle: p.dashboard_title ?? '',
    dashboardSubtitle: p.dashboard_subtitle ?? '',
    footerText: p.footer_text ?? '',
    bannerText: p.banner_text ?? '',
    bannerSeverity: (['info', 'success', 'warning', 'danger'].includes(sev) ? sev : '') as DashboardConfig['presentation']['bannerSeverity'],
  }
}

// ---- ML anomalies ----------------------------------------------------------

/** MlAnomaly fields a store row does not carry. `folded` is computed
 * client-side (same address and second, canonical lib/mlGrouping.ts), so
 * it is the page's own grouping, never the wire's. */
export type MlAnomalyGap = 'folded'

/** GET /api/v1/store/ml-anomalies row (+ its ack from /ml-anomalies/acks) →
 * MlAnomaly.
 *
 * The status is the one place the two stores have to be merged: `status`
 * lives on the anomaly document (the worker's "open" or the dashboard's
 * disposition), `acknowledged` lives only in the ack sidecar. A
 * disposition wins over an ack, and an ack over "open" — so an operator
 * verdict is never downgraded by a later bulk acknowledge, which is the
 * same precedence detail.rs:ml_anomaly_ack_all encodes when it refuses to
 * stamp a verdict-bearing document.
 *
 * `srcPort` is not on `MlAnomaly` (the page has no source port here), and
 * `community_id` is not either — both are wire fields with no page home. */
export function toMlAnomaly(row: MlAnomalyRow & { _doc_id: string }, ack?: MlAckRecord): Omit<MlAnomaly, MlAnomalyGap> {
  const s = row.model_scores ?? {}
  const score = (name: string): number => s[name] ?? 0
  const status: AnomalyStatus = row.status && row.status !== 'open' ? row.status : ack?.Acknowledged ? 'acknowledged' : 'open'
  return {
    id: row._doc_id,
    timestamp: row['@timestamp'],
    severity: toSeverity(row.severity),
    compositeScore: row.composite_score,
    // A detector that did not fire is a stored null, not a 0.0 — the
    // worker is explicit about this (#1969) — so an absent score reads 0.
    modelScores: { isolationForest: score('isolation_forest'), lstmAe: score('lstm_ae'), hbos: score('hbos') },
    srcIp: opt(row.src_ip),
    country: opt(row.src_country),
    explanation: row.explanation,
    sourceEventId: row.source_event_id,
    sourceIndex: row.source_index,
    eventType: row.event_type ?? '',
    dstPort: Number(row.dst_port) || 0,
    proto: row.proto ?? '',
    sensor: row.sensor ?? '',
    status,
    dispositionReason: opt(row.disposition_reason),
    thresholdAtScoring: row.alert_threshold,
    modelState: opt(row.model_state_id),
  }
}

/** GET /api/v1/store/ml-anomalies + /ml-anomalies/acks → the page's rows. */
export const toMlAnomalies = (page: StorePage<MlAnomalyRow>, acks: MlAcks): Array<Omit<MlAnomaly, MlAnomalyGap>> => page.rows.map((r) => toMlAnomaly(r, acks[r._doc_id]))

/** GET /api/v1/ml-anomalies/stats → the open backlog. The endpoint's
 * `total` is all-time and `open` is that total minus the dispositioned ∪
 * acknowledged union, so this is an all-time backlog rather than the
 * 24-hour figure the rest of the page computes; it feeds the "Open (all
 * time)" tile. */
export const toOpenBacklog = (s: MlAnomalyStats): number => s.open

/** GET /api/v1/ml-health → ModelHealth. */
export function toModelHealth(h: MlModelHealth): ModelHealth {
  return {
    model: h.model,
    timestamp: h.timestamp,
    accepted: h.accepted,
    reason: h.reason,
    anomalyRateNew: h.anomaly_rate_new,
    anomalyRatePrevious: h.anomaly_rate_previous,
    trainSamples: h.train_samples,
  }
}

/** POST /api/v1/ml-anomalies/ack body for one id. `ack: false` un-acks,
 * which is how the page's toggle reopens a row; `MlAnomaliesData` never
 * carries that choice, so the caller passes it. */
export const mlAckBody = (key: string, ack: boolean, actor?: string): { key: string; ack: boolean; actor?: string } => ({ key, ack, ...(actor ? { actor } : {}) })

/** POST /api/v1/ml-anomalies/ack → how many of the requested ids are now
 * acknowledged. The seam's `acknowledgeAnomalies(ids)` returns the count
 * it changed, and this reads it back off the records the POST wrote. */
export const toAckedCount = (records: MlAckRecord[]): number => records.filter((r) => r.Acknowledged).length

/** POST /api/v1/ml-anomalies/ack-all → how many changed. The sweep covers
 * the whole index, not the loaded page, so this is the seam's
 * `acknowledgeAllAnomalies()` return value directly. */
export const toAckAllCount = (r: MlAckAllResponse): number => r.changed

/** POST /api/v1/ml-anomalies/disposition body. `status` is the page's
 * `AnomalyStatus` minus the ack-only 'acknowledged', which is not a
 * disposition the backend accepts (DISPOSITION_STATUSES is the three
 * verdicts; 'open' is the retraction). Nothing is lost on save: the page
 * type's only other status value is the ack, which the sidecar owns. */
export function mlDispositionBody(key: string, status: AnomalyStatus, reason?: string, actor?: string): { key: string; status: MlStatus; reason?: string; actor?: string } {
  if (status === 'acknowledged') throw new Error(`acknowledged is not a disposition: ${key}`)
  return { key, status, ...(reason !== undefined ? { reason } : {}), ...(actor ? { actor } : {}) }
}

/** POST /api/v1/ml-anomalies/disposition → the status the backend recorded.
 * The response echoes what was sent, so this is a confirmation read rather
 * than a re-read of the row. */
export const toDispositionStatus = (r: MlDispositionResponse): AnomalyStatus => r.status

// ---- LLM analysis ----------------------------------------------------------

const DOC_TYPES: readonly string[] = ['session', 'payload', 'report']
const CONFIDENCE: readonly string[] = ['low', 'medium', 'high']

/** GET /api/v1/store/llm-analysis row → LlmAnalysis.
 *
 * `doc_type` is the worker's own tag and has a fourth value the page type
 * does not model: `record_error` writes `doc_type: "error"` for a failed
 * analysis. Anything that is not session/payload — including an error
 * record — reads as `report`, which is the page's catch-all analysis
 * shape. `confidence` is a string on the wire ("" when the worker filled
 * none) and only the three bands are kept. */
export function toLlmAnalysis(row: LlmAnalysisRow & { _doc_id: string }): LlmAnalysis {
  return {
    id: row.analysis_id || row._doc_id,
    timestamp: row['@timestamp'],
    docType: (DOC_TYPES.includes(row.doc_type) ? row.doc_type : 'report') as LlmDocType,
    severity: toSeverity(row.severity),
    confidence: CONFIDENCE.includes(row.confidence) ? (row.confidence as LlmAnalysis['confidence']) : undefined,
    intent: row.intent,
    summary: row.summary,
    sessionId: opt(row.session_id),
    payloadSha256: opt(row.payload_sha256),
    srcIp: opt(row.src_ip),
    model: row.model,
    behaviors: row.behaviors,
    error: opt(row.error),
  }
}

/** GET /api/v1/llm-search?q → SemanticSearchResult. Hits have no
 * `_doc_id` — the search returns `_source` plus `_score` — so the id is
 * `analysis_id`; a null ES score reads as 0. `foreign_embeddings` and
 * `note` are the backend telling an operator why an available search came
 * back empty, and the page type has no field for either, so they are
 * dropped (a GAP, listed in the PR). */
export function toSemanticSearch(r: LlmSearchResponse): SemanticSearchResult {
  if (!r.available) return { available: false, reason: r.reason }
  return {
    available: true,
    hits: r.hits.map((h) => ({
      id: h.analysis_id,
      score: h.score ?? 0,
      severity: toSeverity(h.severity),
      summary: h.summary,
      sessionId: opt(h.session_id),
    })),
  }
}

// ---- Agent campaigns -------------------------------------------------------

/** GET /api/v1/store/agent-campaigns row → AgentCampaign.
 *
 * Every field is required on the wire, so nothing here is defaulted.
 * `sourceIndex` is the event's `source_index`, which is absent or ""
 * on documents (and backends) from before APIARY #3696; the page degrades. */
export function toAgentCampaign(row: AgentCampaignRow): AgentCampaign {
  return {
    id: row.campaign_id,
    timestamp: row['@timestamp'],
    start: row.start,
    end: row.end,
    severity: toSeverity(row.severity),
    categories: row.matched_categories,
    identifiers: row.correlation_identifiers,
    eventCount: row.event_count,
    events: (row.events ?? []).map((e) => ({
      eventId: e.event_id,
      sourceIndex: e.source_index ?? '',
      timestamp: e.timestamp,
      matchedRules: (e.matched_rules ?? []).map((m) => ({
        rule: m.rule,
        reason: m.reason,
        trustBoundary: m.trust_boundary,
        decodeChain: m.decode_chain.map((d) => ({ transform: d.transform, inputSha256: d.input_sha256, outputSha256: d.output_sha256, outputLen: d.output_len })),
      })),
    })),
  }
}

// ---- Auth-failure events ---------------------------------------------------

/** GET /api/v1/store/auth-events row → AuthFailure. */
export function toAuthFailure(row: AuthEventRow & { _doc_id: string }): AuthFailure {
  // username and redirect_uri are nested under `details` by the
  // auth-events-worker, not at the top level.
  const details = row.details ?? {}
  return {
    id: row.event_id || row._doc_id,
    timestamp: row['@timestamp'],
    type: row.type,
    ip: opt(row.ip_address),
    error: row.error ?? '',
    username: opt(details.username),
    clientId: row.client_id ?? '',
    realm: row.realm,
    redirectUri: opt(details.redirect_uri),
    userId: opt(row.user_id),
  }
}