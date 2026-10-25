// Wire shapes of the operations slice (#77) — sensors, alerts, source &
// pipeline health, fleet topology, dead letters and problem reports — as
// the Rust tier serializes them. Typed from the serde structs and `json!`
// literals in backend-service: sensors.rs, stores.rs, health.rs,
// topology.rs, services_control.rs, problem_reports.rs,
// webhook_delivery.rs, worker.rs. Snake_case as on the wire, except where
// the Rust struct says `rename_all = "camelCase"` (topology.rs ExposedPort,
// SensorRow, StackRow) — noted per type.
//
// ../contracts/events is NOT reused for the sensor-event list: that
// endpoint serves sensors.rs `SensorEvent` (the sensor's own fields,
// untouched), not events.rs `EventRow`. Reuse it where the endpoint really
// does serve an `EventRow` (see ../adapters/events).
//
// GET /api/v1/services is NOT declared here either: one endpoint, one wire.
// It lives in ./settings, next to the services adapter that serves it, and
// ../adapters/operations imports it from there — the topology mapper consumes
// the same wire (it reads `exit_code` off a container row) but is a separate
// consumer, not a second author of the shape.

// ---- Sensors ---------------------------------------------------------------

/** sensors.rs `MailoneySession`, one row of `GET /api/v1/sensors`.
 *
 * Note the endpoint is a bundle of three sensors' bespoke views
 * (`SensorDetail { mailoney, http_requests, tanner }`), not a row about
 * the sensor named in the path. Fields are `unwrap_or("")`-built, so "" is
 * absent throughout. */
export interface MailoneySessionWire {
  session_id: string
  when: string
  ip: string
  port: number
  logged_in: boolean
  user: string
  pass: string
  mail_from: string[]
  rcpt_to: string[]
  body_size: number
  truncated: boolean
  body_path: string
  body_preview: string
}

/** sensors.rs `HttpRequest`. `password` is GONE from this response
 * rather than blanked (#3213), and the three credential axes replace it;
 * `credential_present` is `Option<bool>` and stays `null` when the sensor
 * never said, which is not the same answer as false. */
export interface HttpRequestWire {
  id: string
  when: string
  ip: string
  method: string
  host: string
  path: string
  query: string
  user_agent: string
  headers: Record<string, string>
  body: string
  username: string
  credential_status: string
  credential_present: boolean | null
  credential_indicator_match: boolean
  auth_outcome: string
  auth_type: string
  status: number
  category: string
  tarpitted: boolean
  tarpit_bytes: number
  tarpit_ms: number
}

export interface TannerRequestWire {
  id: string
  when: string
  ip: string
  method: string
  path: string
  user_agent: string
  headers: Record<string, string>
  username: string
  password: string
  tarpitted: boolean
  tarpit_bytes: number
  tarpit_ms: number
  post_data: Record<string, string>
  cookies: Record<string, string>
  detection_name: string
  detection_payload: string
}

/** GET /api/v1/sensors — the curated views for the three sensors that
 * predate the catalog (mailoney, http-honeypot, tanner). Caps:
 * MAILONEY_SESSION_CAP 150, REQUEST_CAP 300, 48h window. */
export interface CuratedSensorsWire {
  mailoney: MailoneySessionWire[]
  http_requests: HttpRequestWire[]
  tanner: TannerRequestWire[]
}

/** GET /api/v1/sensors/catalog — every sensor that produced an event in
 * `window` (now-14d), busiest first. A terms aggregation, so a sensor
 * added next week appears by construction. `last_seen` is the ISO form
 * (`value_as_string`), never the epoch-millis `value`. */
export interface SensorCatalogWire {
  window: string
  sensors: Array<{ sensor: string; events: number; last_seen: string }>
}

/** sensors.rs `SensorEvent`: one row of
 * GET /api/v1/sensors/{sensor}/events?limit=200 (limit clamped 1..1000,
 * default 200, 48h window). `fields` is the raw `honeypot` object as that
 * sensor wrote it — dynamic by nature, so only "the sensor's own fields"
 * is asserted, not its keys. `dst_port` falls back to `honeypot.port` for
 * the Go sensors. NOT an events.rs EventRow: no pivots, no country, no
 * session. */
export interface SensorEventWire {
  id: string
  when: string
  src_ip: string
  src_port: number
  dst_port: number
  fields: Record<string, unknown>
}

export interface SensorEventsWire {
  sensor: string
  total: number
  rows: SensorEventWire[]
}

/** sensors.rs `SensorSummaryRow` — one leaderboard row; `key` is a string
 * even for the numeric buckets (`rows_of` stringifies a non-string key). */
export interface SensorSummaryRowWire {
  key: string
  count: number
}

/** sensors.rs `TopList`: a leaderboard in the sensor's own terms. Empty
 * lists are dropped server-side, so every list here has rows. */
export interface TopListWire {
  label: string
  rows: SensorSummaryRowWire[]
}

/** sensors.rs `SensorMeasure`. `unit` is one of "duration_ms",
 * "duration_s", "bytes", "count" — how to render it. Measures whose sum
 * is 0 are dropped server-side. */
export interface SensorMeasureWire {
  label: string
  total: number
  max: number
  unit: string
}

/** GET /api/v1/sensors/{sensor}/overview — a bundle, not a row: volume,
 * freshness, two generic leaderboards, the sensor's own leaderboards
 * (`top_lists`, chosen per sensor by `top_fields_for`) and the quantities
 * only that sensor measures (`measures`). `hourly` is a bare doc-count
 * series, oldest first, over `window` (now-7d) — no bucket timestamps
 * come with it. */
export interface SensorOverviewWire {
  sensor: string
  window: string
  events: number
  unique_sources: number
  first_seen: string
  last_seen: string
  hourly: number[]
  top_sources: SensorSummaryRowWire[]
  top_countries: SensorSummaryRowWire[]
  top_lists: TopListWire[]
  measures: SensorMeasureWire[]
}

// ---- Alerts ----------------------------------------------------------------

/** A dashboard-alert-state-v1 document as GET /api/v1/alerts?offset&size
 * returns it: stores.rs `store_page` passes `_source` through verbatim and
 * adds `_doc_id` (which equals `Key`, the ES doc id the ack endpoint takes).
 *
 * The worker's field set is exactly these (worker.rs Notifier::observe):
 * Key/Message/Link/FirstSeen/LastSeen/Count/Acknowledged, plus LastNotified,
 * which is `null` until the first notification and stays null for
 * mark-only alerts. There is no severity and no acknowledger on the
 * document. `Key` is "<kind>:<discriminator>" (yara:<sha>,
 * pipeline:dead-letters, ot-command:<label>, stale:<sensor>, …). */
export interface AlertStateWire {
  Key: string
  Message: string
  Link: string
  FirstSeen: string
  LastSeen: string
  LastNotified: string | null
  Count: number
  Acknowledged: boolean
  _doc_id: string
}

/** GET /api/v1/alerts?offset&size=100: the generic store page (rows capped
 * at 100 per page, sorted LastSeen desc with a _doc tiebreak). */
export interface AlertPageWire {
  total: number
  rows: AlertStateWire[]
}

/** POST /api/v1/alerts/{key}/ack body (stores.rs AckBody). Not bare: the
 * ack direction is in the body, so one call reopens as well as
 * acknowledges. `ack` is required — no serde default. */
export interface AckAlertBody {
  ack: boolean
}

/** The ack response; echoes what was stored. */
export interface AckAlertWire {
  ok: boolean
  key: string
  ack: boolean
}

// ---- Source & pipeline health ---------------------------------------------

/** webhook_delivery.rs `Attempt::to_doc` — one delivery outcome, as it is
 * embedded in `last_success` / `last_failure`. `error` is null on success;
 * `http_code` is null when the attempt failed below the HTTP layer. */
export interface WebhookAttemptWire {
  at: string
  status: string
  http_code: number | null
  latency_ms: number
  tries: number
  error: string | null
}

/** webhook_delivery.rs `DeliveryHealth`. `available: false` means the
 * RECORD could not be read — not that nothing was ever delivered; that
 * ambiguity is why `reason` exists. `state` is disabled / idle / healthy /
 * degraded / failing / unknown. `target` is the webhook's origin only. */
export interface DeliveryHealthWire {
  available: boolean
  reason: string
  state: string
  target: string
  messages: number
  consecutive_failures: number
  failure_threshold: number
  last_success: WebhookAttemptWire | null
  last_failure: WebhookAttemptWire | null
  updated_at: string
}

/** health.rs `SourceHealth` — GET /api/v1/source-health, the page behind
 * "Source & pipeline health". Two pages read it and both want different
 * slices: the health page wants the whole document, the topology page
 * only `sensors`.
 *
 * - `cluster_status` is whatever Elasticsearch reported, or the string
 *   "unreachable" / "unknown" when it could not be asked (es.rs
 *   cluster_status) — not only the three colours.
 * - `sensors[].state` is ACTIVE / QUIET / STALE, judged against each
 *   sensor's own typical rate (#1931), capped between 1 h and 14 d.
 * - `ingest.state` is healthy / delayed (>2 min) / stale (>15 min) /
 *   unknown; `age_seconds` is -1 when unknown.
 * - `pipeline.state` is "disabled" (no FILEBEAT_URL), "unreachable", a
 *   bare HTTP status string (e.g. "503 Service Unavailable"), or
 *   "healthy".
 * - `dead_letters` is the all-time count, `ingest.recent_dead_letters`
 *   the last-24h one. */
export interface SourceHealthWire {
  cluster_status: string
  total_documents: number
  sensors: Array<{ sensor: string; documents: number; last_seen: string; state: string }>
  yara: { enabled: boolean; last_scan: string; rules_sha256: string; samples: number; matched: number; errors: number }
  runtime: { uptime_seconds: number; rss_bytes: number; vm_bytes: number }
  ingest: { state: string; last_ingest: string; age_seconds: number; recent_dead_letters: number }
  dead_letters: number
  pipeline: { state: string; acked: number; failed: number; dropped: number; active: number; decode_failures: number }
  webhook: DeliveryHealthWire
  unattributed_24h: number
}

// ---- Fleet topology --------------------------------------------------------

/** topology.rs `ExposedPort` (`rename_all = "camelCase"`). `public === 0`
 * means the port is not reachable from the internet at all — tunnel-only
 * management. `proxy` is PROXY protocol v1 appended upstream, the only
 * way these sensors see a real client address. */
export interface ExposedPortWire {
  proto: string
  public: number
  host: number
  proxy: boolean
}

/** topology.rs `SensorRow` (`rename_all = "camelCase"`, so `rawIndex` is
 * the only renamed field — `stack`, `containers`, `ingress`, `hostnames`
 * and `ports` are already single words). Static configuration, assembled
 * from a const table rather than queried, so it is identical on every
 * call. `ingress` values are "traefik" / "portbridge" / "tunnel-only".
 * `rawIndex` is "unmapped" for a sensor no raw family claims. */
export interface TopologySensorWire {
  sensor: string
  stack: string
  containers: string[]
  ingress: string[]
  hostnames: string[]
  ports: ExposedPortWire[]
  rawIndex: string
}

/** topology.rs `FlowGraph`. Nodes carry the DAG's layer so the client can
 * lay it out; links carry NO weight — this is the fleet's SHAPE, not a
 * volume map (the dashboard draws every declared edge once). */
export interface TopologyFlowWire {
  nodes: Array<{ name: string; layer: number }>
  links: Array<{ source: string; target: string }>
}

/** topology.rs `StackRow` (`rename_all = "camelCase"`) and
 * `ContainerRef`. `adapter_visible` false means the container is outside
 * the services adapter's allowlist, so no live state exists for it —
 * which is not the same as stopped.
 *
 * `ContainerRef` is a separate struct with no `rename_all` of its own (serde
 * applies it per struct, not to nested ones), so its key is snake_case even
 * though the rows around it are camelCase. The canonical frontend reads
 * `adapter_visible` (routes/topology.tsx). */
export interface TopologyStackWire {
  stack: string
  containers: Array<{ name: string; adapter_visible: boolean }>
}

/** GET /api/v1/topology — static fleet shape only; liveness is joined
 * from /api/v1/source-health and /api/v1/services. */
export interface TopologyWire {
  generated_at: string
  sensors: TopologySensorWire[]
  flow: TopologyFlowWire
  stacks: TopologyStackWire[]
}

// ---- Dead letters ----------------------------------------------------------

/** GET /api/v1/store/dead-letters?offset&size&q — stores.rs
 * `generic` over dead-letter-honeypot, `_source` passed through with
 * `_doc_id` added. `q` is a Lucene `query_string` with
 * `default_operator: AND`.
 *
 * UNVERIFIED — nothing in this repo writes these documents (Elasticsearch's
 * own non-indexable/rejected ingest does), so which keys a row carries is
 * not established here. Typed as the open record the store really returns,
 * with the two reason keys and the two source keys the canonical frontend
 * reads (`reason`/`error`, `logset`/`pipeline`) marked optional. Everything
 * else stays `Record<string, unknown>` and is passed through as the row's
 * document. */
export interface DeadLetterWire extends Record<string, unknown> {
  _doc_id: string
  '@timestamp'?: string
  reason?: string
  error?: string
  logset?: string
  pipeline?: string
}

/** DELETE /api/v1/store/dead-letters?q= — the same `q` scope the GET
 * searched, so the purge is exactly what the operator was looking at (an
 * absent/empty q purges every retained dead letter).
 *
 * `deleted` is a COUNT here, read out of Elasticsearch's `_delete_by_query`
 * response, not a deleted id. (The report store's `{deleted: id}` is a
 * different endpoint's envelope; contracts/reports.ts.) */
export interface PurgeDeadLettersWire {
  deleted: number
}

// ---- Problem reports -------------------------------------------------------

/** One captured step of a dashboard-problem-reports-v1 document, as
 * problem_reports.rs writes it: the detail is redacted before storage. */
export interface ActionTrailEntryWire {
  at: string
  kind: string
  detail: string
}

/** One captured API call. `url` has every query-string value replaced with
 * [redacted] unconditionally, before storage; the bodies are redacted
 * text and are deliberately NOT included here — nothing in this slice
 * reads them (see the slice's gaps). */
export interface ApiCallWire {
  at: string
  method: string
  url: string
  status: number
}

/** A problem-report row. `dom_snapshot` is EXCLUDED from every list
 * response (stores.rs store_config excludes it), so a client can never
 * tell from a row whether a snapshot is attached. `status` is one of
 * "open", "triaged", "closed" (problem_reports.rs VALID_STATUSES) — the
 * only statuses the PATCH accepts. */
export interface ProblemReportWire {
  id: string
  submitted_at: string
  submitted_by: string
  submitted_by_name: string
  page: string
  expected: string
  actual: string
  action_trail: ActionTrailEntryWire[]
  console_errors: string[]
  network_failures: string[]
  api_calls: ApiCallWire[]
  user_agent: string
  status: string
  _doc_id: string
}

/** GET /api/v1/store/problem-reports?offset&size=25, sorted
 * `submitted_at` desc with a _doc tiebreak. */
export interface ProblemReportPageWire {
  total: number
  rows: ProblemReportWire[]
}

/** PATCH /api/v1/problem-reports/{id} body (problem_reports.rs
 * StatusPatch). Single-field and required — this is the only mutation an
 * existing report ever gets, and the handler 400s on anything outside
 * open/triaged/closed, so there is no partial-update semantics to worry
 * about. Responds 204 No Content. */
export interface ProblemStatusBody {
  status: 'open' | 'triaged' | 'closed'
}
