// Wire shapes of the Monitor slice (#74): Overview, ML anomalies, LLM
// analysis, agent campaigns, auth-failure events. Typed from backend-service
// (stores.rs store_page/campaigns/payloads, overview.rs kpis, dashboard.rs
// dashboard, config.rs get_config, llm_search.rs search, detail.rs
// ml_anomaly_ack/ack_all/acks/stats/disposition, ml_health.rs list) and from
// the workers that write the store rows (ml-worker worker.py write_anomaly,
// llm-worker worker.py base_document, auth-events-worker worker.py redact,
// agent_intrusion.rs build_campaign_verdict). Event rows live in ./events.
// Snake_case as on the wire.
//
// The store rows are raw Elasticsearch `_source` documents written by those
// workers, outside backend-service. Their row types below cover only the
// fields the canonical frontend reads (frontend-next routes/*.tsx,
// lib/mlGrouping.ts); a field is optional only where the writer can leave it
// out or null — an absent key, a Python `None`, or an explicit ES null all
// arrive as a missing/empty value. Fields backend-service itself builds are
// required: their structs set every one.

/** GET /api/v1/store/{name} and the paged store lists (/campaigns,
 * /payloads, /attackers, …): stores.rs store_page → `json!({total, rows})`.
 * Each row is the hit's `_source` with `_doc_id` (the ES `_id`) added by
 * stores_page_excluding, which is what a row-level action like the ML
 * anomaly ack keys on. `size` is clamped to 100 (`q.size.min(100)`); `q` is
 * a Lucene `query_string` with `default_operator: AND`. */
export interface StorePage<TRow> {
  total: number
  rows: Array<TRow & { _doc_id: string }>
}

// ---- Overview --------------------------------------------------------------

/** overview.rs `HourlyByProtocol`: one hour of the protocol timeline. `hour`
 * is the start of the hour, UTC, ISO 8601 with milliseconds. `counts` always
 * carries the same keys (the window's top five protocols, then `other`),
 * zero-filled, so a chart can use each key as a stable series. */
export interface HourlyByProtocol {
  hour: string
  total: number
  counts: Record<string, number>
}

/** GET /api/v1/overview/kpis: overview.rs `OverviewKpis`, a
 * backend-built struct with every field set on both the rollup and the
 * live-aggregation path. `change24h` is a percent string like "+41%" and is
 * "" while the previous window was empty. `hourly` is the 24-bucket
 * sparkline, oldest first. `ready` is false while the rollup index has not
 * covered the window yet. `sessions_24h` is an upper bound (one session seen
 * under two session-id fields counts twice) and `sessions_previous24h` is
 * the same count over the day before. */
export interface OverviewKpis {
  total: number
  last24h: number
  previous24h: number
  change24h: string
  unique_ips: number
  /** Events per hour, oldest → newest. */
  hourly: number[]
  logins: number
  sessions_24h: number
  sessions_previous24h: number
  /** The same 24 hours as `hourly`, oldest first, split by protocol. */
  hourly_by_protocol: HourlyByProtocol[]
  ready: boolean
}

/** The `?parts=` names of GET /api/v1/overview/dashboard (dashboard.rs
 * `SLICES`). An absent or empty `parts` means every slice; an unknown name
 * is ignored. These are the 18 names the handler knows — not the response
 * keys, which are the same strings. */
export type DashboardPart =
  | 'sensors'
  | 'protocols'
  | 'top_ports'
  | 'countries'
  | 'asns'
  | 'providers'
  | 'top_ips'
  | 'top_paths'
  | 'logins'
  | 'heatmap'
  | 'map_points'
  | 'top_creds'
  | 'top_commands'
  | 'clients'
  | 'fingerprints'
  | 'alerts'
  | 'alert_cats'
  | 'payloads'

/** dashboard.rs `Kv`: one terms-aggregation bucket. `key` is a string for
 * every field, including the numeric ones (key_string stringifies ints).
 * `link` is the backend's drill-down URL. */
export interface DashboardKv {
  key: string
  count: number
  link: string
}

/** dashboard.rs `HeatCell`. `pct` is 0-100 intensity relative to the row's
 * own maximum, not the sheet's. */
export interface HeatCell {
  label: string
  count: number
  pct: number
}

/** dashboard.rs `HeatRow`. */
export interface HeatRow {
  sensor: string
  cells: HeatCell[]
}

/** dashboard.rs `MapPoint`. `ips` is the distinct-address count in that
 * city; `url` is the backend's marker drill-down (city-scoped since #2045,
 * country-only when the city is empty). */
export interface DashboardMapPoint {
  city: string
  country: string
  lat: number
  lon: number
  events: number
  ips: number
  url: string
}

/** dashboard.rs `PayloadRow`. `download` is the destination path/URL the
 * attacker tried to write, `vt` the VirusTotal lookup link. */
export interface DashboardPayloadRow {
  shasum: string
  download: string
  count: number
  link: string
  vt: string
}

/** dashboard.rs `SensorFeed`. `state` is serialized as a bare string and is
 * one of three values the handler computes from the sensor's age:
 * "active" under 5 minutes, then "quiet", then "stale". */
export interface DashboardSensorFeed {
  name: string
  count: number
  last_seen: string
  state: 'active' | 'quiet' | 'stale'
}

/** GET /api/v1/overview/dashboard: dashboard.rs `Dashboard`. Every key is
 * always present and never null — a slice the caller did not ask for is
 * stripped from the aggregation response and serializes as its empty form
 * ([] for the lists, 0 for `logins`). This is the one non-`Option` struct in
 * the slice, so `?parts=` is expressed as empty siblings rather than as
 * absent keys. */
export interface Dashboard {
  protocols: DashboardKv[]
  top_ports: DashboardKv[]
  countries: DashboardKv[]
  /** key = "AS<n> <org>". */
  asns: DashboardKv[]
  providers: DashboardKv[]
  top_ips: DashboardKv[]
  top_paths: DashboardKv[]
  /** key = "user / pass": pairs, not separate usernames and passwords. */
  top_creds: DashboardKv[]
  top_commands: DashboardKv[]
  clients: DashboardKv[]
  fingerprints: DashboardKv[]
  alerts: DashboardKv[]
  alert_cats: DashboardKv[]
  payloads: DashboardPayloadRow[]
  logins: number
  heatmap: HeatRow[]
  map_points: DashboardMapPoint[]
  sensors: DashboardSensorFeed[]
}

/** GET /api/v1/campaigns?size=15: stores.rs `campaigns`, which is the same
 * campaigns-v1 store `/attackers`-style paging serves — a raw `_source`
 * written by correlator.rs `score_campaigns` as one serde-free `json!`
 * literal, so every key is present. Typed here as the subset the overview's
 * campaign summary reads; the full row (score, ports, creds, …) is typed in
 * ./sources as `CampaignWire`, which #76 already covers. `cidr`, `events`,
 * `unique_ips`, `sensors` and `last` are all set unconditionally by the
 * correlator — `sensors` and `last` included. */
export interface CampaignRow {
  cidr: string
  score: number
  events: number
  unique_ips: number
  sensors: string[]
  ports: string[]
  first: string
  last: string
}

/** GET /api/v1/payloads?size=15: stores.rs `payloads`. `rows` are raw
 * `_source` of dashboard-payload-inventory-v1 documents, whose shape this
 * slice does not depend on (the overview reads only `total`), so they are
 * left untyped. `source_buckets` / `source_other` appear only when the
 * request asks for `?aggs=sources`; the canonical overview does not. */
export interface PayloadsPage extends StorePage<Record<string, unknown>> {
  source_buckets?: Array<{ key: string; doc_count: number }>
  source_other?: number
}

/** The presentation block of a dashboard-config-v1 document, as
 * config.rs `PRESENTATION_TEXT_LIMITS` and `validate_presentation` know it.
 * Every key is optional: the stored document is whatever the operator last
 * wrote, and GET /config on a never-configured deployment returns
 * `{revision: 0, payload: {}}` with no presentation block at all. The
 * backend validates length and type on write but never fills a default. */
export interface Presentation {
  dashboard_title?: string
  dashboard_subtitle?: string
  footer_text?: string
  banner_text?: string
  /** "" or one of info/success/warning/danger; anything else is refused
   * on write, so a stored value is always one of those. */
  banner_severity?: string
}

/** GET /api/v1/config: config.rs `get_config`, the stored
 * dashboard-config-v1 document verbatim. `revision` and `payload` are
 * always present (the synthesized empty document carries both);
 * `schema_version` and `updated` appear only once something has been
 * written. `payload` is the section map — presentation, behavior,
 * honeypot, report-presets — so its members stay open. */
export interface ConfigDoc {
  revision: number
  schema_version?: number
  updated?: string
  payload: { presentation?: Presentation; [key: string]: unknown }
  [key: string]: unknown
}

// ---- ML anomalies ----------------------------------------------------------

/** The three verdicts detail.rs `DISPOSITION_STATUSES` recognizes, plus
 * the "open" the retraction path accepts. `acknowledged` is NOT a
 * disposition: it lives only in the ack sidecar, never in `status`. */
export type MlDisposition = 'false_positive' | 'true_positive' | 'benign_known'
export type MlStatus = 'open' | MlDisposition

/** One ml-anomalies `_source`, as ml-worker `write_anomaly` builds it.
 *
 * Every key is written on every anomaly the worker emits, so the optional
 * markers below are not "the backend might omit this" — they are Python
 * `None` reaching Elasticsearch. Python writes JSON null and the ES
 * `update` in `write_anomaly` replaces the whole document, so an absent
 * detector, an unmatched address or an unparsed port is a stored null,
 * not a missing key. `status` is set to "open" by the worker on first
 * write and only the dashboard's partial-update changes it afterwards
 * (the worker reads the existing disposition back and preserves it). */
export interface MlAnomalyRow {
  '@timestamp': string
  severity: string
  composite_score: number
  /** Exactly what each detector expressed: a detector that did not fire
   * is a stored null, not a 0.0 (ml-worker #1969). A key can also be
   * absent on a document written by an older worker or a replay, so both
   * shapes are typed. */
  model_scores?: Record<string, number | null> | null
  explanation: string
  /** null when the source hit had no address to resolve. */
  src_ip: string | null
  src_country: string | null
  /** Number when the port parsed, string when the sensor wrote it as
   * text; null when neither. */
  src_port: number | string | null
  dst_ip: string | null
  dst_port: number | string | null
  proto: string | null
  sensor: string | null
  /** `event.category` on the source hit. */
  event_type: string | null
  community_id: string | null
  source_event_id: string
  source_index: string
  alert_threshold: number
  /** null until a detector checkpoint trio has been promoted. */
  model_state_id: string | null
  /** "open" or one of the dispositions. */
  status?: MlStatus
  disposition_reason?: string | null
  disposition_by?: string | null
  disposed_at?: string | null
  [key: string]: unknown
}

/** POST /api/v1/ml-anomalies/ack body (detail.rs `MlAckBody`). `key` is
 * the anomaly's `_doc_id` and must be non-blank (400 otherwise). `ack`
 * has no default, so it must be sent. `actor` is `#[serde(default)]`. */
export interface MlAckRequest {
  key: string
  ack: boolean
  actor?: string
}

/** POST /api/v1/ml-anomalies/ack response — the ack sidecar document
 * (dashboard-ml-anomaly-ack-v1) that detail.rs `write_ml_ack` wrote,
 * PascalCase as that json! literal builds it. The same object is the value
 * under a key in the GET /acks ledger. `AckedBy` is "" when no actor was
 * sent; `AckedAt` is RFC 3339. */
export interface MlAckRecord {
  Key: string
  Acknowledged: boolean
  AckedBy: string
  AckedAt: string
}

/** POST /api/v1/ml-anomalies/ack-all body (detail.rs `MlAckAllBody`).
 * The handler takes `Json<MlAckAllBody>`, so a JSON body is required even
 * though every field has a default — send `{}` at minimum. There is no
 * `key`: the sweep is every open anomaly in the whole index. */
export interface MlAckAllRequest {
  actor?: string
}

/** POST /api/v1/ml-anomalies/ack-all response. */
export interface MlAckAllResponse {
  changed: number
}

/** GET /api/v1/ml-anomalies/acks: the whole sidecar, keyed by document id
 * (= the anomaly's `_doc_id`). A key is present for every written ack,
 * including un-acks (`Acknowledged: false`). */
export type MlAcks = Record<string, MlAckRecord>

/** GET /api/v1/ml-anomalies/stats: detail.rs `ml_anomaly_stats`. `total`
 * is the all-time document count and `open` is that total minus the union
 * of dispositioned and acknowledged ids — so `open` is an all-time
 * backlog, not a window. */
export interface MlAnomalyStats {
  total: number
  open: number
}

/** POST /api/v1/ml-anomalies/disposition body (detail.rs
 * `MlDispositionBody`). `key` must be non-blank and `status` must be in
 * the closed set or the handler answers 400. `open` is the retraction.
 * `reason` and `actor` are `#[serde(default)]`. */
export interface MlDispositionRequest {
  key: string
  status: MlStatus
  reason?: string
  actor?: string
}

/** POST /api/v1/ml-anomalies/disposition response. `disposed_at` is a
 * fresh RFC 3339 stamp even for the "open" retraction, where the stored
 * document instead gets null metadata. */
export interface MlDispositionResponse {
  key: string
  status: MlStatus
  disposed_at: string
}

/** One entry of GET /api/v1/ml-health: ml_health.rs `ModelHealth`, built
 * by the handler from a top_hits sub-aggregation and `unwrap_or` on every
 * field — so every key is present, with "" / false / 0.0 / 0 for a source
 * document that lacks it. */
export interface MlModelHealth {
  model: string
  timestamp: string
  accepted: boolean
  reason: string
  anomaly_rate_new: number
  anomaly_rate_previous: number
  train_samples: number
}

// ---- LLM analysis ----------------------------------------------------------

/** One llm-analysis `_source`, as llm-worker `base_document` builds it:
 * every key of that literal is written on every analysis, so `doc_type`,
 * `confidence`, `severity` and the rest are present-but-possibly-empty
 * strings rather than absent. `doc_type` is "session" for a session
 * analysis, "payload" for a captured sample, and "error" for the failure
 * record `record_error` writes — the last is not one of the three
 * document types the page models, and maps to `report` (see the adapter).
 */
export interface LlmAnalysisRow {
  '@timestamp': string
  analysis_id: string
  doc_type: string
  session_id: string
  payload_sha256: string
  src_ip: string | null
  model: string
  summary: string
  intent: string
  behaviors: string[]
  severity: string
  confidence: string
  error: string
  [key: string]: unknown
}

/** GET /api/v1/llm-search?q=: llm_search.rs `search`. Always HTTP 200.
 * A hit is the analysis `_source` with the `embedding` field excluded by
 * the knn body, plus the ES `_score` spliced in as `score` (null on a
 * filter-only match). The empty-but-configured case is
 * `available: true, hits: []`, plus `foreign_embeddings` and a `note`
 * when the index holds embeddings from another model (#2117) — that is
 * still available, not a failure. */
export interface LlmSearchHit extends LlmAnalysisRow {
  score: number | null
}

export type LlmSearchResponse =
  | {
      available: true
      hits: LlmSearchHit[]
      foreign_embeddings?: number
      note?: string
    }
  | { available: false; reason: string }

// ---- Agent campaigns -------------------------------------------------------

/** One matched criticality rule inside an agent-campaign event
 * (agent_intrusion.rs `build_campaign_verdict`). `trust_boundary` is
 * `criticality_rules::TRUST_BOUNDARIES[rule]` and is "" for a rule the
 * table does not name. `decode_chain` is always written — an empty list
 * for a rule that decodes nothing. */
export interface AgentCampaignMatchedRule {
  rule: string
  reason: string
  trust_boundary: string
  decode_chain: AgentCampaignDecodeStep[]
}

/** agent_intrusion.rs `DecodeStep`. */
export interface AgentCampaignDecodeStep {
  transform: string
  input_sha256: string
  output_sha256: string
  output_len: number
}

/** One event inside an agent-campaign verdict. `source_index` is the
 * `_index` of the hit the event came from (APIARY #3696); documents stored
 * before that change carry `""` until rewritten, and the page degrades to an
 * `_id`-only history query for those. `matched_rules` is always present
 * (possibly empty). */
export interface AgentCampaignEvent {
  event_id: string
  source_index: string
  timestamp: string
  matched_rules?: AgentCampaignMatchedRule[]
}

/** One agent-intrusion-campaigns `_source` (agent_intrusion.rs
 * `build_campaign_verdict`). Every key of that `json!` literal is written
 * unconditionally, including `@timestamp`, `campaign_id`, `start`, `end`,
 * `severity`, the two sorted lists and `event_count` — so this row is
 * required, not optional, even though the writer lives outside
 * backend-service. `severity` is only ever "high" or "critical": the
 * writer returns None for anything else, so no document is ever written
 * for a softer campaign. */
export interface AgentCampaignRow {
  '@timestamp': string
  campaign_id: string
  start: string
  end: string
  severity: string
  matched_categories: string[]
  correlation_identifiers: string[]
  event_count: number
  events?: AgentCampaignEvent[]
  [key: string]: unknown
}

// ---- Auth-failure events ---------------------------------------------------

/** The Keycloak `details` keys auth-events-worker `DETAILS_ALLOWLIST`
 * keeps. `username` and `redirect_uri` are two of them — the two fields
 * the auth-failure page has and the row's top level does not. Every key of
 * the object is written (an empty one when Keycloak sent no details), but
 * each value is a single `str()` on the canonical frontend, and Keycloak
 * itself leaves `redirect_uri` unset on most event types. */
export interface AuthEventDetails {
  username?: string
  redirect_uri?: string
  auth_method?: string
  auth_type?: string
  code_id?: string
  selected_credential_id?: string
  [key: string]: unknown
}

/** One auth-failure-events `_source`, as auth-events-worker `redact`
 * builds it from a Keycloak admin-API event. Every key of that literal is
 * written, so this row is required — but `client_id`, `user_id`,
 * `ip_address` and `error` come from `event.get(...)` on a Keycloak
 * response and are Python `None` whenever Keycloak omitted them, which
 * reaches Elasticsearch as null. `details` is always an object. */
export interface AuthEventRow {
  '@timestamp': string
  event_id: string
  type: string
  realm: string
  client_id: string | null
  user_id: string | null
  ip_address: string | null
  error: string | null
  details?: AuthEventDetails
  [key: string]: unknown
}