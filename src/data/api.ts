// The real backend behind the events & sessions slice (#75): the APIARY
// Rust tier (backend-service), fetched over the same shared service token
// this tier already presents on /metrics, and mapped with the adapters that
// shipped in #167. Server-only; the browser never loads it.
//
// The mock stays the default. `runForRequest` (src/data/backend.ts) routes
// here only when the page carries no `?mock=` AND this process has
// BACKEND_URL set; every mock scenario, and every query this module does
// not implement, still answers from the mock — which is what keeps the ten
// scenarios and the browser checks working.
//
// Base URL and token: the same two variables the canonical BFF reads
// (frontend-next/src/lib/backend.server.ts `backendURL()` and the
// `x-service-token` header), so one deployment configures both tiers.
// BACKEND_URL is also the opt-in: unset means "this tier talks to nobody",
// which is the default. The token is never logged, never in a URL, and
// never in an error message — it only ever rides as a request header.
import { AsyncLocalStorage } from 'node:async_hooks'
import { ApiError, NOT_YET } from './errors'
import { ACTOR_ASSERTION_HEADER, actorOf as sessionIdentityOf, mintActorAssertion } from '#/server/actorAssertion'
import {
  commandsQuery,
  eventDetail,
  eventsQuery,
  eventsQueryWindowed,
  filterValues,
  recordingRows,
  replayDetail,
  searchGroups,
  sessionDetail,
} from './adapters/explorer'
import { toHoneypotEvent } from './adapters/events'
import {
  mlAckBody,
  mlDispositionBody,
  toAckAllCount,
  toAckedCount,
  toAgentCampaign,
  barRows,
  overviewSources,
  pieRows,
  seriesPoints,
  toAuthFailure,
  toCountRows,
  toLlmAnalysis,
  toMlAnomalies,
  toModelHealth,
  toOpenBacklog,
  toOverviewKpis,
  toOverviewViews,
  toPayloadCount,
  toSemanticSearch,
  toSeverity,
} from './adapters/monitor'
import type { EventRowGap } from './adapters/events'
import type { SensorEventGap } from './adapters/operations'
import { generateReportResult, generatedReportPage, reportDefinitionBody, reportDefinitions, reportTemplates, savedReportDefinition } from './adapters/reports'
import {
  attackers,
  attackCoverage,
  campaignTimeline,
  correlationGroup,
  credReuse,
  identityFusion,
  infraClusters,
  ipBlockRecord,
  ipProfile,
  killChainFlow,
  activeBlockIps,
  attacker,
  mapPoints,
  MEMBER_LIMIT,
  membersGroup,
  networkCampaign,
  networkCampaigns,
  profileMember,
  sharedSignals,
  sessionSummaries,
  setIpBlockBody,
  sourceCounts,
  sourceProfiles,
  sourceTimeline,
} from './adapters/sources'
import {
  alertAckBody,
  alertPage,
  deadLetters,
  purgedDeadLetters,
  sensorCatalog,
  sensorEvents,
  sensorFeeds,
  sensorOverview,
  sourceHealth,
  topology,
} from './adapters/operations'
import {
  baitCredential,
  canarytokenList,
  canarytokenStorePage,
  canaryImageProblem,
  canaryTokenTypes,
  canaryTriggers,
  createdCanarytoken,
  credentialList,
  decodedBase64Length,
} from './adapters/tools'
import { DEFAULT_PREFERENCES_WIRE, capturedMail, preferences, preferencesPatch, preferencesQuery, preferencesWriteBody, configProblems, configRollbackBody, configSectionBody, configSectionPath, configValidateBody, problemReportBody, problemReports, problemStatusPatch, settingsData, shellConfig } from './adapters/settings'
import type { DashboardViews } from './adapters/monitor'
import { readingOf } from '#/lib/sensorSpecs'
import { authorize } from '#/server/authorize'
import { envInt } from '#/server/admission'
import { recordShed } from '#/server/obs'
import { isRead, READ_ONLY_EXEMPT } from './readOnly'
import {
  analyzerCatalog,
  analyzerInfos,
  artifactRows,
  capeRun,
  capeRuns,
  capturedPayload,
  capturedPayloads,
  createWorkbenchRunBody,
  ghidraAnalysis,
  githubAnalysis,
  githubAnalysisPage,
  gpuJobs,
  gpuQueue as gpuQueueOf,
  payloadAnalysis,
  revDeckRun,
  revDeckRuns,
  sandboxRun,
  savedWorkbenchRecipes,
  workbenchRun,
  workbenchRuns,
  yaraRuns,
} from './adapters/evidence'
import type { ApiErrorKind } from './errors'
import type { EventPageWire, EventsQueryWire, FilterValuesWire, RecordingsPageWire, ReplayWire, SearchResultWire, SessionDetailWire } from './contracts/explorer'
import type { EventRow, EventsPage as EventsPageWire } from './contracts/events'
import type { ChartName, Charts, FlowGraph, Series as SeriesWire } from './contracts/charts'
import type {
  CanaryFiredPageWire,
  CanaryTokenTypeWire,
  CanarytokenListWire,
  CanarytokenStorePageWire,
  CreatedCanarytokenWire,
  CredentialListWire,
  CredentialRecordWire,
} from './contracts/tools'
import type {
  GenerateReportWire,
  GeneratedReportPageWire,
  ReportDeletedWire,
  ReportDefinitionEnvelopeWire,
  ReportDefinitionsWire,
  ReportTemplatesWire,
} from './contracts/reports'
import type {
  AckAlertWire,
  AlertPageWire,
  DeadLetterWire,
  PurgeDeadLettersWire,
  SensorCatalogWire,
  SensorEventsWire,
  SensorOverviewWire,
  SourceHealthWire,
  TopologySensorWire,
  TopologyWire,
} from './contracts/operations'
import type { AuditWire, ConfigHistoryWire, ConfigValidateWire, ConfigWire, MailWire, PreferencesDocWire, PreferencesWire, ProblemReportCreatedWire, ProblemReportsPageWire, ReporterStatsWire, ServiceActionWireResponse, ServicesWire, StorageWire, UsersWire } from './contracts/settings'
import type {
  AgentCampaignRow,
  AuthEventRow,
  Dashboard,
  LlmAnalysisRow,
  LlmSearchResponse,
  MlAckAllResponse,
  MlAckRecord,
  MlAcks,
  MlAnomalyRow,
  MlAnomalyStats,
  MlDispositionResponse,
  MlModelHealth,
  OverviewKpis,
  StorePage,
} from './contracts/monitor'
import type {
  AnalyzerCatalogWire,
  ArtifactListWire,
  CapeRunPageWire,
  CapeRunWire,
  CreateWorkbenchRunWire,
  GhidraRunDetailWire,
  GithubAnalysisPageWire,
  GithubAnalysisSubmitWire,
  GithubAnalysisWire,
  GhidraSubmitWire,
  GpuAbortWire,
  GpuQueueWire,
  PayloadDetailWire,
  PayloadPageWire,
  RevDeckRunPageWire,
  RevDeckRunWire,
  SandboxRunDetailWire,
  SandboxSubmitWire,
  SandboxVncStatusWire,
  WorkbenchRecipeListWire,
  WorkbenchRunEnvelopeWire,
  WorkbenchRunListWire,
  YaraRunPageWire,
} from './contracts/evidence'
import type {
  AttackerEntityWire,
  AttackerPageWire,
  AttckGridWire,
  BlockedIpsWire,
  CampaignPageWire,
  CampaignTimelineWire,
  ClusterCorrelationWire,
  ClusterPageWire,
  CampaignDocWire,
  CidrCorrelationWire,
  IdentityDocWire,
  CredEdgeWire,
  FusionWire,
  IpBlockWire,
  IpProfileWire,
  MapPointsWire,
  SankeyWire,
  SourcesPageWire,
} from './contracts/sources'
import type { Backend, Caller } from './backend'
import type { ClusterEntity, CountRow, EventType, HoneypotEvent, Kpi, MlAnomaly, Paged, Preferences, ScorePoint, Sensor, SensorFields, SessionUser, ShellConfig, SourceProfile } from './types'

/** A dashboard that hangs forever is worse than one that errors. */
const TIMEOUT_MS = envInt('BACKEND_TIMEOUT_MS', 30_000)

/** The bounded queue in front of the fan-out to the Rust tier (canonical
 * `backendLimiter`, #1616): MAX_INFLIGHT calls at once, MAX_QUEUE more wait,
 * anything past that is shed at once as `overloaded` instead of piling up
 * sockets behind a growing queue. The live stream is not counted here — it
 * holds its connection for minutes and has its own gate (api.live.ts). */
const MAX_INFLIGHT = envInt('BACKEND_MAX_INFLIGHT', 25)
const MAX_QUEUE = envInt('BACKEND_MAX_QUEUE', 50)
let inflight = 0
const waiting: Array<() => void> = []

async function limited<T>(endpoint: string, call: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) {
    if (waiting.length >= MAX_QUEUE) {
      recordShed('queue-full')
      throw new ApiError('overloaded', endpoint, { retryAfter: 1 })
    }
    // The releasing call hands its slot over: `inflight` stays counted.
    await new Promise<void>((resolve) => waiting.push(resolve))
  } else inflight++
  try {
    return await call()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else inflight--
  }
}

/** This process has a real backend to talk to. Its absence is the default. */
export const isLiveBackend = (env: NodeJS.ProcessEnv = process.env): boolean => Boolean(env.BACKEND_URL?.trim())

/** The backend's base URL. `mounted` selects the MOUNTED instance — the only
 * container with the host-side sandbox/Ghidra/GitHub-analysis request-spool
 * mounts (canonical `backendMountedURL()` L76, compose's
 * backend-service-mounted). Same image, same route table; the only difference
 * is which container can see those spools. A sandbox/ghidra/github route
 * answered by the REGULAR instance comes back "not configured"/empty rather
 * than erroring, so every such call below is routed with `mounted: true` or it
 * silently shows an operator an empty list. Unset falls back to BACKEND_URL: a
 * deployment that has collapsed the two into one instance still works, it just
 * loses the distinction. */
const baseURL = (env: NodeJS.ProcessEnv = process.env, mounted = false): string => (mounted ? env.BACKEND_MOUNTED_URL?.trim() || env.BACKEND_URL! : env.BACKEND_URL!).replace(/\/$/, '')

/** One wire page's worth of nothing — the degraded answer a 200 with no body
 * maps to. Every real endpoint answers 200 with its envelope, so this is
 * only reachable through a fixture or a proxy that swapped the body. */
const EMPTY_PAGE = { total: 0, offset: 0, rows: [] }
const EMPTY_VALUES: FilterValuesWire = { sensors: [], countries: [], cities: [], protos: [], ports: [], kinds: [] }

/** A source-health document with nothing in it: the degraded answer a 200
 * with no body maps to. Every endpoint here answers 200 with its full
 * envelope, so this is reachable only through a fixture or a proxy that
 * swapped the body — never through a failed call, which throws. */
const EMPTY_HEALTH: SourceHealthWire = {
  cluster_status: 'unreachable', total_documents: 0, sensors: [],
  yara: { enabled: false, last_scan: '', rules_sha256: '', samples: 0, matched: 0, errors: 0 },
  runtime: { uptime_seconds: 0, rss_bytes: 0, vm_bytes: 0 },
  ingest: { state: 'unknown', last_ingest: '', age_seconds: -1, recent_dead_letters: 0 },
  dead_letters: 0,
  pipeline: { state: 'unreachable', acked: 0, failed: 0, dropped: 0, active: 0, decode_failures: 0 },
  webhook: { available: false, reason: '', state: 'unknown', target: '', messages: 0, consecutive_failures: 0, failure_threshold: 0, last_success: null, last_failure: null, updated_at: '' },
  unattributed_24h: 0,
}

// ---- the call ---------------------------------------------------------------

/** Which page state a refusal maps to.
 *
 * A 401 from THIS tier means the shared secret is wrong or missing — a
 * deployment misconfiguration, not an operator's session ending. It is
 * deliberately NOT `expired`: that state drives the sign-in flow, so mapping
 * a bad SERVICE_TOKEN onto it would send every operator to sign in again
 * for a fault only a deployment fix cures. There is no page state for "the
 * backend will not talk to us", so it is `unavailable` — 502, retryable —
 * with the tier's own words in the detail. */
const kindOf = (status: number): ApiErrorKind =>
  status === 403 ? 'forbidden' : status === 423 ? 'locked' : status === 503 ? 'overloaded' : status === 400 || status === 422 ? 'invalid' : 'unavailable'

/** GET against the Rust tier, or null for the 404 a detail endpoint answers
 * when nothing carries the id.
 *
 * Every other failure throws an ApiError — a socket error, a DNS failure,
 * the timeout, and any non-2xx alike. That is the whole point: an events
 * list that renders empty because the backend was down reads as "no
 * activity", and an operator cannot tell that from a quiet fleet. */
async function get<T>(endpoint: string, path: string, search: SearchParams = {}, opts: { mounted?: boolean; user?: Caller } = {}): Promise<T | null> {
  return request<T>(endpoint, path, { method: 'GET', search, ...opts })
}

/** A binary body, for the file routes (artifacts.rs and the rest serve the
 * stored bytes, not a JSON envelope). Same failure contract as `get`: a 404
 * is "no such file", anything else throws. */
async function raw(path: string, opts: { mounted?: boolean; user?: Caller; search?: SearchParams } = {}, endpoint = 'getArtifactFile'): Promise<Response> {
  const query = queryOf(opts.search)
  let response: Response
  try {
    response = await limited(endpoint, () => fetch(`${baseURL(process.env, opts.mounted)}${path}${query.size ? `?${query}` : ''}`, { headers: { 'x-service-token': process.env.SERVICE_TOKEN ?? '', ...hopHeaders(opts.user, 'GET', path) }, signal: AbortSignal.timeout(TIMEOUT_MS) }))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('unavailable', endpoint)
  }
  if (!response.ok && response.status !== 404) throw new ApiError(kindOf(response.status), endpoint, await detailOf(response))
  return response
}

/** What any call may send as a query string. The named shape is #75's; the
 * loose record is the settings slice's params, which have no shared shape
 * worth a type. */
type SearchParams = EventsQueryWire | Record<string, string | number | undefined>

/** `request` builds its query this way; `raw` needs the same, and a dropped
 * param on an export is a download of the wrong rows. */
const queryOf = (search: SearchParams = {}): URLSearchParams => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) if (value !== undefined && value !== '') query.set(key, String(value))
  return query
}

/** What a file route answers: the bytes and the type to serve them under.
 * `found: false` is the 404 an endpoint gives when nothing carries the id —
 * distinct from "the mock answers this", which is `null` from `getRaw`. */
export type RawFile = { found: true; body: Uint8Array; contentType: string } | { found: false }

/** GET a file the dashboard hands over — a recording, a payload's bytes, a
 * CSV export — as bytes rather than as JSON, for the download routes
 * (src/data/downloads.ts).
 *
 * `request()` cannot be bent into this: it parses every body as JSON and
 * folds a 404 into `null`, which would turn "no such recording" into an
 * empty download. This is the smallest equivalent that shares `raw`'s URL,
 * query building, token header, actor headers, timeout and error mapping,
 * and nothing else: it returns the bytes and lets the route decide what a
 * missing file means.
 *
 * The upstream `content-disposition` is deliberately NOT returned. The
 * filename a download carries is this tier's contract (the pages link
 * `events.csv`, the backend answers `honeypot-events.csv`), and a header
 * from the wire is not sanitized the way the route's own `file()` is. */
export async function getRaw(endpoint: string, path: string, search: SearchParams = {}): Promise<RawFile | null> {
  const response = await raw(path, { search }, endpoint)
  if (response.status === 404) return { found: false }
  return { found: true, body: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'application/octet-stream' }
}

/** The per-user signal the Rust tier trusts (canonical L107-112: the
 * wire-level `owner` field alone was not enough). Built from the SESSION
 * user `liveQuery` already receives — never from client input. Omitted
 * entirely when there is no signed-in user, so a trusted internal caller
 * still reaches the endpoints that do not require an actor.
 *
 * `x-actor-username` carries the OIDC username (#249), the same value the
 * signed assertion's `username` claim does, not the display name: the backend
 * in `log` mode warns on every request whose plain header differs from the
 * assertion, and the log has to go silent before it can be switched to
 * `enforce`. A user with no known username (not built from a session) falls
 * back to the display name. */
const actorHeaders = (user: Caller): Record<string, string> =>
  user ? { 'x-actor-username': sessionIdentityOf(user)?.username ?? user.name, 'x-actor-role': user.roles[0] ?? '' } : {}

/** `x-actor-assertion` for one call, whenever a signing key is configured and
 * there is a caller (opts.user, else the request scope's). Bound to this
 * method and path, so it is minted per call, never reused. */
const assertionHeaders = (user: Caller, method: string, path: string): Record<string, string> => {
  const assertion = mintActorAssertion(user ?? callerOf(), method, path)
  return assertion ? { [ACTOR_ASSERTION_HEADER]: assertion } : {}
}

/** The actor, plus the request's one id across the hop chain (canonical
 * `x-request-id`), when the call runs inside a request's scope. */
const hopHeaders = (user: Caller, method: string, path: string): Record<string, string> => {
  const requestId = requestScope.getStore()?.requestId
  return { ...actorHeaders(user), ...assertionHeaders(user, method, path), ...(requestId ? { 'x-request-id': requestId } : {}) }
}

/** One call to the Rust tier, GET or POST, mounted or not.
 *
 * 404 is the only status that becomes a null: it is what a detail endpoint
 * answers when nothing carries the id, and the page types all say "null".
 * Everything else — a socket error, a DNS failure, the timeout, any other
 * non-2xx — throws. That is the whole point: an analysis list that renders
 * empty because the backend was down reads as "no analyses", and an
 * operator cannot tell that from a quiet fleet. */
async function request<T>(endpoint: string, path: string, opts: { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; search?: SearchParams; body?: unknown; mounted?: boolean; user?: Caller }): Promise<T | null> {
  const query = queryOf(opts.search)
  const url = `${baseURL(process.env, opts.mounted)}${path}${query.size ? `?${query}` : ''}`
  let response: Response
  try {
    response = await limited(endpoint, () => fetch(url, {
      method: opts.method,
      // Only a request that carries a body declares a content type: a
      // bodyless PUT/PATCH declares none, so the tier is not invited to
      // reject an empty body against a header that promised JSON.
      headers: { ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }), 'x-service-token': process.env.SERVICE_TOKEN ?? '', ...hopHeaders(opts.user, opts.method, path) },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }))
  } catch (error) {
    // Shed by the limiter: already the right refusal.
    if (error instanceof ApiError) throw error
    // Unreachable, refused, or past TIMEOUT_MS. The backend's own words are
    // not available and ours would carry nothing an operator can act on.
    throw new ApiError('unavailable', endpoint, { backendUnreachable: true })
  }
  if (response.status === 404) return null
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after'))
    throw new ApiError(kindOf(response.status), endpoint, { ...(Number.isFinite(retryAfter) ? { retryAfter } : {}), ...(await detailOf(response)) })
  }
  // 204 and an empty 200 carry nothing; the writes that answer `Json(doc)`
  // are read back by the page from its own reload.
  const text = await response.text().catch(() => '')
  return text ? (JSON.parse(text) as T) : null
}

/** POST to the Rust tier. No 404-to-null: every POST here is a mutation
 * whose page type is a value or a boolean, and a 404 means the route or the
 * id is wrong — an error worth surfacing, not an empty success. */
const post = async <T>(endpoint: string, path: string, body: unknown, opts: { mounted?: boolean; user?: Caller } = {}): Promise<T> => {
  const answer = await request<T>(endpoint, path, { method: 'POST', body, ...opts })
  return answer as T
}

/** The one call this module makes for a body it does not parse: the live
 * event stream (#82).
 *
 * `request()` is unusable here and stays that way. It reads the body as text
 * and JSON-parses it — a stream never ends, so `response.text()` never
 * settles; it turns a 404 into `null`, whereas a stream's status decides
 * whether the browser opens it at all; and it arms `AbortSignal.timeout`,
 * which would cut a stream that is long-lived by design. (The brief's note
 * that the seam already has a `raw()` helper for binary bodies does not
 * hold: there is no `raw()` in this module — every call here is JSON. So
 * this is the second function rather than a reuse.)
 *
 * What it does share with `request()` is the base URL and the one place the
 * token is attached, so neither can drift. Two deliberate differences: it is
 * NOT mounted (no sandbox/ghidra/github spool answers the live stream, so the
 * mounted instance would gain nothing), and it sends no plain actor headers — its one
 * caller is the fleet-wide feed, not an operator action to attribute. It does
 * carry the signed assertion when the stream runs inside a request's scope
 * and a key is configured, so a backend in `enforce` still knows the reader. Nothing
 * is buffered and nothing is re-encoded: the upstream body is handed back as-is,
 * so the connection
 * closes when the client goes away and a frame is never held waiting on the
 * next one. `signal` is the caller's — the request's own abort, which is how
 * a disconnect upstream stops the poller rather than leaking it. */
async function stream(endpoint: string, path: string, signal: AbortSignal): Promise<Response> {
  const url = `${baseURL()}${path}`
  let response: Response
  try {
    response = await fetch(url, { headers: { 'x-service-token': process.env.SERVICE_TOKEN ?? '', ...assertionHeaders(undefined, 'GET', path) }, signal })
  } catch {
    // Unreachable or refused. The upstream sent no status, so there is none
    // to pass through — same ApiError the JSON path raises, which the route
    // turns into its own 502.
    throw new ApiError('unavailable', endpoint)
  }
  // A refusal is passed up as-is (the route renders the status); a 200 with
  // no body is not a stream, and EventSource would hang on it forever.
  if (!response.ok || !response.body) throw new ApiError(kindOf(response.status), endpoint, await detailOf(response))
  return response
}

/** The tier's plain-text refusal, when it sent one. Never the request: an
 * echoed URL would put the query — and any token a proxy appended to it —
 * into an error that reaches the page and the log. */
async function detailOf(response: Response): Promise<{ detail?: string }> {
  const body = (await response.text().catch(() => '')).trim()
  return body ? { detail: body.slice(0, 200) } : {}
}

/** The page's event list, off one wire page. */
const paged = (wire: { total: number; offset: number; rows: EventRow[] }): Paged<HoneypotEvent> => ({
  total: wire.total,
  // events.rs clamps the requested offset to 10_000 - size, so paging must
  // follow the offset the response reports rather than the one asked for.
  offset: wire.offset,
  rows: wire.rows.map(pageEvent),
})

// ---- the page fields an event row does not carry -----------------------------

/** `type`, read off the sensor's own event name — the same input the mock's
 * sensor specs classify. The values are the literals the backend's own
 * canonicalizer fixtures and its DISCONNECT filter use; `pivots.alert`
 * (a Suricata signature, read off the wire) makes a row an IDS alert.
 * Everything else falls to `connection`, the least specific kind a honeypot
 * row can be certain of (see `pageEvent`). */
const TYPE_OF_EVENT: Record<string, EventType> = {
  'cowrie.login.failed': 'login.failed',
  'cowrie.login.success': 'login.success',
  'cowrie.command.input': 'command.input',
  'cowrie.command.failed': 'command.input',
  'cowrie.command.success': 'command.input',
  'cowrie.session.input': 'command.input',
  'cowrie.file.download': 'file.download',
  'cowrie.session.connect': 'connection',
  'cowrie.session.closed': 'connection',
  connect: 'connection',
  disconnect: 'connection',
  listening: 'connection',
  https_listening: 'connection',
  login: 'login.failed',
  auth_attempt: 'login.failed',
  command: 'command.input',
  get: 'http.request',
  post: 'http.request',
  http_request: 'http.request',
}

/** The sensor's own event name, which each sensor writes under its own key:
 * `cowrie.command.input`, `command`, `connect`, … */
function eventNameOf(row: EventRow): string {
  const hp = row.record.honeypot ?? {}
  const name = hp.eventid ?? hp.event
  return typeof name === 'string' ? name : ''
}

/** The seven page fields `toHoneypotEvent` deliberately omits (EventRowGap),
 * because the row carries no value for them. They are filled here, at the
 * seam, because the seam's signatures are the page types:
 *
 * - `type` — classified off the sensor's own event name above, or `ids.alert`
 *   when the row carries a Suricata alert. A name outside `TYPE_OF_EVENT`
 *   falls to `connection`: every row is a connection to a sensor, and that
 *   is the one kind it is certain of. `protocol.request` would claim a
 *   non-HTTP application request, and `http.request` a web one, neither of
 *   which the row shows.
 * - `eventName` — the sensor's own event name, verbatim.
 * - `techniques` — empty, meaning none assigned. The ATT&CK mapping is a
 *   pipeline result, not a field of the row.
 * - `srcPort`, `city`, `organization` — not on the row, so not set. Absent,
 *   never `0` or `''`.
 *
 * `severity` is not set here. `toHoneypotEvent` sets it from
 * `ics_severity` when the row carries one, and leaves it absent otherwise.
 */
function pageEvent(row: EventRow): HoneypotEvent {
  const name = eventNameOf(row)
  // Typed as exactly the gap the row cannot fill, so a renamed page field
  // fails the compiler here rather than reaching a page undefined.
  const gap: Pick<HoneypotEvent, EventRowGap> = {
    type: row.pivots.alert ? 'ids.alert' : (TYPE_OF_EVENT[name] ?? 'connection'),
    eventName: name,
    techniques: [],
  }
  // The one cast in this module, and the compiler forces it:
  // `Omit<HoneypotEvent, EventRowGap>` is structurally vacuous, because
  // HoneypotEvent carries a `Record<string, unknown>` index signature — so
  // `keyof` is `string | number`, `Omit` has nothing to subtract, and the
  // spread above typechecks as a bag of unknowns rather than an event. The
  // fields are genuinely all present; only the omission's promise of which
  // ones cannot be expressed. `organization` is the seventh gap field and
  // is left off: absent, not empty, as toHoneypotEvent does throughout.
  return { ...toHoneypotEvent(row), ...gap } as HoneypotEvent
}

// ---- the tools slice: canarytokens and bait credentials --------------------

/** GET /api/v1/canarytokens/types, GET /api/v1/store/canarytokens and
 * GET /api/v1/events?sensor=canarytokens — the three documents the page's
 * one loader hands back as `{ types, tokens, triggers }`.
 *
 * The page does not page the token list, so the store page asks for the
 * handler's default page (`size=25`) at offset 0 rather than inventing a
 * bigger one. `total` is the wire's own, so a fleet holding 300 tokens reads
 * as "300, showing 25" instead of as 25 tokens. */
const getCanarytokens: Backend['getCanarytokens'] = async () => {
  const [types, page, fired] = await Promise.all([
    get<CanaryTokenTypeWire[]>('getCanarytokens', '/api/v1/canarytokens/types'),
    get<CanarytokenStorePageWire>('getCanarytokens', '/api/v1/store/canarytokens', { offset: 0, size: 25 }),
    get<CanaryFiredPageWire>('getCanarytokens', '/api/v1/events', { sensor: 'canarytokens', size: 50, since: '365d' }),
  ])
  // `types` is code, not data: canarytokens.rs `types` answers a static table
  // (L96-107), never 404s and never carries a bodyless 200, so the `?? []`
  // is unreachable through any endpoint the Rust tier really has. It is here
  // for the same reason every other `??` in this file is: a fixture or a
  // proxy that swapped the body must not become a crash.
  return { types: canaryTokenTypes(types ?? []), tokens: canarytokenStorePage(page ?? { total: 0, rows: [] }).tokens, triggers: canaryTriggers(fired ?? { total: 0, offset: 0, rows: [] }) }
}

/** POST /api/v1/canarytokens (canarytokens.rs `create`, L154).
 *
 * `created_by` is the signed-in operator's name, read off `callerOf()` exactly as
 * the mounted mutations below take their actor: the Rust tier has no session
 * concept, so `canarytokens.rs CreateBody.created_by` is a field this tier
 * fills from the session it already resolved — never from client input.
 *
 * A web image (`requires_upload`) travels as base64 in the body: the handler
 * decodes `file_base64` and 400s without it (canarytokens.rs:178-180). The
 * bytes are checked here, before any fetch, against the same limits the
 * handler enforces (8 MiB decoded, an image type), so a bad upload is refused
 * by this tier and never reaches the backend. */
const createCanarytoken: Backend['createCanarytoken'] = async (input) => {
  if (input.image) {
    const size = decodedBase64Length(input.image.base64)
    const problem = size === undefined ? 'The image is not valid base64.' : !input.image.name ? 'The image needs a file name.' : canaryImageProblem({ type: input.image.contentType, size })
    if (problem) throw new ApiError('invalid', 'createCanarytoken', { detail: problem })
  }
  await guardReadOnly('createCanarytoken')
  const wire = await post<CreatedCanarytokenWire>('createCanarytoken', '/api/v1/canarytokens', {
    token_type: input.type,
    memo: input.memo,
    created_by: callerOf()?.name ?? '',
    ...(input.snippet ? { include_text_snippet: true, text_snippet: input.snippet } : {}),
    ...(input.image ? { file_base64: input.image.base64, file_name: input.image.name, file_content_type: input.image.contentType } : {}),
  })
  return createdCanarytoken(wire)
}

/** GET /api/v1/credentials joined with GET /api/v1/canarytokens — the record
 * list, and the tokens a credential may be linked to.
 *
 * `targets` is NOT read: `create` accepts exactly one implant target,
 * `cowrie_honeyfs`, and refuses anything else with a 400 (credentials.rs:157).
 * There is no listing endpoint, so the fixed target is returned rather than
 * invented from the sensors the page would otherwise list — a picker offering
 * a target the backend rejects is worse than a picker offering one.
 *
 * The endpoint's failure signal is a 200, not a status: an Elasticsearch
 * outage comes back `{"available": false, "error": …, "credentials": []}`
 * (credentials.rs:99-116). `get()` hands that body back as a success, so
 * without the check below the page renders "no credentials" for an outage —
 * and an empty list reads as "we have none", which is how an outage stays
 * invisible. So `available: false` throws, and the page's existing
 * error-with-retry state renders instead. An empty `credentials` WITH
 * `available: true` is the real answer and still returns []. */
const getCredentials: Backend['getCredentials'] = async () => {
  const [list, tokens] = await Promise.all([
    get<CredentialListWire>('getCredentials', '/api/v1/credentials'),
    get<CanarytokenListWire>('getCredentials', '/api/v1/canarytokens'),
  ])
  if (list && !list.available) throw new ApiError('unavailable', 'getCredentials', { detail: list.error || 'credentials are unavailable' })
  return { credentials: credentialList(list ?? { available: true, credentials: [] }), tokens: canarytokenList(tokens ?? { tokens: [] }), targets: [CREDENTIAL_TARGET] }
}

/** The one implant target `credentials.rs` implements (L157, and the
 * `target` default at L176). Not a page setting: the backend refuses
 * anything else, so the picker offers this or nothing. */
const CREDENTIAL_TARGET = 'cowrie_honeyfs'

/** POST /api/v1/credentials (credentials.rs `create`, L150). The actor rides
 * in the BODY, not a header: `CreateBody` takes `actor_subject` /
 * `actor_username` (L126-127) and stamps them into `created_by` and the audit
 * record. Admin-only, enforced by `ADMIN_QUERIES` before this runs.
 *
 * An empty `template` is left empty so the backend applies its own
 * `DEFAULT_CONTENT_TEMPLATE` (credentials.rs:191) rather than this tier
 * hard-coding a second copy of the same string. */
const provisionCredential: Backend['provisionCredential'] = async (input) => {
  await guardReadOnly('provisionCredential')
  const { subject, username } = await sessionOf()
  const wire = await post<CredentialRecordWire>('provisionCredential', '/api/v1/credentials', {
    path: input.path,
    username: input.username,
    password: input.password,
    memo: input.memo,
    target: input.target || CREDENTIAL_TARGET,
    ...(input.template ? { content_template: input.template } : {}),
    actor_subject: subject,
    actor_username: username,
  })
  return baitCredential(wire)
}

/** POST /api/v1/credentials/{id}/rotate and .../link-token.
 *
 * GAP: both handlers answer the full record (credentials.rs `rotate` L322,
 * `link_token` L373) while the page's seam returns `void` for both — so the
 * returned password and `linked_token_id` are dropped here, and the page
 * re-reads the credential after the write, as it does on the mock. A
 * generated password (empty `password` in, generated by the backend) is
 * therefore visible on the page only after that re-read.
 *
 * `rotate` takes an OPTIONAL body (credentials.rs L270 `Option<Json<RotateBody>>`),
 * so an empty password is sent as a body with an empty field rather than as
 * no body at all — both spell the same thing to the handler, and the body
 * keeps `content-type` honest. */
const rotateCredential: Backend['rotateCredential'] = async (id, password) => {
  await guardReadOnly('rotateCredential')
  const { subject, username } = await sessionOf()
  await post<CredentialRecordWire>('rotateCredential', `/api/v1/credentials/${encodeURIComponent(id)}/rotate`, { ...(password ? { password } : {}), actor_subject: subject, actor_username: username })
}

const linkCredentialToken: Backend['linkCredentialToken'] = async (id, tokenId) => {
  await guardReadOnly('linkCredentialToken')
  const { subject, username } = await sessionOf()
  // "" is how the handler unlinks (credentials.rs L353-360): it trims the
  // field, and an empty token_id skips the existence check and stores "".
  await post<CredentialRecordWire>('linkCredentialToken', `/api/v1/credentials/${encodeURIComponent(id)}/link-token`, { token_id: tokenId ?? '', actor_subject: subject, actor_username: username })
}

// ---- the settings slice -----------------------------------------------------

/** The session behind the request's cookie, read once per call and used for
 * both facts this slice needs from it: the identity the pages render
 * (`SettingsData.user`) and the SUBJECT the wire attributes writes to.
 *
 * `SessionUser` carries a display name and an email but no subject — the
 * subject lives one layer down, in the session record (src/server/session.ts
 * `Session.sub`). The Rust tier has no session concept: it takes
 * `actor_subject` / `actor_username` as params or body fields on the stated
 * trust model that this process is the only caller and the service token
 * gates it (preferences.rs's module doc, config.rs `ActorQuery`). So the
 * store is read here rather than a subject being invented; a store that does
 * not answer yields empty actor fields, which records a blank actor — worse
 * than no attribution, never worse than a fabricated one.
 *
 * The queries take no caller argument (their signatures are the contract), so
 * this re-resolves the session the funnel already resolved. One extra store
 * read on the slice's writes, against correctness we would otherwise have to
 * fake. */
async function sessionOf(): Promise<{ user: SessionUser | null; subject: string; username: string }> {
  try {
    const [{ getRequest }, { sessions, sidFrom }, { userOf }] = await Promise.all([import('@tanstack/react-start/server'), import('#/server/session'), import('#/server/identity')])
    const session = await sessions.get(sidFrom(getRequest()))
    return session ? { user: userOf(session), subject: session.sub, username: session.username } : { user: null, subject: '', username: '' }
  } catch {
    return { user: null, subject: '', username: '' }
  }
}

/** The nine documents `getSettings` reads, fanned out as one page.
 *
 * One failing leg fails the whole read rather than handing the page a
 * half-built `SettingsData`: an admin panel built from partly-dead stores
 * lies worse than a missing one, and a silently-defaulted `revision: 0` is
 * worse still — it is a real baseline that every later save then conflicts
 * against, blaming a concurrent editor who never existed. The canonical
 * frontend draws the same line (frontend-next `fetchAdminData`, #2311), so
 * this is `Promise.all` and the rejection is the `ApiError` the page's error
 * boundary already tells apart.
 *
 * `/api/v1/preferences` is not among the nine: it is per-subject, and it is
 * the eighth leg here only through `storedPreferencesWire`, the read
 * `getPreferences` and `savePreferences` share. */
const getSettings: Backend['getSettings'] = async () => {
  const session = await sessionOf()
  const [config, users, history, audit, services, reporter, storage, templates, stored] = await Promise.all([
    get<ConfigWire>('getSettings', '/api/v1/config'),
    get<UsersWire>('getSettings', '/api/v1/users'),
    get<ConfigHistoryWire>('getSettings', '/api/v1/config/history'),
    get<AuditWire>('getSettings', '/api/v1/audit', { limit: 100 }),
    get<ServicesWire>('getSettings', '/api/v1/services'),
    get<ReporterStatsWire>('getSettings', '/api/v1/reporter-stats'),
    get<StorageWire>('getSettings', '/api/v1/settings/storage'),
    get<ReportTemplatesWire>('getSettings', '/api/v1/reports/templates'),
    storedPreferencesWire(session, 'getSettings'),
  ])
  return settingsData({
    // The signed-in operator. The wire has no session, so it comes from the
    // one this process holds — the same SessionUser the mock answers `user`
    // with, so the identity panel reads the same whichever tier answered.
    user: session.user ?? ANONYMOUS_USER,
    config: config ?? { revision: 0, payload: {} },
    templates: reportTemplates(templates ?? { templates: [], elements: [] }).templates,
    users: users ?? { users: [] },
    // The signed-in operator's stored document, the same read `getPreferences`
    // makes. The dialog seeds its form from this, and `savePreferences` diffs
    // against it, so a save after this read sends only the changed keys.
    preferences: stored,
    services: services ?? { available: false, services: [] },
    history: history ?? { entries: [] },
    audit: audit ?? { events: [] },
    reporter: reporter ?? { available: false },
    storage: storage ?? { cluster_status: 'unreachable', index_count: 0, doc_count: 0, store_bytes: 0 },
  })
}

/** GET /api/v1/preferences for the signed-in operator.
 *
 * A PUBLIC_QUERY (authorize.ts:9): the root loader resolves it on every
 * navigation, the sign-in pages included. Before sign-in there is no
 * subject, and the wire answers an empty one with a 400 — so a caller with
 * no session gets the backend's own `default_preferences` without a call,
 * and the sign-in page renders exactly as a fresh operator's would. Once
 * signed in, the subject comes from the session record (`sessionOf`), and
 * the first read projects the operator into the preferences store. */
const getPreferences: Backend['getPreferences'] = async () => preferences(await storedPreferencesWire(await sessionOf(), 'getPreferences'))

/** The signed-in operator's stored preferences document, as the wire has it:
 * the one baseline `getPreferences`, `getSettings` and `savePreferences` all
 * read, so they cannot disagree about what is stored.
 *
 * No subject answers the backend defaults without a call (the wire 400s an
 * empty subject). A stored document the wire does not have (null) answers
 * the same defaults, as a first-time operator's would. Any other failure
 * throws, through `get`. */
async function storedPreferencesWire(session: Awaited<ReturnType<typeof sessionOf>>, endpoint: string): Promise<PreferencesDocWire> {
  if (!session.subject) return DEFAULT_PREFERENCES_WIRE
  const wire = await get<PreferencesWire>(endpoint, '/api/v1/preferences', { ...preferencesQuery(session.subject, { username: session.username, role: session.user?.roles[0] }) })
  return wire ? wire.preferences : DEFAULT_PREFERENCES_WIRE
}

/** The page fields that differ from the stored document's page form. The
 * page hands over its whole `Preferences`, so the diff is what says which
 * fields the operator changed; `preferencesPatch` then drops the page-only
 * fields (`notifyCanary`, `mapBasemap`) so they never reach the wire. */
const changedPreferences = (next: Preferences, stored: Preferences): Partial<Preferences> => {
  const changed: Partial<Preferences> = {}
  for (const key of Object.keys(next) as Array<keyof Preferences>) if (next[key] !== stored[key]) Object.assign(changed, { [key]: next[key] })
  return changed
}

/** PUT /api/v1/preferences for the signed-in operator, carrying only the
 * fields that changed against the stored document.
 *
 * The stored document is read first, because the PUT merges a
 * `deny_unknown_fields` patch: a full-page send would overwrite every field
 * the operator did not touch with whatever the page holds, and would 400 on
 * `notifyCanary`. An unchanged save makes no PUT. No session is `expired`,
 * the same as the sign-in flow expects of a write it cannot attribute. */
const savePreferences: Backend['savePreferences'] = async (next) => {
  const session = await sessionOf()
  if (!session.subject) throw new ApiError('expired', 'savePreferences')
  const patch = preferencesPatch(changedPreferences(next, preferences(await storedPreferencesWire(session, 'savePreferences'))))
  if (Object.keys(patch).length === 0) return
  await request<PreferencesWire>('savePreferences', '/api/v1/preferences', { method: 'PUT', body: preferencesWriteBody(session.subject, patch, session.username) })
}

/** What the identity panel shows for a caller no session resolved. The mock
 * has a fixture user; a live call that reached here has no session at all,
 * and saying so beats borrowing a name. */
const ANONYMOUS_USER: SessionUser = { name: '—', email: '', roles: [] }

/** `GET /api/v1/config` for the shell: the presentation and behavior blocks
 * every page renders with.
 *
 * `links` has no endpoint — that is canonical's finding, verified rather
 * than assumed: frontend-next builds all three from its own process
 * environment (`fetchInvestigationConfig`, events.tsx), an explicit
 * `KIBANA_PUBLIC_URL` / `EVEBOX_PUBLIC_URL` / `ARKIME_PUBLIC_URL` winning
 * outright over `https://{tool}.{HONEYPOT_DOMAIN}`. Deployment config, not
 * telemetry, so it is read from the environment here too. A tool that is
 * neither configured nor derivable is left out rather than guessed at.
 *
 * `accountConsole` stays absent: canonical derives it from the OIDC issuer
 * (oidc.server.ts `accountConsoleActions`) and this tier has no issuer
 * configuration — `OIDC_DISABLED` is a yes/no, not a URL. An absent link is
 * a missing button, never a wrong one. */
const getShellConfig: Backend['getShellConfig'] = async () => {
  const wire = await get<ConfigWire>('getShellConfig', '/api/v1/config')
  return shellConfig(wire ?? { revision: 0, payload: {} }, deploymentLinks())
}

function deploymentLinks(env: NodeJS.ProcessEnv = process.env): ShellConfig['links'] {
  const domain = (env.HONEYPOT_DOMAIN ?? '').trim().replace(/\.+$/, '')
  const base = (tool: string, explicit: string | undefined) => {
    const trimmed = (explicit ?? '').trim()
    return trimmed || (domain ? `https://${tool}.${domain}` : '')
  }
  const kibana = base('kibana', env.KIBANA_PUBLIC_URL)
  const evebox = base('evebox', env.EVEBOX_PUBLIC_URL)
  const arkime = base('arkime', env.ARKIME_PUBLIC_URL)
  return { ...(kibana ? { kibana } : {}), ...(evebox ? { evebox } : {}), ...(arkime ? { arkime } : {}) }
}

/** POST /api/v1/config/validate — the persist-nothing preview the debounced
 * editor asks for. A refused section is a 200 carrying `problems`, which is
 * a result and not an error; only an unreachable validator throws, and the
 * page treats that as "no preview" (its save still decides). */
const validateConfig: Backend['validateConfig'] = async (section, value) => {
  const wire = await request<ConfigValidateWire>('validateConfig', '/api/v1/config/validate', { method: 'POST', body: configValidateBody(section, value) })
  return configProblems(wire ?? { ok: true, problems: [] })
}

/** PUT /api/v1/config/{section} (or `/presentation`, which is the same
 * handler on its own route) — one section, replaced whole, since the handler
 * assigns `doc.payload[key] = value` rather than merging.
 *
 * No `If-Match`: the optimistic-concurrency precondition is optional, and
 * config.rs's absent-header path is explicitly the last-write-wins one. The
 * page's signature carries no revision to check against, and inventing one
 * would make every save a conflict check the UI has no state to resolve.
 * A 409 therefore cannot arise, and a validation refusal cannot either:
 * `put_config_field` stores whatever it is given and the validator only runs
 * on the separate `/config/validate` route — so a refusal here is a genuine
 * fault, and it is thrown rather than dressed up as a per-field problem the
 * page would show against the wrong field. */
const saveConfigSection: Backend['saveConfigSection'] = async (section, value) => {
  await guardReadOnly('saveConfigSection')
  const { subject, username } = await sessionOf()
  const path = configSectionPath(section)
  const wire = await request<ConfigWire>('saveConfigSection', `/api/v1/config/${path}`, { method: 'PUT', search: { actor_subject: subject, actor_username: username }, body: configSectionBody(section, value) })
  return { ok: true, revision: wire?.revision ?? 0 }
}

/** POST /api/v1/config/rollback. The wire's revision is an integer; the
 * page's history row renders it (the adapter's `id` is `String(revision)`,
 * and the mock uses `rev-41`). Both parse — the prefix is the page's own
 * decoration, not a wire key. Anything that is not a revision is refused
 * here rather than sent as one the backend would reject as negative
 * (config.rs `rollback` 400s `revision < 0`). */
const rollbackConfig: Backend['rollbackConfig'] = async (revisionId) => {
  await guardReadOnly('rollbackConfig')
  const revision = configRollbackBody(revisionId)
  if (!revision) throw new ApiError('invalid', 'rollbackConfig', { detail: `${revisionId} is not a revision` })
  const { subject, username } = await sessionOf()
  await request<ConfigWire>('rollbackConfig', '/api/v1/config/rollback', { method: 'POST', body: { ...revision, actor_subject: subject, actor_username: username } })
}

/** POST /api/v1/services/{name}/{action}.
 *
 * This restarts containers — in a normal deployment, the very stack this
 * dashboard is served from. It is wired because it is what the operator
 * asked for and what canonical serves, admin-gated by `ADMIN_QUERIES`, and
 * a failure is the backend's own status rather than a swallowed one: the
 * handler answers 503 when the services adapter is unconfigured and 400 for
 * an action it does not accept, both of which reach the page as errors.
 * Enabling this anywhere non-disposable is a deployment decision, not a
 * code one. */
const runServiceAction: Backend['runServiceAction'] = async (name, action) => {
  await guardReadOnly('runServiceAction')
  const { subject, username } = await sessionOf()
  const wire = await request<ServiceActionWireResponse>('runServiceAction', `/api/v1/services/${encodeURIComponent(name)}/${action}`, { method: 'POST', search: { actor_subject: subject, actor_username: username } })
  if (wire && wire.ok === false) throw new ApiError('unavailable', 'runServiceAction', { detail: wire.error })
}

/** GET /api/v1/mail/{id} — one document serves both the summary and the
 * detailed read. A 404 is the page's own "no message for this session",
 * which is an answer about the session rather than a failure. */
const getMail: Backend['getMail'] = async (sessionId) => {
  const wire = await get<MailWire>('getMail', `/api/v1/mail/${encodeURIComponent(sessionId)}`)
  return wire ? capturedMail(wire) : null
}

/** GET /api/v1/store/problem-reports — the allowlisted generic store
 * passthrough, which is where the list comes from: the Rust tier serves only
 * the POST and the PATCH under `/api/v1/problem-reports`, exactly as
 * canonical's own page reads them. `size` is the handler's own cap. */
const getProblemReports: Backend['getProblemReports'] = async () => {
  const wire = await get<ProblemReportsPageWire>('getProblemReports', '/api/v1/store/problem-reports', { offset: 0, size: 100 })
  return problemReports(wire ?? { total: 0, rows: [] })
}

/** POST /api/v1/problem-reports. The server redacts and truncates
 * everything here before it is stored — this is not a second redaction pass,
 * the trust boundary is on that side. */
const submitProblemReport: Backend['submitProblemReport'] = async (input) => {
  await guardReadOnly('submitProblemReport')
  const { subject, username } = await sessionOf()
  const wire = await request<ProblemReportCreatedWire>('submitProblemReport', '/api/v1/problem-reports', { method: 'POST', search: { actor_subject: subject, actor_username: username }, body: problemReportBody(input) })
  return { id: wire?.id ?? '' }
}

/** PATCH /api/v1/problem-reports/{id} — 204, or a 404 for a report that is
 * not there. A status the store has no room for is folded to its wire
 * equivalent by the adapter, so the page's four statuses stay reachable. */
const setProblemStatus: Backend['setProblemStatus'] = async (id, status) => {
  await guardReadOnly('setProblemStatus')
  await request<null>('setProblemStatus', `/api/v1/problem-reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: problemStatusPatch(status) })
}

/** Read-only mode, enforced the way the mock enforces it.
 *
 * `scenario.ts` refuses a non-read write with a 423 when
 * `CONFIG.behavior.readOnly` is on — but it wraps the MOCK. A live call
 * bypasses that entirely, and nothing in the Rust tier enforces read-only at
 * all: it is a dashboard preference, not a backend guarantee. So without
 * this the guard would silently apply to the mock tier only, which is the
 * worst shape a guard can have — it passes the tests and stops existing in
 * production. One config read per write buys the same 423 the mock gives.
 *
 * The predicate is the mock's own, inverted exactly as scenario.ts:72 inverts
 * it: a query whose name IS a read is not guarded, and a query that is not
 * one is. `READ_ONLY_SKIP` is the one addition, because the name alone does
 * not say what the query does — `getMail` STARTS WITH `get` and would read as
 * a read, but it is the page's read of a capture; it needs no exemption and
 * gets none. What DOES need one is already listed: `saveConfigSection` and
 * `rollbackConfig` are how read-only gets turned off. */
async function guardReadOnly(name: string): Promise<void> {
  if (isRead(name) || READ_ONLY_EXEMPT.has(name)) return
  const wire = await get<ConfigWire>(name, '/api/v1/config')
  if (wire?.payload.behavior?.read_only) throw new ApiError('locked', name)
}

// ---- the three proxy routes (#82) -------------------------------------------

/** GET /api/v1/charts/{name} — one chart's payload, passed through.
 *
 * The allowlist is the caller's (`isChartName`, run before this is reached),
 * and it is exactly the Rust tier's own route table: all 21 names are axum
 * paths, 17 in charts.rs, 3 in kill_chain.rs (the sankey, the campaign
 * timeline and the ATT&CK grid) and 1 in fusion.rs (the fusion), each
 * compared name by name against its `#[utoipa::path]` attribute. So a chart
 * this list names does exist upstream — a name that did not would fail the
 * router with a 404, which `get()` maps to null and the route to 502, never
 * to a wrong or default payload.
 *
 * `search` is forwarded verbatim, as canonical forwards it
 * (`frontend-next/src/routes/api/chart.$name.ts`): `attacker-fusion` is the
 * only handler with a query extractor (fusion.rs:21 `FusionQuery { id }`),
 * and the rest take state alone, so an extra parameter is ignored rather
 * than rejected. Only `id` reaches a body — but the whole string is passed
 * because that is what the canonical proxy does, and a narrower one would
 * silently change behaviour for any future chart that takes a second param.
 *
 * `null` means the tier had no answer: 404 (no such route or attacker) and
 * any 5xx both land here, and the route turns both into its 502. */
export async function liveChart<TChart extends ChartName>(name: TChart, search: URLSearchParams): Promise<Charts[TChart] | null> {
  return get<Charts[TChart]>(`chart/${name}`, `/api/v1/charts/${name}`, Object.fromEntries(search))
}

/** GET /api/v1/topology — the one slice the browser sees: `flow`.
 *
 * The endpoint answers the whole document (topology.rs:644
 * `TopologyResponse { generated_at, sensors, flow, stacks }`); canonical
 * serves `.flow` and drops the rest, and so does this, because
 * `/api/topology/flow` has always been that one graph and widening it would
 * put fleet hostnames and ports behind a path whose name promises a flow
 * graph. No query: `topology::topology` (topology.rs:698) takes no extractor
 * beyond state, and the graph is assembled per request from static tables.
 *
 * The wire shape is `FlowGraph { nodes: Vec<FlowNode>, links: Vec<FlowLink> }`
 * with `{name, layer}` and `{source, target}` (topology.rs:664-679) — already
 * the `FlowGraph` in `contracts/charts.ts`, so it passes through untouched,
 * which is why the mock builds the same shape by hand. */
export async function liveTopologyFlow(): Promise<FlowGraph | null> {
  const wire = await get<TopologyWire>('topology/flow', '/api/v1/topology')
  return wire?.flow ?? null
}

/** GET /api/v1/live — the Rust tier's SSE stream, opened.
 *
 * The upstream emits `event: event` with `data:` set to an `events.rs`
 * `row_from_hit` document (live.rs:146-148). Neither is what this tier's
 * browser client reads: `src/data/liveStream.ts` registers only
 * `onmessage`, which fires for the unnamed default event, and every
 * consumer holds a `HoneypotEvent`, not a wire row. Canonical bridges the
 * same gap on the client instead (its lib/live.ts listens for the name
 * `event` and parses `EventRow` itself); here the browser client is already
 * written against this tier's own framing, so the route translates frames
 * as they pass — see its `translated`, and `liveRow` below for the mapping.
 * What this function returns is the upstream body untouched; the framing is
 * the route's business because the route owns the contract it serves. */
export async function openLiveStream(signal: AbortSignal): Promise<Response> {
  return stream('live', '/api/v1/live', signal)
}

/** One wire row off the stream, as the page's event type.
 *
 * The stream's rows are built by `events::row_from_hit` (live.rs:115), the
 * same builder `/api/v1/events` uses, so a row off it maps through
 * `pageEvent` exactly as a row off the events list does — including the gap
 * fields the row cannot fill, which the browser would otherwise read as
 * undefined off a live frame while the very same event on the list renders.
 *
 * Exported (rather than `pageEvent` itself) because the route needs it per
 * frame: a stream translates a row at a time, not a page at a time. */
export const liveRow = pageEvent

// ---- the wire queries -------------------------------------------------------

// ---- the sources & correlation slice ---------------------------------------

/** GET /api/v1/sources?offset&size — the attack-sources list. The page does
 * not page this list (one loader, no paging control), so one full page is
 * asked for at the handler's own ceiling: `size` is bounded by
 * `min(offset + size, 1000)` (aggregates.rs L88) and the terms aggregation
 * it fills stops at the same 1000 buckets, so a smaller ask would only
 * shorten the list.
 *
 * The page's `mapPoints` is the OTHER endpoint (see `fetchMapPoints`): two
 * calls, joined here because the page reads one loader. */
const getSourceProfiles: Backend['getSourceProfiles'] = async () => {
  const [sources, points] = await Promise.all([get<SourcesPageWire>('getSourceProfiles', '/api/v1/sources', { offset: 0, size: 1000 }), getDashboardSlice('getSourceProfiles', 'map_points')])
  return { sources: sourceProfiles(sources ?? { total_unique: 0, truncated: false, rows: [] }), mapPoints: points }
}

/** GET /api/v1/overview/dashboard?parts=map_points — the world map's pins.
 *
 * The one helper both this slice's map and the Monitor slice's overview
 * read, so the path is registered ONCE: `?parts=` is the endpoint's own
 * selector (dashboard.rs `allowed_aggs`, L88), not a second route. A
 * second registration of the path would be the same request with the same
 * body, which is exactly what a shared seam entry prevents. */
const getDashboardSlice = async (endpoint: string, part: string) => mapPoints((await get<MapPointsWire>(endpoint, '/api/v1/overview/dashboard', { parts: part })) ?? { map_points: [] } as unknown as MapPointsWire)

/** GET /api/v1/attackers?offset&size — the attacker-entity store, one page
 * per the page's own loader. `size` is capped at 100 by
 * `store_search_body` (stores.rs L124) whatever is asked for, so the ask
 * is the cap rather than a number the handler will silently reduce. */
const getAttackers: Backend['getAttackers'] = async () => attackers((await get<AttackerPageWire>('getAttackers', '/api/v1/attackers', { offset: 0, size: 100 })) ?? { total: 0, rows: [] })

/** GET /api/v1/campaigns and GET /api/v1/cred-reuse — the campaign list and
 * the credential-reuse edges, joined because the page reads one loader.
 *
 * `cred-reuse` is the slice's one bare-array read (correlations.rs L344), so
 * it is not paged and carries no envelope; a 200 with no body is the only
 * way it reads empty. */
const getNetworkCampaigns: Backend['getNetworkCampaigns'] = async () => {
  const [page, edges] = await Promise.all([get<CampaignPageWire>('getNetworkCampaigns', '/api/v1/campaigns', { size: 100 }), get<CredEdgeWire[]>('getNetworkCampaigns', '/api/v1/cred-reuse')])
  return { campaigns: networkCampaigns(page ?? { total: 0, rows: [] }), credReuse: credReuse(edges ?? []) }
}

/** GET /api/v1/clusters?offset&size — the attacker-cluster store. Same
 * 100-row cap as the other store pages above. */
const getInfraClusters: Backend['getInfraClusters'] = async () => infraClusters((await get<ClusterPageWire>('getInfraClusters', '/api/v1/clusters', { offset: 0, size: 100 })) ?? { total: 0, rows: [] })

/** GET /api/v1/charts/{attck-coverage,kill-chain-sankey,campaign-timeline} —
 * the kill-chain page's three charts. Three documents: the ATT&CK grid, the
 * tactic sankey and the campaign timeline are three aggregations, and the
 * page shows all three at once. */
const getKillChain: Backend['getKillChain'] = async () => {
  const [grid, sankey, timeline] = await Promise.all([
    get<AttckGridWire>('getKillChain', '/api/v1/charts/attck-coverage'),
    get<SankeyWire>('getKillChain', '/api/v1/charts/kill-chain-sankey'),
    get<CampaignTimelineWire[]>('getKillChain', '/api/v1/charts/campaign-timeline'),
  ])
  const coverage = attackCoverage(grid ?? { tactics: [], techniques: [], cells: [] })
  return { ...coverage, flow: killChainFlow(sankey ?? { nodes: [], links: [] }), timeline: campaignTimeline(timeline ?? []) }
}

/** GET /api/v1/investigate/ip/{ip}, joined with the two endpoints the page
 * renders beside it: /api/v1/ip-block/{ip} for the block badge, and the
 * attackers store for the `attackerId` link.
 *
 * Three documents, three questions, one page. The ip-block record is read
 * through the request's own `x-actor-username`, which ip_block.rs's read
 * path does not check but the page's permission model treats as the
 * operator's own view.
 *
 * `attackerId` is resolved by asking the store for the entity that
 * carries this address (`?ip=`, the store's own Lucene narrowing,
 * stores.rs L177), because no endpoint resolves an address to an entity id
 * directly. The page treats it as optional, so a store that holds none
 * simply leaves the link off. */
const getIpProfile: Backend['getIpProfile'] = async (ip) => {
  const [wire, block, entities] = await Promise.all([
    get<IpProfileWire>('getIpProfile', `/api/v1/investigate/ip/${encodeURIComponent(ip)}`),
    get<IpBlockWire>('getIpProfile', `/api/v1/ip-block/${encodeURIComponent(ip)}`),
    get<AttackerPageWire>('getIpProfile', '/api/v1/attackers', { offset: 0, size: 100, ip }),
  ])
  if (!wire) return null
  const record = block ? ipBlockRecord(block) : null
  return { ...ipProfile(wire), blocked: Boolean(record), ...(record ? { block: record } : {}), events: wire.events.map(pageEvent), ...(entities?.rows[0] ? { attackerId: entities.rows[0].id } : {}) }
}

/** POST /api/v1/ip-block — the block toggle, admin-only (authorize.ts:14),
 * enforced before the fetch by `liveQuery`, the same decision the mock tier
 * makes, so no check is added here.
 *
 * The PAGE IS A SUBSET of the endpoint, and this is the slice's one place
 * where that is load-bearing rather than cosmetic. `BlockBody` carries
 * `expires_days` and `actor` (ip_block.rs L34); the page's setter is
 * `setIpBlocked(ip, blocked)` and has no field for either, so
 * `setIpBlockBody` sends neither and the backend stores `ExpiresAt: null` —
 * a PERMANENT block. An operator who wanted a week gets one until they lift
 * it, and nothing on the page says otherwise. The wire contract keeps both
 * fields typed (`SetIpBlockBody`), so the moment the page can express a
 * duration they are one line away.
 *
 * The write is therefore the page's own two states and nothing more; the
 * returned record is dropped, exactly as `setAlertsAcknowledged` drops its
 * envelope, because the page re-reads the profile it came from. */
const setIpBlocked: Backend['setIpBlocked'] = async (ip, blocked) => {
  await guardReadOnly('setIpBlocked')
  await post('setIpBlocked', '/api/v1/ip-block', setIpBlockBody(ip, blocked))
}

/** GET /api/v1/investigate/cidr/{cidr} — a network's members, events and
 * breakdown. The `Correlation` the endpoint wraps is the whole answer;
 * `correlationGroup` folds its records into the page's `SourceGroup`.
 *
 * `{cidr}` carries a literal "/", which axum's router splits on the RAW
 * request target, so the path segment is percent-encoded (investigate.rs
 * L540) — the same encoding every link to `/networks/$cidr` already does.
 *
 * The campaign card on the page is the campaigns store read for this one
 * prefix (`?q=` is the store's own Lucene narrowing); a prefix the
 * correlator never scored has none, and the page says so rather than
 * inventing one. The network's own ASN/org/country come from its first
 * member's row: the correlation endpoint carries no address attributes, and
 * the address itself is public data already on the row. */
const getNetwork: Backend['getNetwork'] = async (cidr) => {
  const wire = await get<CidrCorrelationWire>('getNetwork', `/api/v1/investigate/cidr/${encodeURIComponent(cidr)}`)
  if (!wire) return null
  const events = wire.correlation.records.map(pageEvent)
  const group = correlationGroup(wire.correlation, events)
  if (!group.members.length) return null
  const page = await get<CampaignPageWire>('getNetwork', '/api/v1/campaigns', { size: 100, q: `cidr:${cidr}` })
  // `networkCampaigns` maps the store page, so the prefix's own campaign is
  // the first row or nothing: a store page that does not hold it is a
  // prefix the correlator never scored, and the page says so.
  const campaigns = networkCampaigns(page ?? { total: 0, rows: [] })
  const campaign = campaigns.find((row) => row.cidr === cidr)
  // `events` is non-empty here: a group with no member is the page's
  // not-found, returned above.
  const first = events.find((row) => row.asn || row.org) ?? events[0]
  // Absent attributes are left out of the entity, not carried as `undefined`.
  return {
    cidr,
    ...(first.asn ? { asn: first.asn } : {}),
    ...(first.org ? { org: first.org } : {}),
    ...(first.country ? { country: first.country } : {}),
    group,
    ...(campaign ? { campaign } : {}),
  }
}

/** GET /api/v1/investigate/identity/{id} (the attackers-v1 document), then
 * the group of its first 50 addresses: GET /api/v1/events?ips= for their
 * newest events, and each address's profile, from GET /api/v1/sources (the
 * top 1000) or GET /api/v1/investigate/ip/{ip} for one that list does not
 * hold. An address with no events in the 10-day window has no profile and is
 * not listed as a member; the identity's own `ips` still names it. A 404 on
 * the document is "no such identity", the page's null. */
const getIdentity: Backend['getIdentity'] = async (id) => {
  const doc = await get<IdentityDocWire>('getIdentity', `/api/v1/investigate/identity/${encodeURIComponent(id)}`)
  if (!doc) return null
  const ips = doc.ips.slice(0, MEMBER_LIMIT)
  const identity = attacker(doc)
  if (!ips.length) return { identity, group: membersGroup([], [], 0), shared: [] }
  const [events, sources] = await Promise.all([
    eventsWire('getIdentity', { ips: ips.join(','), since: '365d' }),
    get<SourcesPageWire>('getIdentity', '/api/v1/sources', { offset: 0, size: 1000 }),
  ])
  const listed = new Map(sourceProfiles(listOf('getIdentity', sources)).map((row) => [row.ip, row]))
  const members = (
    await Promise.all(
      ips.map(async (ip) => {
        const row = listed.get(ip)
        if (row) return row
        const profile = await get<IpProfileWire>('getIdentity', `/api/v1/investigate/ip/${encodeURIComponent(ip)}`)
        return profile ? profileMember(profile) : null
      }),
    )
  ).filter((row): row is SourceProfile => row !== null)
  const rows = paged(events).rows
  return { identity, group: membersGroup(members, rows, events.total), shared: sharedSignals(rows) }
}

/** GET /api/v1/investigate/campaign/{id} (the campaigns-v1 document, id the
 * /24) and GET /api/v1/investigate/cidr/{cidr} (its correlation, the same
 * read the network page makes). The campaign document names no member
 * addresses, so the members are the distinct addresses of the correlation's
 * records (a floor on wide prefixes, see `correlationGroup`). A prefix with
 * no events in the window has no correlation: the group is empty rather than
 * invented. A 404 on the document is the page's null. */
const getCampaign: Backend['getCampaign'] = async (id) => {
  const doc = await get<CampaignDocWire>('getCampaign', `/api/v1/investigate/campaign/${encodeURIComponent(id)}`)
  if (!doc) return null
  const wire = await get<CidrCorrelationWire>('getCampaign', `/api/v1/investigate/cidr/${encodeURIComponent(doc.cidr)}`)
  const events = wire ? wire.correlation.records.map(pageEvent) : []
  const group = wire ? correlationGroup(wire.correlation, events) : membersGroup([], [], 0)
  return { campaign: networkCampaign(doc), group, shared: sharedSignals(events) }
}

/** GET /api/v1/investigate/cluster?kind=&value= — the same endpoint
 * `resolveHash` asks, with the same question shape, so both go through one
 * fetch (`clusterCorrelation` below) rather than registering the path twice.
 *
 * A cluster kind the page knows but the backend does not — `credential` —
 * is a 400 upstream (`cluster_membership_filter`, investigate.rs L578), so
 * the page's not-found is the honest answer for it: no cluster document of
 * that kind exists either. A kind with fewer than two members is the
 * handler's own 404. */
const getCluster: Backend['getCluster'] = async (kind, value) => {
  const wire = await clusterCorrelation('getCluster', kind, value)
  if (!wire) return null
  const events = wire.correlation.records.map(pageEvent)
  const group = correlationGroup(wire.correlation, events)
  if (!group.members.length) return null
  return { kind: kind as ClusterEntity['kind'], value, group }
}

/** GET /api/v1/charts/attacker-fusion?id= — the identity page's "Why merged"
 * table. The backend's own per-category shared-value counts, which is
 * exactly what the page's mock computes; a 404 is "no such entity", the
 * page's null. */
const getIdentityFusion: Backend['getIdentityFusion'] = async (id) => {
  const wire = await get<FusionWire>('getIdentityFusion', '/api/v1/charts/attacker-fusion', { id })
  return wire ? identityFusion(wire) : null
}

/** The IOC lookup's hash half: `GET /api/v1/investigate/cluster` with the
 * value as a fingerprint, which is the endpoint the cluster page reads too
 * — so it asks the SAME question through the same `clusterCorrelation`
 * helper rather than registering the path a second time.
 *
 * The page's three answers are kept in the page's order of confidence:
 * a payload whose hash is exactly the value, else the cluster whose
 * fingerprint (HASSH-prefixed or bare) is it, else not-found. A 200 whose
 * `value` came back different is a miss, not a hit: the endpoint matches
 * a term, and a term match on a normalized value is still the cluster's
 * value, not the operator's. */
const resolveHash: Backend['resolveHash'] = async (value) => {
  const wanted = value.toLowerCase().replace(/^hassh:/, '')
  for (const kind of ['payload', 'fingerprint']) {
    const wire = await clusterCorrelation('resolveHash', kind, value)
    if (wire?.correlation.total && wire.value.toLowerCase().replace(/^hassh:/, '') === wanted) return { kind: 'cluster', clusterKind: wire.kind, value: wire.value }
  }
  return { kind: 'not-found', value }
}

/** The one investigate/cluster fetch, shared by the two page types that
 * need it. `kind` and `value` are SEPARATE query parameters on purpose
 * (investigate.rs L604): a value such as "AS15169 Google LLC" decodes
 * differently through a packed path segment than through a query string.
 * A 400 (a kind the membership filter does not know) is a 400 for this
 * page too, not a silent empty cluster. */
const clusterCorrelation = (endpoint: string, kind: string, value: string): Promise<ClusterCorrelationWire | null> => get<ClusterCorrelationWire>(endpoint, '/api/v1/investigate/cluster', { kind, value })


/** GET /api/v1/sensors/catalog. A terms aggregation over a 14-day window
 * (sensors.rs `catalog`, L428): a name, an event count and a last-seen, and
 * nothing about a sensor's identity. The page's `SensorSummary` is exactly
 * that pair, so this is the whole answer — `last_seen` has no field to land
 * in and is dropped rather than invented onto the summary. */
const getSensorCatalog: Backend['getSensorCatalog'] = async () => sensorCatalog((await get<SensorCatalogWire>('getSensorCatalog', '/api/v1/sensors/catalog')) ?? { window: '', sensors: [] })

/** GET /api/v1/sensors/{sensor}/overview (sensors.rs `overview`, L707) and
 * GET /api/v1/sensors/{sensor}/events?limit=200 (`events`, L482).
 *
 * The `Sensor` the page's header renders is the one field the wire cannot
 * supply and it is NOT guessed: the catalog is a bare aggregation, so a live
 * sensor has no kind, ports, persona or location — it has a name, a count,
 * its activity window and whatever liveness /api/v1/source-health judges.
 * Every unknown is a visible blank ("no listener", no decoy), never a
 * fabricated identity. `byType` and `reading` stay empty for the same
 * reason — the overview bundle carries neither (see the slice's gaps). */
const getSensorDetail: Backend['getSensorDetail'] = async (id) => {
  const [overview, events, health, exposure] = await Promise.all([
    get<SensorOverviewWire>('getSensorDetail', `/api/v1/sensors/${encodeURIComponent(id)}/overview`),
    get<SensorEventsWire>('getSensorDetail', `/api/v1/sensors/${encodeURIComponent(id)}/events`, { limit: 200 }),
    get<SourceHealthWire>('getSensorDetail', '/api/v1/source-health'),
    get<TopologyWire>('getSensorDetail', '/api/v1/topology'),
  ])
  if (!overview) return null
  const feed = health?.sensors.find((s) => s.sensor === id)
  const row = exposure?.sensors.find((s) => s.sensor === id)
  return sensorOverview(
    overview,
    sensorOf(id, overview.events, overview.first_seen, overview.last_seen, feed?.state, row),
    sensorPageEvents(events ?? { sensor: id, total: 0, rows: [] }),
  )
}

/** The eleven page fields `sensorEvents` deliberately omits
 * (SensorEventGap), filled here because the seam's signature IS the page
 * type. These rows are sensors.rs `SensorEvent`, not an events.rs `EventRow`:
 * the sensor's own fields, no pivots and no enrichment, so every one of the
 * eleven is genuinely absent upstream and none is inferred:
 *
 * - `type` / `eventName` — `eventName` is the sensor's own event name verbatim
 *   and `type` is read off it the same way `TYPE_OF_EVENT` does for a real
 *   row, falling to `connection` (see `pageEvent` for why not
 *   `protocol.request`).
 * - `techniques` — empty, meaning none assigned. An ATT&CK mapping is a
 *   pipeline result, not part of this endpoint.
 * - `severity`, `summary`, `asn` / `org` / `city` / `country` / `provider`,
 *   `sessionId` — not upstream: nothing classifies the row (the endpoint has
 *   no ICS severity), and the network enrichment and session correlation are
 *   on the events slice's pipeline, not this endpoint. Left absent, never
 *   `info`, `''` or `network`.
 *
 * `srcIpClaimed`, `persona`, `site`, `asset`, `fingerprint` and friends stay
 * absent rather than blank: `sensorEvents` already omits them and the page
 * reads them as "this sensor never said". */
const sensorPageEvents = (wire: SensorEventsWire): HoneypotEvent[] =>
  sensorEvents(wire).map((row) => {
    // The adapter's own return type cannot carry this: `HoneypotEvent`
    // extends `Record<string, unknown>`, so `Omit<HoneypotEvent, …>` has
    // `keyof` = `string | number` and omits nothing. The adapter's field
    // selection is still what runs; the Pick is only the type it earned,
    // and `sensorEvents` is the one place that lists which fields
    // the endpoint really fills.
    const filled = row as Pick<HoneypotEvent, 'id' | 'timestamp' | 'sensor' | 'srcIp' | 'srcPort' | 'dstPort' | 'fields'>
    const name = sensorEventName(filled.fields)
    const gap: Pick<HoneypotEvent, SensorEventGap> = {
      type: TYPE_OF_EVENT[name] ?? 'connection',
      eventName: name,
      techniques: [],
    }
    return { ...filled, ...gap }
  })

/** The sensor's own event name, which each sensor writes under its own key
 * inside its `fields` object — the same two keys `eventNameOf` reads on a
 * real event row, because it is the same fleet writing them. */
const sensorEventName = (fields: SensorFields): string => {
  const name = fields.eventid ?? fields.event
  return typeof name === 'string' ? name : ''
}

/** The page's `Sensor`, from what four endpoints together can actually say.
 *
 * Deliberately empty where the wire is empty: `ports` are the topology's
 * exposure (public → host), which IS the sensor's real listening surface, so
 * the host leg is what the header lists; `status` is the health page's own
 * verdict, not an inference. `name` falls back to the id because the wire
 * carries only the id everywhere. */
const sensorOf = (id: string, events: number, firstSeen: string, lastSeen: string, state: string | undefined, exposure: TopologySensorWire | undefined): Sensor => ({
  id,
  name: id,
  kind: '',
  what: '',
  protocols: [...new Set(exposure?.ports.map((p) => p.proto) ?? [])],
  ports: (exposure?.ports ?? []).map((p) => ({ proto: p.proto === 'udp' ? 'udp' : 'tcp', port: p.host })),
  location: '',
  status: state === 'ACTIVE' ? 'online' : state === 'QUIET' || state === 'STALE' ? 'degraded' : 'offline',
  eventsLast24h: events,
  lastSeen,
  ...(firstSeen ? { firstSeen } : {}),
})

/** GET /api/v1/alerts?offset&size=100 (stores.rs `alerts`, L376). The store
 * sorts `LastSeen` desc with a `_doc` tiebreak (L378), so one page is
 * already the newest 100 — the board does not walk further, and says so by
 * showing what the endpoint holds rather than pretending it is everything.
 *
 * One document per alert and one document per key, so the page's own
 * client-side grouping has nothing left to fold (see the adapter). */
const getAlerts: Backend['getAlerts'] = async () => alertPage((await get<AlertPageWire>('getAlerts', '/api/v1/alerts', { offset: 0, size: 100 })) ?? { total: 0, rows: [] })

/** The shell bell's count (AlertBell, polled every minute). One request,
 * and the rows are the ones the alerts page would read anyway, so the count
 * is filtered here rather than by a second endpoint that does not exist. */
const getOpenAlertCount: Backend['getOpenAlertCount'] = async () => ((await get<AlertPageWire>('getOpenAlertCount', '/api/v1/alerts', { offset: 0, size: 100 })) ?? { total: 0, rows: [] }).rows.filter((row) => !row.Acknowledged).length

/** POST /api/v1/alerts/{key}/ack (stores.rs `acknowledge`, L461) — one key
 * per call, so acknowledging N is N requests. The ack direction rides in the
 * body (`{ack}`, required — no serde default), which is what makes reopen
 * the same call with the flag flipped. There is no bulk endpoint and none is
 * invented here (see the slice's gaps).
 *
 * `Acknowledged` is set without clearing `LastNotified`, and the document
 * carries no acknowledger field at all, so the count returned is what
 * changed — what the operator asked for — and the page re-reads the board
 * for the rest. A key the store does not hold answers 200 regardless
 * (the handler's `update_doc` does not read what it wrote), so a stale key
 * counts as changed rather than as a failure. */
const setAlertsAcknowledged: Backend['setAlertsAcknowledged'] = async (keys, acknowledged) => {
  await guardReadOnly('setAlertsAcknowledged')
  let changed = 0
  for (const key of keys) {
    await request<AckAlertWire>('setAlertsAcknowledged', `/api/v1/alerts/${encodeURIComponent(key)}/ack`, { method: 'POST', body: alertAckBody(acknowledged), user: callerOf() })
    changed += 1
  }
  return changed
}

/** "Acknowledge all": the alert page's loop, over every OPEN key, read from
 * the same page endpoint the board reads (stores.rs `alerts`, L376) — there
 * is no server-side scope=all to ask for. One POST per key, as above. */
const acknowledgeAllAlerts: Backend['acknowledgeAllAlerts'] = async () => {
  await guardReadOnly('acknowledgeAllAlerts')
  const page = (await get<AlertPageWire>('acknowledgeAllAlerts', '/api/v1/alerts', { offset: 0, size: 100 })) ?? { total: 0, rows: [] }
  return setAlertsAcknowledged(page.rows.filter((row) => !row.Acknowledged).map((row) => row.Key), true)
}

/** One alert group's page. The store has no "by key" read — only the paged
 * list — so this finds the key in the same page the board reads and returns
 * the single-member group `alertPage` builds for it. A key outside that page
 * is a 404, which is the page's own not-found. */
const getAlertDetail: Backend['getAlertDetail'] = async (key) => {
  const page = await get<AlertPageWire>('getAlertDetail', '/api/v1/alerts', { offset: 0, size: 100 })
  const row = page?.rows.find((r) => r.Key === key)
  if (!row) return null
  const text = `${row.Message} ${row.Link}`
  return {
    group: alertPage({ total: 1, rows: [row] })[0],
    // The evidence pane's pivots, read off the same two strings the mock
    // reads them from. A live alert carries no source list of its own, so
    // an address that is not one the mock knows is still shown: the wire
    // has no "known source" table to filter against, and dropping an
    // address the alert actually names would be worse than showing it.
    sources: [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])],
    hashes: [...new Set(text.match(/\b[0-9a-f]{64}\b/gi) ?? [])],
  }
}

/** GET /api/v1/source-health (health.rs `source_health`, L340) — the whole
 * document, including the webhook delivery health the page type has no field
 * for (typed and tested in contracts/operations.ts, deliberately not added
 * to types.ts — per scope). */
const getSourceHealth: Backend['getSourceHealth'] = async () => sourceHealth((await get<SourceHealthWire>('getSourceHealth', '/api/v1/source-health')) ?? EMPTY_HEALTH)

/** GET /api/v1/topology, joined with the two endpoints that carry liveness:
 * /api/v1/source-health for each sensor's feed and /api/v1/services for each
 * container's state. Three requests because the fleet's SHAPE and the fleet's
 * LIVENESS are three documents — topology.rs says so at the handler
 * ("static fleet shape; liveness joins live elsewhere", L707).
 *
 * A failure in any of the three throws rather than degrading the page to a
 * stack of unknowns: a topology that renders every container as `unknown`
 * reads as "nothing is running", which is the more dangerous of the two
 * wrong answers. */
const getTopology: Backend['getTopology'] = async () => {
  const [shape, health, services] = await Promise.all([
    get<TopologyWire>('getTopology', '/api/v1/topology'),
    get<SourceHealthWire>('getTopology', '/api/v1/source-health'),
    get<ServicesWire>('getTopology', '/api/v1/services'),
  ])
  if (!shape) throw new ApiError('unavailable', 'getTopology')
  return topology(shape, sensorFeeds(health ?? EMPTY_HEALTH), services ?? { available: false, services: [] })
}

/** GET /api/v1/store/dead-letters — the generic, allowlisted store
 * passthrough (stores.rs `generic`, L553) with the path parameter the handler
 * expects. There is no literal `/api/v1/store/dead-letters` route: the route
 * IS `/api/v1/store/{name}` and `name` is the allowlist key, which
 * `store_config` (L540) spells `dead-letters`. The page's query box is the
 * store's own `q`, a Lucene `query_string` with `default_operator: AND`
 * (L122) — passed through verbatim, exactly as canonical's own page does.
 *
 * 404 is the store's "unknown store", so the fallback is a handler that
 * exists rather than one that does not: an empty body still maps to an empty
 * list, and anything else throws. */
const getDeadLetters: Backend['getDeadLetters'] = async (query) => deadLetters((await get<{ total: number; rows: DeadLetterWire[] }>('getDeadLetters', '/api/v1/store/dead-letters', { offset: 0, size: 100, q: query.trim() || undefined })) ?? { total: 0, rows: [] })

/** DELETE /api/v1/store/dead-letters?q= — `generic_delete` (stores.rs
 * `generic_delete`, L601) on the SAME path-parameterised route, which the
 * handler guards: a `name` other than `dead-letters` is a 405, not a purge.
 *
 * Scoped by the query, not by ids: `delete_by_query` takes the same Lucene
 * `q` the GET searched, so this purges exactly the scope the operator was
 * looking at — the page's contract, and the dialog's own wording.
 * `purgeDeadLetters` is admin-only (authorize.ts:15), enforced before the
 * fetch by `liveQuery`, the same decision the mock tier makes. */
const purgeDeadLetters: Backend['purgeDeadLetters'] = async (query) => {
  await guardReadOnly('purgeDeadLetters')
  const wire = await request<PurgeDeadLettersWire>('purgeDeadLetters', '/api/v1/store/dead-letters', { method: 'DELETE', search: { q: query.trim() || undefined }, user: callerOf() })
  return purgedDeadLetters(wire ?? { deleted: 0 })
}

// ---- the reports studio (#79) -----------------------------------------------

/** The studio's whole read, fanned out over the three documents it is made
 * of: the template/element catalog (`reports_api::templates`), the saved
 * definitions (`reports_api::list_definitions`) and the generated history
 * (`GET /api/v1/store/generated-reports`, stores.rs `generic` on the
 * `generated-reports` key).
 *
 * The two lists are separate stores upstream and one page here — every one of
 * the four studio pages reads all three — so this is three requests, not a
 * round trip the backend offers. `size` is the handler's own cap (100); a
 * history longer than that is not paged by this tier, because the page has no
 * paging control for it: it filters what came back.
 *
 * `Promise.all`, like every other composite read here: a half-built studio is
 * worse than an erroring one. */
const getReports: Backend['getReports'] = async () => {
  const [templates, definitions, generated] = await Promise.all([
    get<ReportTemplatesWire>('getReports', '/api/v1/reports/templates'),
    get<ReportDefinitionsWire>('getReports', '/api/v1/reports/definitions'),
    get<GeneratedReportPageWire>('getReports', '/api/v1/store/generated-reports', { offset: 0, size: 100 }),
  ])
  const { reports } = generatedReportPage(generated ?? { total: 0, rows: [] })
  return {
    ...reportTemplates(templates ?? { templates: [], elements: [] }),
    definitions: reportDefinitions(definitions ?? { definitions: [] }),
    // The adapter names the page's list `reports`; the page type names it
    // `generated`, and the rename is a field name, not a mapping.
    generated: reports,
  }
}

/** POST or PUT /api/v1/reports/definitions[/{id}].
 *
 * The verb is the page's empty id, not a probe: `create_definition` 400s a
 * non-empty `id` (reports_api.rs, "id is assigned by the server") and
 * `replace_definition` 400s an id that disagrees with the path — so a create
 * carrying the id and a replace carrying none both fail on the wire, and
 * sending the id in the body is what the replace route asks for ("must match
 * the path or be omitted").
 *
 * The response envelope is the stored definition, and the page re-reads the
 * studio after a save, so what comes back is not merged over the draft. */
const saveReportDefinition: Backend['saveReportDefinition'] = async (definition) => {
  await guardReadOnly('saveReportDefinition')
  const body = reportDefinitionBody(definition)
  const wire = definition.id
    ? await request<ReportDefinitionEnvelopeWire>('saveReportDefinition', `/api/v1/reports/definitions/${encodeURIComponent(definition.id)}`, { method: 'PUT', body })
    : await post<ReportDefinitionEnvelopeWire>('saveReportDefinition', '/api/v1/reports/definitions', body)
  if (!wire) throw new ApiError('unavailable', 'saveReportDefinition')
  return savedReportDefinition(wire)
}

/** DELETE /api/v1/reports/definitions/{id}. Answers `{ deleted: id }`; the
 * page's own type is `void`, so there is nothing to adapt. */
const deleteReportDefinition: Backend['deleteReportDefinition'] = async (id) => {
  await guardReadOnly('deleteReportDefinition')
  await request<ReportDeletedWire>('deleteReportDefinition', `/api/v1/reports/definitions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** POST /api/v1/reports/definitions/{id}/generate — the "Generate now"
 * button on a saved definition. `origin` is the backend's own default
 * (`manual`), so the body is sent empty rather than repeating it; the route
 * takes `Option<Json<GenerateBody>>`, which is why an empty POST is legal. */
const generateReport: Backend['generateReport'] = async (definitionId) => {
  await guardReadOnly('generateReport')
  const wire = await post<GenerateReportWire>('generateReport', `/api/v1/reports/definitions/${encodeURIComponent(definitionId)}/generate`, {})
  return generateReportResult(wire)
}

/** DELETE /api/v1/reports/generated/{id}. As above: `{ deleted: id }` into a
 * `void`. */
const deleteGeneratedReport: Backend['deleteGeneratedReport'] = async (id) => {
  await guardReadOnly('deleteGeneratedReport')
  await request<ReportDeletedWire>('deleteGeneratedReport', `/api/v1/reports/generated/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** POST /api/v1/payloads/{hash}/report (lib.rs:670, `generate_payload_report`)
 * — the one-click "Generate PDF" on the payload page. The brief's list has no
 * endpoint for it; the route is registered, and its response is
 * `{ id, generated }`, so the id is read off the nested meta like any other.
 *
 * An ephemeral payload-scoped definition the backend builds itself and never
 * persists, so the returned report carries no `definitionId` — the history
 * page's own "one-off" label, which the mock also produces here. */
const generatePayloadReport: Backend['generatePayloadReport'] = async (hash) => {
  await guardReadOnly('generatePayloadReport')
  const wire = await post<GenerateReportWire>('generatePayloadReport', `/api/v1/payloads/${encodeURIComponent(hash)}/report`, {})
  return generateReportResult(wire)
}

/**
 * The wizard's final step: generate the draft, keeping it as a reusable
 * definition when asked.
 *
 * Two wire calls, and the draft must be a SAVED definition either way:
 * `reports_api::generate` takes an id and reads the definition out of the
 * store (reports_api.rs `generate`, "no such report definition" on a miss).
 * The backend has no ephemeral path for a default template the way
 * `generate_payload_report` has one for `payload` — that is the only
 * template the renderer shortcuts, and a wizard draft is arbitrary. So a
 * one-off is created, generated, then dropped again, which leaves the store
 * in the state the mock's `keep: false` branch leaves.
 *
 * It composes the three writes above rather than repeating them, so the
 * read-only guard and the bodies are the same code: a one-off re-reads
 * `/api/v1/config` twice more, which is one config document and not a
 * correctness question.
 *
 * A live deployment has no draft preview to show: see `previewReport`. */
const generateReportFrom: Backend['generateReportFrom'] = async (definition, keep) => {
  // A one-off is created, so it carries no id: `create_definition` 400s one.
  const saved = await saveReportDefinition(keep ? definition : { ...definition, id: '' })
  // `generateReport` is nullable because the mock misses a definition it has
  // dropped; on the wire the definition was just saved and a miss is a 404
  // this throws on, so a null here would be the mock, and the mock never
  // reaches this function.
  const report = await generateReport(saved.id)
  if (!report) throw new ApiError('unavailable', 'generateReportFrom')
  if (keep) return { report, definition: saved }
  await deleteReportDefinition(saved.id)
  return { report }
}

const getEvents: Backend['getEvents'] = async (filters) => {
  const [rows, values] = await Promise.all([
    get<EventsPageWire>('getEvents', '/api/v1/events', eventsQueryWindowed(filters, filters)),
    get<FilterValuesWire>('getEvents', '/api/v1/filter-values'),
  ])
  // Built here rather than with `eventsPage`, which maps the rows straight
  // through `toHoneypotEvent` and would leave the seven gap fields — the
  // explorer's Severity column among them — undefined on every live row.
  // `values` are this page's filter-picker vocabularies: this endpoint serves
  // keys only. Counted facets use the live `/api/v1/facets/:kind` adapter.
  return { ...paged(rows ?? EMPTY_PAGE), values: filterValues(values ?? EMPTY_VALUES) }
}

const getCommands: Backend['getCommands'] = async (page) => paged((await get<EventsPageWire>('getCommands', '/api/v1/events', commandsQuery(page))) ?? EMPTY_PAGE)

const searchHistory: Backend['searchHistory'] = async (query, page) => {
  // The page's query is a history search: free text over a wide window, not
  // a filter bar. `q` and `since` have no EventFilters field, so they are
  // added over the adapter's params rather than widened into it. `90d` is
  // three ASCII alphanumerics, inside events.rs's accepted `since` shape
  // (any value outside it is silently dropped for a 10-day window).
  if (!query.trim()) return { rows: [], total: 0, offset: 0 }
  const params: EventsQueryWire = { ...eventsQuery({}), ...eventsQueryWindowed({}, page ?? {}), q: query.trim(), since: '90d' }
  return paged((await get<EventsPageWire>('searchHistory', '/api/v1/events', params)) ?? EMPTY_PAGE)
}

const getEventDetail: Backend['getEventDetail'] = async (id) => {
  const wire = await get<EventPageWire>('getEventDetail', `/api/v1/event/${encodeURIComponent(id)}`)
  if (!wire) return null
  return {
    ...eventDetail(wire, detailRow(wire), readingOf(wire.sensor)),
    // `eventDetail` returns the caller's row through `toHoneypotEvent`,
    // which omits the seven gap fields; the page's own type needs them.
    event: pageEvent(detailRow(wire)),
  }
}

/** The row shape `toHoneypotEvent` reads, rebuilt from what
 * GET /api/v1/event/{id} actually serves.
 *
 * The detail endpoint builds its body by reading the document directly
 * rather than through `events::row_from_hit`, so it carries no pivots, no
 * port, no proto and no per-sensor detail — the four fields the row
 * conversion reads most of itself from. /api/v1/events has no id parameter,
 * so the row cannot be fetched by id either. Hence a row of the endpoint's
 * own fields with those four left empty: the event page shows the id, time,
 * sensor, source, session, hash list and full record, and its detail line
 * and kind/severity are the ones the wire cannot fill. */
const detailRow = (wire: EventPageWire): EventRow => ({
  id: wire.id,
  time: wire.time,
  sensor: wire.sensor,
  src_ip: wire.src_ip,
  country: '',
  port: '',
  proto: '',
  detail: '',
  session: wire.session,
  pivots: {
    persona: '', site: '', asset: '', fingerprint: '', fingerprint_kind: '', command: '', user: '', pass: '', path: '', shasum: '',
    asn: '', org: '', provider: '', alert: '', category: '', payload_class: '', tty_replay: '', ics_severity: '',
  },
  record: wire.record,
})

const getSessionDetail: Backend['getSessionDetail'] = async (id) => {
  const wire = await get<SessionDetailWire>('getSessionDetail', `/api/v1/sessions/${encodeURIComponent(id)}`)
  if (!wire) return null
  const detail = sessionDetail(wire)
  // `sequences` (the two curated multi-step detections) have no page field
  // and the adapter drops them; `recordingShasum` is not on the wire at all.
  return { ...detail, events: wire.events.map(pageEvent) }
}

const getRecordings: Backend['getRecordings'] = async (ip) => {
  // The recordings page counts `rows.length`, not a total, so this asks for
  // one full page — the handler's own cap is 100 — rather than pretending
  // to page something the page does not page.
  const wire = await get<RecordingsPageWire>('getRecordings', '/api/v1/recordings', { offset: 0, size: 100, ip })
  return recordingRows(wire ?? { total: 0, rows: [] })
}

const getReplayDetail: Backend['getReplayDetail'] = async (shasum) => {
  const [wire, page] = await Promise.all([
    get<ReplayWire>('getReplayDetail', `/api/v1/recordings/${encodeURIComponent(shasum)}`),
    get<RecordingsPageWire>('getReplayDetail', '/api/v1/recordings', { offset: 0, size: 100 }),
  ])
  // One recording is shared by every session that produced the same bytes,
  // so the sessions are the rows carrying this shasum. `ttylog_base64` has
  // no page field and the adapter drops it rather than adding one to reach
  // it; the attacker block needs /api/v1/investigate/ip/{ip}, which is the
  // sources slice's seam, so it stays null.
  return replayDetail(wire, recordingRows(page ?? { total: 0, rows: [] }).filter((row) => row.shasum === shasum))
}

const searchAll: Backend['searchAll'] = async (query) => {
  if (!query.trim()) return []
  // The wire groups its own hits and caps each group at 8, carrying the rest
  // as a count plus an overflow link — which is `moreHref`. It ranks nothing;
  // groups arrive in the handler's fixed order.
  const wire = await get<SearchResultWire>('searchAll', '/api/v1/search', { q: query.trim() })
  return searchGroups(wire ?? { query, redirect: null, groups: [], total: 0 })
}

/** The session user of the request currently being served, for the mounted
 * mutations below. `liveQuery` runs each dispatch inside this scope rather
 * than widening the mock's signatures (which `queries.ts` is generated from,
 * and pages are typed against). Never client input: it comes from
 * `runForRequest`'s `resolveUser`, the same source canonical forwards the
 * actor headers from.
 *
 * A scope, not a module binding (#196): a binding assigned per request is one
 * slot for the whole process, and every write below reads it AFTER
 * `guardReadOnly`'s config read has already suspended the request — long
 * enough for another request's assignment to land. A save/restore on exit
 * does not help; the interleave is inside the await, not at the boundary. */
const requestScope = new AsyncLocalStorage<{ user: Caller; requestId: string }>()

/** The operator of the request being served — undefined for the trusted
 * internal caller, which is what `actorHeaders` omits headers for. */
const callerOf = (): Caller => requestScope.getStore()?.user

/** POST /api/v1/workbench/runs. Mounted, and it forwards the session's
 * actor: workbench_api.rs's `require_actor` rejects a missing or blank
 * `x-actor-username` with a JSON 401, and takes run ownership from it.
 *
 * The config's options are keyed by analyzer id, each the three numbers the
 * backend validates; the body adapter sends them as they are. */
const startAnalysisRun: Backend['startAnalysisRun'] = async (config) => {
  const wire = await post<CreateWorkbenchRunWire>('startAnalysisRun', '/api/v1/workbench/runs', createWorkbenchRunBody(config.hash, config.analyzers, config.options), { mounted: true, user: callerOf() })
  return { run: workbenchRun(wire.run), reused: wire.reused }
}

const setRunChild: Backend['setRunChild'] = async (runId, analyzerId, action) => {
  const wire = await post<WorkbenchRunEnvelopeWire>('setRunChild', `/api/v1/workbench/runs/${encodeURIComponent(runId)}/children/${encodeURIComponent(analyzerId)}/${action}`, {}, { mounted: true, user: callerOf() })
  return workbenchRun(wire.run)
}

const abortGpuJob: Backend['abortGpuJob'] = async (jobId) => {
  const wire = await post<GpuAbortWire>('abortGpuJob', `/api/v1/gpu-queue/${encodeURIComponent(jobId)}/abort`, {}, { mounted: true, user: callerOf() })
  return wire.abort_requested
}

/** GET /api/v1/payloads. `aggs=sources` is not optional: stores.rs #2179
 * appends the per-source census (`source_buckets`) ONLY for that value, so
 * without it the page's `sources` rollup is silently empty — the backend
 * answers 200 with the rows and nothing to count. */
const getPayloads: Backend['getPayloads'] = async () => capturedPayloads((await get<PayloadPageWire>('getPayloads', '/api/v1/payloads', { offset: 0, size: 100, aggs: 'sources' })) ?? { total: 0, rows: [] })

/** GET /api/v1/payloads/{hash}. The detail doc is its own envelope — the
 * inventory row and the static-analysis and yara docs beside it — so the
 * page's `CapturedPayload` is rebuilt from `inventory` and the analysis is
 * reduced over the whole envelope. `risk` is the risk the static-analysis
 * doc itself carries; there is no endpoint that scores it separately. */
const getPayloadAnalysis: Backend['getPayloadAnalysis'] = async (hash) => {
  const wire = await get<PayloadDetailWire>('getPayloadAnalysis', `/api/v1/payloads/${encodeURIComponent(hash)}`)
  if (!wire?.inventory) return null
  return payloadAnalysis(wire, capturedPayload({ ...wire.inventory, _doc_id: hash }), wire.analysis?.Analysis?.StaticRiskScore ?? 0)
}

const getSandboxRun: Backend['getSandboxRun'] = async (job) => {
  const wire = await get<SandboxRunDetailWire>('getSandboxRun', `/api/v1/sandbox/${encodeURIComponent(job)}`, {}, { mounted: true })
  return wire ? sandboxRun(wire) : null
}

/** The Windows sandbox's live detonation (sandbox_submit.rs `/api/v1/sandbox/vnc`).
 * Mounted: it reads the spool straight off the host's disk. The endpoint
 * answers 404 for three different "nothing is running" reasons — no VNC
 * bridge configured, no request dir, no live detonation — so a 404 reads
 * as not-running rather than as an error, which is what it means. */
const getSandboxLiveStatus: Backend['getSandboxLiveStatus'] = async () => {
  const wire = await get<SandboxVncStatusWire>('getSandboxLiveStatus', '/api/v1/sandbox/vnc', {}, { mounted: true })
  return wire ? { running: true, job: wire.sha256 } : { running: false }
}

const getGhidraAnalysis: Backend['getGhidraAnalysis'] = async (sha) => {
  const wire = await get<GhidraRunDetailWire>('getGhidraAnalysis', `/api/v1/ghidra/${encodeURIComponent(sha)}`, undefined, { mounted: true })
  return wire ? ghidraAnalysis(wire) : null
}

const getCapeRun: Backend['getCapeRun'] = async (sha) => {
  const wire = await get<CapeRunWire>('getCapeRun', `/api/v1/cape/${encodeURIComponent(sha)}`)
  return wire ? capeRun(wire) : null
}

const getCapeRuns: Backend['getCapeRuns'] = async () => capeRuns((await get<CapeRunPageWire>('getCapeRuns', '/api/v1/store/cape', { offset: 0, size: 25 })) ?? { total: 0, rows: [] })

const getGithubAnalysis: Backend['getGithubAnalysis'] = async (sha) => {
  const wire = await get<GithubAnalysisWire>('getGithubAnalysis', `/api/v1/github-analysis/${encodeURIComponent(sha)}`, undefined, { mounted: true })
  return wire ? githubAnalysis(wire) : null
}

const getGithubAnalyses: Backend['getGithubAnalyses'] = async () => githubAnalysisPage((await get<GithubAnalysisPageWire>('getGithubAnalyses', '/api/v1/store/github-analysis', { offset: 0, size: 25 })) ?? { total: 0, rows: [] })

/** GET /api/v1/revdeck/{sha} (detail.rs `revdeck_run`) serves the doc's
 * `revdeck` field — and the importer nests the producer's own output (itself
 * `{exit_status, revdeck: {...}, sha256, …}`) one level deeper under that
 * label, so the answer is doubly nested. The wrapper carries the sha and the
 * exit status the inner payload does not. */
const getRevDeckRun: Backend['getRevDeckRun'] = async (sha) => {
  const wire = await get<{ revdeck?: { revdeck?: RevDeckRunWire; sha256?: string } }>('getRevDeckRun', `/api/v1/revdeck/${encodeURIComponent(sha)}`)
  const outer = wire?.revdeck
  return outer?.revdeck ? revDeckRun(outer.revdeck, outer.sha256 ?? sha) : null
}

const getRevDeckRuns: Backend['getRevDeckRuns'] = async () => revDeckRuns((await get<RevDeckRunPageWire>('getRevDeckRuns', '/api/v1/store/revdeck', { offset: 0, size: 25 })) ?? { total: 0, rows: [] })

const getArtifacts: Backend['getArtifacts'] = async (kind, key) => {
  const wire = await get<ArtifactListWire>('getArtifacts', `/api/v1/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(key)}`)
  return wire ? artifactRows(wire) : null
}

/** One artifact's bytes. `GET /api/v1/artifacts/{kind}/{key}/{filename}`
 * answers the reassembled body directly with the stored content-type in a
 * header (artifacts.rs `download`), not a JSON envelope — so this is one
 * request read as a blob, and the page's `contentType` comes off that
 * header rather than a second lookup. A 404 is the store's own "no such
 * artifact", which is this query's null. */
const getArtifactFile: Backend['getArtifactFile'] = async (kind, key, filename) => {
  const response = await raw(`/api/v1/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(key)}/${encodeURIComponent(filename)}`)
  if (response.status === 404) return null
  return { filename, kind, contentType: response.headers.get('content-type') ?? 'application/octet-stream', body: new Uint8Array(await response.arrayBuffer()) }
}

const getAnalyzerCatalog: Backend['getAnalyzerCatalog'] = async (hash) => {
  const wire = await get<AnalyzerCatalogWire>('getAnalyzerCatalog', '/api/v1/workbench/analyzers', { hash }, { mounted: true })
  return wire ? analyzerCatalog(wire) : null
}

/** The queueing half of a payload's follow-up actions. `sandbox` and
 * `ghidra` submit to their own spool-mounted endpoints; `github` submits
 * for publication (mounted, `confirm: 'publish'` is the backend's own
 * required literal). `pdf` has no submit endpoint in the canonical list —
 * the report route is the generated-reports store, a different thing —
 * so that one action stays on the mock rather than silently queueing
 * nothing. */
const queuePayloadAction: Backend['queuePayloadAction'] = async (hash, action) => {
  if (action === 'pdf') return 'PDF report generation started'
  const mounted = { mounted: true, user: callerOf() }
  if (action === 'sandbox') await post<SandboxSubmitWire>('queuePayloadAction', '/api/v1/sandbox/submit', { hash }, mounted)
  else if (action === 'ghidra') await post<GhidraSubmitWire>('queuePayloadAction', '/api/v1/ghidra/submit', { hash }, mounted)
  else await post<GithubAnalysisSubmitWire>('queuePayloadAction', '/api/v1/github-analysis/submit', { hash, confirm: 'publish' }, mounted)
  const labels = { sandbox: 'Sandbox detonation queued', ghidra: 'Ghidra decompilation queued on the GPU queue', github: 'Submitted for GitHub publication and scanning' } as const
  return labels[action]
}

/** There is no `GET /api/v1/results` in the Rust router and no canonical
 * `fetchResults` in docs/migration/server-functions.json — the brief's
 * mapping for it does not exist upstream. The page's `AnalysisResultsData`
 * is a composite, so it is answered from the five endpoints that do exist
 * rather than left on the mock, which would show an operator fabricated
 * runs.
 *
 * The `range` argument is NOT honoured: the one endpoint that could filter
 * by it (`/store/yara`) pages by offset, not by time, and the other four
 * are the queue and the catalogs — always shown whole, which is what the
 * mock does with them too. Results therefore cover the rows those endpoints
 * return, not a date window. */
const getAnalysisResults: Backend['getAnalysisResults'] = async () => {
  // The workbench orchestrator surface is spool-mounted (canonical L68).
  // Both of these scope to ONE operator, read from `x-actor-username`:
  // workbench_api.rs #3110 removed the `owner` query field as the access
  // check ("it isn't deserialized at all, so no handler can make an access
  // decision out of request data"), so no owner is sent here.
  const mounted = { mounted: true, user: callerOf() }
  const [queue, catalog, runs, recipes] = await Promise.all([
    get<GpuQueueWire>('getAnalysisResults', '/api/v1/gpu-queue'),
    get<AnalyzerCatalogWire[]>('getAnalysisResults', '/api/v1/workbench/analyzers', {}, mounted),
    get<WorkbenchRunListWire>('getAnalysisResults', '/api/v1/workbench/runs', { limit: 25 }, mounted),
    get<WorkbenchRecipeListWire>('getAnalysisResults', '/api/v1/workbench/recipes', {}, mounted),
  ])
  const results = gpuJobs(queue ?? []).concat(yaraRuns((await get<YaraRunPageWire>('getAnalysisResults', '/api/v1/store/yara', { offset: 0, size: 25 })) ?? { total: 0, rows: [] }))
  return {
    results,
    gpuQueue: gpuQueueOf(queue ?? []),
    analyzers: analyzerInfos(catalog ?? []),
    runs: workbenchRuns(runs ?? { runs: [] }),
    recipes: savedWorkbenchRecipes(recipes ?? { recipes: [] }),
  }
}

// ---- the Monitor slice: overview, ML, LLM, campaigns, auth ------------------

/** GET /api/v1/overview/kpis (overview.rs `kpis`, L115) — the five KPI tiles.
 *
 * Only three have a counterpart here and `toOverviewKpis` is a Pick of three.
 * The other two are a real GAP, named in the tests rather than invented:
 *
 * - **sessions** — no endpoint counts sessions. A session is an event
 *   correlation the events slice's own endpoint builds per row; there is no
 *   aggregation over them anywhere in the Rust tier.
 * - **payloads** — overview.rs's own module doc says it is not here: "captured
 *   payloads stay on the store listing the frontend already reads; their
 *   count is a doc count over captured artifacts, not an event aggregation".
 *   `/api/v1/payloads` (stores.rs `payloads`) serves that count, and the
 *   evidence slice already reads it — so the tile is filled from there below,
 *   which is the same number the backend means.
 *
 * `change24h` (a percent string) and `ready` (false while the hourly rollup
 * has not covered the window) are dropped by the adapter: `Kpi` has no field
 * for either. `ready: false` therefore renders as a real reading rather than
 * an error — the KPIs are live-aggregated, not wrong, when it is false. */
/** The overview's top attackers, the sources list's first rows. */
const TOP_SOURCES = 10

const getOverview: Backend['getOverview'] = async () => {
  const [kpis, payloads, recent, sources, catalog, countries] = await Promise.all([
    get<OverviewKpis>('getOverview', '/api/v1/overview/kpis'),
    get<PayloadPageWire>('getOverview', '/api/v1/payloads', { offset: 0, size: 15 }),
    get<EventsPageWire>('getOverview', '/api/v1/events', { offset: 0, size: 18 }),
    get<SourcesPageWire>('getOverview', '/api/v1/sources', { offset: 0, size: TOP_SOURCES }),
    get<SensorCatalogWire>('getOverview', '/api/v1/sensors/catalog'),
    // `parts` narrows the search, but the body still carries every key; only
    // `countries` is read here.
    get<Pick<Dashboard, 'countries'>>('getOverview', '/api/v1/overview/dashboard', { parts: 'countries' }),
  ])
  return {
    // No server-side "generated at": every endpoint answers with its own
    // timestamps, so this is the stamp of the read.
    generatedAt: new Date().toISOString(),
    // A missing leg is a broken endpoint, not an empty fleet: its tiles are
    // null (not available), and the other legs still fill the overview.
    kpis: (kpis ? toOverviewKpis(kpis) : KPI_GAPS).concat(payloads ? kpiTile('payloads', 'Payloads captured', toPayloadCount(payloads)) : kpiGap('payloads', 'Payloads captured')),
    // GAP (APIARY#3556): there is no 24 h hourly rollup on the wire. The
    // timeline used to be built from the first 18 events, which is not a 24 h
    // figure, so it is unavailable rather than approximated.
    timeline: null,
    // GAP: derived from the same 18 events as the timeline, so not a 24 h figure.
    topProtocols: null,
    // `/api/v1/sources` ranks by events (sources.rs), so the first rows are the top sources.
    topSources: sources ? overviewSources(sources, TOP_SOURCES) : null,
    topCountries: countries ? toCountRows(countries.countries) : null,
    // GAP: usernames and passwords are only ever paired, as one `top_creds`
    // key. The credential tab shows the pairs; no split list is invented.
    topUsernames: null,
    topPasswords: null,
    // The same gap the events slice fills at the seam (`pageEvent`): seven
    // fields a row cannot carry, filled here rather than left undefined.
    recentEvents: recent ? recent.rows.map(pageEvent) : null,
    // `null` when the catalog route has no answer; the catalog carries the
    // sensor name and its events, which is all the page's summary shows.
    sensors: catalog ? sensorCatalog(catalog) : null,
  }
}

/** The KPI tile a `/api/v1/payloads` doc count fills. Its `previous` is the
 * count itself: the overview's caption says "Last 24h vs. previous 24h" and a
 * store total is all-time, so the trend line is empty and the tile shows no
 * change rather than a fabricated one. */
const kpiTile = (id: string, label: string, value: number): Kpi => ({ id, label, value, previous: value, trend: [] })

/** A tile whose endpoint did not answer: null, rendered as not available. */
const kpiGap = (id: string, label: string): Kpi => ({ id, label, value: null, previous: null, trend: [] })

/** The three tiles `/overview/kpis` fills, when that endpoint is missing. */
const KPI_GAPS: Kpi[] = [kpiGap('events', 'Events'), kpiGap('sources', 'Unique sources'), kpiGap('logins', 'Successful logins')]

/** GET /api/v1/overview/dashboard — the four of the eighteen views tabs.
 *
 * `getOverviewViews` returns the whole `OverviewViews`, and the eighteen
 * slices of this one endpoint cover fifteen of its fields. The other twenty
 * are a GAP, kept as empty arrays rather than invented, and named in the
 * tests: vectors, ml-backlog, netflow, conformance, CVEs and the OS/TCP/ICS/
 * decoy/JA4/TLS/SSH/endlessh breakdowns have no dashboard slice — they are the
 * `/api/v1/charts/*` routes (already wired by the chart proxy in #82, and a
 * different endpoint this query does not reach), so the deep-dive tabs render
 * empty against live data while the live tab is fully live.
 *
 * `campaigns` and `payloads` are the two views the dashboard DOES carry, but
 * not in the shape the table renders: `payloads` is `DashboardPayloadRow`
 * (shasum, download path, count, a drill-down link and a VirusTotal link) and
 * the table wants kind/platform/size/verdict/sources/copies; `campaigns` is
 * not a dashboard slice at all. Both are filled from the endpoints that serve
 * them properly — `/api/v1/payloads?aggs=sources` (evidence's own query) and
 * `/api/v1/campaigns?size=15` — which is the same move the evidence and
 * sources slices already make. */
const getOverviewViews: Backend['getOverviewViews'] = async () => {
  const chart = <TChart extends ChartName>(name: TChart) => liveChart(name, new URLSearchParams())
  const [dashboard, payloads, campaigns, osDistribution, tcpClusters, icsFunctions, decoyRequests, decoyClients, ja4h, ja4l, ja4x, tls, ssh, endlessh, cves, mlBacklog, netflowBytes, netflowPackets] = await Promise.all([
    get<Dashboard>('getOverviewViews', '/api/v1/overview/dashboard'),
    get<PayloadPageWire>('getOverviewViews', '/api/v1/payloads', { offset: 0, size: 15, aggs: 'sources' }),
    get<CampaignPageWire>('getOverviewViews', '/api/v1/campaigns', { offset: 0, size: 15 }),
    chart('os-distribution'),
    chart('tcp-stack-clusters'),
    chart('ics-functions'),
    chart('decoy-requests'),
    chart('decoy-client-fingerprints'),
    chart('ja4h-fingerprints'),
    chart('ja4l-fingerprints'),
    chart('ja4x-fingerprints'),
    chart('tls-fingerprints'),
    chart('ssh-fingerprints'),
    chart('endlessh-held-histogram'),
    chart('dionaea-cves'),
    chart('ml-backlog'),
    chart('netflow-bytes'),
    chart('netflow-packets'),
  ])
  return {
    // A missing dashboard leaves every field it fills unavailable.
    ...(dashboard ? toOverviewViews(dashboard) : DASHBOARD_GAPS),
    payloads: payloads ? capturedPayloads(payloads).payloads : null,
    campaigns: campaigns ? networkCampaigns(campaigns) : null,
    // GAP: attack vectors (targeted ports and protocols per sensor) have no
    // endpoint on the wire.
    vectors: null,
    // GAP: protocol-conformance violations have no `/api/v1/charts` route.
    conformance: null,
    // A chart route with no answer (`null`) is unavailable, never an empty series.
    mlBacklog: mapped(mlBacklog, seriesPoints),
    netflowBytes: mapped(netflowBytes, seriesPoints),
    netflowPackets: mapped(netflowPackets, seriesPoints),
    cves: mapped(cves, barRows),
    osDistribution: mapped(osDistribution, pieRows),
    tcpClusters: mapped(tcpClusters, pieRows),
    icsFunctions: mapped(icsFunctions, barRows),
    decoyRequests: mapped(decoyRequests, barRows),
    decoyClients: mapped(decoyClients, barRows),
    ja4h: mapped(ja4h, barRows),
    ja4l: mapped(ja4l, barRows),
    ja4x: mapped(ja4x, barRows),
    tls: mapped(tls, barRows),
    ssh: mapped(ssh, barRows),
    endlessh: mapped(endlessh, barRows),
  }
}

/** Maps a chart the route answered, and passes its `null` (no route) through as unavailable. */
const mapped = <TWire, TRow>(wire: TWire | null, map: (w: TWire) => TRow): TRow | null => (wire === null ? null : map(wire))

/** The dashboard-endpoint fields, all unavailable when that endpoint has no answer. */
const DASHBOARD_GAPS: { [K in keyof DashboardViews]: null } = {
  heatmap: null, mapPoints: null, feeds: null, protocols: null, topIps: null, topPorts: null, countries: null, asns: null, providers: null,
  credentials: null, commands: null, clients: null, fingerprints: null, paths: null, alerts: null, alertCategories: null,
}

/** The page's own `CountRow` rollup: group by a key, count, keep the top
 * `limit`. The mock's `countBy`, verbatim in behaviour — three lines, no shared
 * helper exists for the seam. */
const counted = (values: Array<string | undefined>, limit: number): CountRow[] => {
  const counts = new Map<string, number>()
  for (const value of values) if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, count]) => ({ id: label, label, count }))
}

/** The Lucene window the old dashboard sent for "last 24 hours". */
const WINDOW_24H = '@timestamp:[now-24h TO now]'
/** Rows the windowed reads load. The count is exact (`total`); the breakdowns
 * are counted over these rows, so a busier window reports `breakdownRows`. */
const WINDOW_ROWS = 500

/** GET /api/v1/store/ml-anomalies + the ML documents the page needs, fanned out as one read.
 *
 * The ack sidecar and the stats rollup are the two things that cannot be
 * derived from the rows: `status` lives on the anomaly document but
 * `acknowledged` lives only in `/acks`, so the two stores are merged here
 * (the adapter owns the precedence), and `open` in `/stats` is an ALL-TIME
 * backlog, which is why it feeds its own labelled tile.
 *
 * The 24 h figures are a windowed read (`q`, the store's Lucene query).
 * `total24h` is the exact count in the window. The three breakdowns are
 * counted over the window's first rows, and `breakdownRows` says how many
 * when that is fewer than the total. A failed read is unavailable, not zero. */
const getMlAnomalies: Backend['getMlAnomalies'] = async () => {
  const [page, acks, stats, health, scores, day] = await Promise.all([
    get<StorePage<MlAnomalyRow>>('getMlAnomalies', '/api/v1/store/ml-anomalies', { offset: 0, size: 100 }),
    get<MlAcks>('getMlAnomalies', '/api/v1/ml-anomalies/acks'),
    get<MlAnomalyStats>('getMlAnomalies', '/api/v1/ml-anomalies/stats'),
    get<MlModelHealth[]>('getMlAnomalies', '/api/v1/ml-health'),
    get<SeriesWire[]>('getMlAnomalies', '/api/v1/charts/ml-anomaly-scores'),
    get<StorePage<MlAnomalyRow>>('getMlAnomalies', '/api/v1/store/ml-anomalies', { offset: 0, size: WINDOW_ROWS, q: WINDOW_24H }),
  ])
  const anomalies = toMlAnomalies(page ?? { total: 0, rows: [] }, acks ?? {})
  return {
    // `folded` is the page's own client-side grouping (same address and
    // second), which the adapter omits by type. Against live rows it is 1 for
    // every row: the grouping is over the LOADED page, and each stored
    // document is one anomaly. A real fold would need the windowed reads the
    // gap above names, so no row is claimed to stand for more than it is.
    // `MlAnomaly extends Record<string, unknown>`, so `Omit<MlAnomaly,
    // 'folded'>` is structurally vacuous — `keyof` is `string | number` and
    // the omission subtracts nothing, which is why the adapter's own return
    // type cannot carry the field this adds. The fields are all genuinely
    // present; only the omission's promise of which ones is inexpressible.
    anomalies: anomalies.map((a) => ({ ...a, folded: 1 }) as MlAnomaly),
    total24h: day ? day.total : null,
    openBacklog: toOpenBacklog(stats ?? { total: 0, open: 0 }),
    bySeverity: day && counted(day.rows.map((r) => toSeverity(r.severity)), 5),
    topSources: day && counted(day.rows.map((r) => r.src_ip ?? undefined), 10),
    eventTypes: day && counted(day.rows.map((r) => r.event_type ?? undefined), 10).map((row) => row.label),
    ...(day && day.total > day.rows.length ? { breakdownRows: day.rows.length } : {}),
    scoreTimeline: scorePoints(scores ?? []),
    modelHealth: (health ?? []).map(toModelHealth),
  }
}

/** `/api/v1/charts/ml-anomaly-scores` → the page's `ScorePoint` series. The
 * chart answers one `Series` per model (`{name, points: [{time, value}]}`),
 * taken from the data itself so a new detector shows up with no dashboard
 * change; the page's `ScorePoint` is the transpose — one row per instant with
 * a fixed field per detector. The three the page names are filled; a detector
 * outside that set has no column and is dropped rather than folded into one of
 * them, which is the same reason the adapter's `modelScores` is a fixed object.
 */
const scorePoints = (series: SeriesWire[]): ScorePoint[] => {
  const byModel = new Map(series.map((s) => [s.name, new Map(s.points.map((p) => [p.time, p.value]))]))
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p.time)))].sort()
  const scoreOf = (name: string, time: string): number => byModel.get(name)?.get(time) ?? 0
  return times.map((time) => ({ time, isolationForest: scoreOf('isolation_forest', time), lstmAe: scoreOf('lstm_ae', time), hbos: scoreOf('hbos', time) }))
}

/** POST /api/v1/ml-anomalies/ack-all (detail.rs `ml_anomaly_ack_all`, L754).
 * The handler takes a JSON body even though every field has a default, so
 * `{}` is sent at minimum; the actor rides in it when there is one. The
 * sweep is the WHOLE index — every open anomaly, not the loaded page — so the
 * returned `changed` is what the backend says it changed and the page re-reads
 * the list for the rest. Admin-only by `ADMIN_QUERIES`, before this runs.
 *
 * One deliberate divergence from the mock: a row carrying a DISPOSITION is
 * refused by this endpoint (the handler will not overwrite an operator
 * verdict with an acknowledgement), so a live `changed` can be lower than the
 * number of open rows on screen. That is the backend's own answer, not a
 * count of what was skipped. */
const acknowledgeAllAnomalies: Backend['acknowledgeAllAnomalies'] = async () => {
  await guardReadOnly('acknowledgeAllAnomalies')
  const actor = await actorOf()
  const wire = await post<MlAckAllResponse>('acknowledgeAllAnomalies', '/api/v1/ml-anomalies/ack-all', actor ? { actor } : {})
  return toAckAllCount(wire)
}

/** The actor `detail.rs` stamps onto the ack and disposition documents. The
 * Rust tier has no session concept, so it is a body field on the stated trust
 * model that this process is the only caller and the service token gates it —
 * the same shape the settings slice's writes use (`actor_subject` /
 * `actor_username`), and for the same reason: read from the session this
 * process already holds, never from client input. A session that does not
 * resolve sends no actor at all, which records a blank actor — worse than no
 * attribution, never worse than a fabricated one.
 *
 * One store read per WRITE, not per id, so acking a page of 25 is one read and
 * twenty-five POSTs. */
const actorOf = async (): Promise<string> => (await sessionOf()).username

/** POST /api/v1/ml-anomalies/ack (detail.rs `ml_anomaly_ack`, L630) — one
 * anomaly per call, so N ids is N requests. `ack: false` un-acks, which is how
 * the anomaly panel's toggle reopens a row; the page's signature
 * `acknowledgeAnomalies(ids)` carries no flag, so the seam reads the intent
 * off the ids it was handed — every id is acked, which is what that query
 * means on the mock and what its only call site does. Returns how many
 * changed, read back off the records the POST wrote. */
const acknowledgeAnomalies: Backend['acknowledgeAnomalies'] = async (ids) => {
  await guardReadOnly('acknowledgeAnomalies')
  const actor = await actorOf()
  const records: MlAckRecord[] = []
  for (const key of ids) records.push(await post<MlAckRecord>('acknowledgeAnomalies', '/api/v1/ml-anomalies/ack', mlAckBody(key, true, actor)))
  return toAckedCount(records)
}

/** POST /api/v1/ml-anomalies/disposition (detail.rs `ml_anomaly_disposition`,
 * L857) — the operator's verdict, written ONTO the anomaly document. The
 * response echoes what was sent, so the seam's `void` return drops it and the
 * page re-reads the anomaly, as it does on the mock. `mlDispositionBody`
 * refuses 'acknowledged': the backend's closed set is the three verdicts plus
 * the 'open' retraction, and the ack lives only in the sidecar, so nothing the
 * page can send is lost. */
const setAnomalyDisposition: Backend['setAnomalyDisposition'] = async (ids, status, reason) => {
  await guardReadOnly('setAnomalyDisposition')
  const actor = await actorOf()
  for (const key of ids) await post<MlDispositionResponse>('setAnomalyDisposition', '/api/v1/ml-anomalies/disposition', mlDispositionBody(key, status, reason, actor))
}

/** GET /api/v1/store/llm-analysis (stores.rs `generic` over the
 * `llm-analysis` allowlist key, L491) — the page's own list, unpaged like the
 * mock's. The handler clamps `size` to 100 (L128), so that is the page size
 * asked for rather than one this seam invents. */
const getLlmAnalyses: Backend['getLlmAnalyses'] = async () => ((await get<StorePage<LlmAnalysisRow>>('getLlmAnalyses', '/api/v1/store/llm-analysis', { offset: 0, size: 100 })) ?? { total: 0, rows: [] }).rows.map(toLlmAnalysis)

/** GET /api/v1/llm-search?q= (llm_search.rs `search`) — always HTTP 200, and
 * `available: false` is an ANSWER about the deployment (embeddings not
 * configured), not a failure: the page renders the backend's own reason. An
 * empty-but-configured search is `available: true` with no hits and stays one.
 *
 * An empty query never reaches the backend: `q` is required and a blank one
 * answers an error, so the page's no-search-yet state is returned here rather
 * than as a failed call. */
const semanticSearch: Backend['semanticSearch'] = async (query) => {
  if (!query.trim()) return { available: true, hits: [] }
  return toSemanticSearch((await get<LlmSearchResponse>('semanticSearch', '/api/v1/llm-search', { q: query.trim() })) ?? { available: false, reason: 'the backend returned no body' })
}

/** GET /api/v1/store/agent-campaigns (stores.rs `generic` over the
 * `agent-campaigns` allowlist key, L500) — the page's list, unpaged like the
 * mock's and clamped to the handler's own 100. */
const getAgentCampaigns: Backend['getAgentCampaigns'] = async () => ((await get<StorePage<AgentCampaignRow>>('getAgentCampaigns', '/api/v1/store/agent-campaigns', { offset: 0, size: 100 })) ?? { total: 0, rows: [] }).rows.map(toAgentCampaign)

/** GET /api/v1/store/agent-campaigns/{id}. PR #3535 did not add the brief's
 * `/campaigns/{id}/events`; the nested evidence stays on `campaign.events`,
 * while the full-event tab remains empty rather than making one call per id. */
const getAgentCampaign: Backend['getAgentCampaign'] = async (id) => {
  const row = await get<AgentCampaignRow>('getAgentCampaign', `/api/v1/store/agent-campaigns/${encodeURIComponent(id)}`)
  if (!row) return null
  return { campaign: toAgentCampaign(row), events: [] }
}

/** GET /api/v1/store/llm-analysis/{id}. Related evidence keeps using the
 * existing session/events endpoints according to the analysis scope. */
const getLlmAnalysis: Backend['getLlmAnalysis'] = async (id) => {
  const row = await get<LlmAnalysisRow>('getLlmAnalysis', `/api/v1/store/llm-analysis/${encodeURIComponent(id)}`)
  if (!row) return null
  const analysis = toLlmAnalysis({ ...row, _doc_id: id })
  if (analysis.sessionId) return { analysis, events: (await getSessionDetail(analysis.sessionId))?.events ?? [] }
  const search = analysis.payloadSha256 ? { shasum: analysis.payloadSha256 } : analysis.srcIp ? { ip: analysis.srcIp } : null
  const events = search ? paged((await get<EventsPageWire>('getLlmAnalysis', '/api/v1/events', { offset: 0, size: 100, ...search })) ?? EMPTY_PAGE).rows : []
  return { analysis, events }
}

/** GET /api/v1/store/ml-anomalies/{id}. The acknowledgement remains in its
 * sidecar, and the source event remains on the existing event endpoint. */
const getAnomaly: Backend['getAnomaly'] = async (id) => {
  const row = await get<MlAnomalyRow>('getAnomaly', `/api/v1/store/ml-anomalies/${encodeURIComponent(id)}`)
  if (!row) return null
  const [acks, detail] = await Promise.all([
    get<MlAcks>('getAnomaly', '/api/v1/ml-anomalies/acks'),
    row.source_event_id ? getEventDetail(row.source_event_id) : null,
  ])
  const [anomaly] = toMlAnomalies({ total: 1, rows: [{ ...row, _doc_id: id }] }, acks ?? {})
  return { anomaly: { ...anomaly, folded: 1 } as MlAnomaly, event: detail?.event ?? null }
}

/** GET /api/v1/store/auth-events: the list the page shows, and the 24 h
 * figures, which are a windowed read (`q`, as the ML slice does) and not a
 * count over the first rows of the list. `failed24h` is the exact count in the
 * window. `byClient` and `topSources` are counted here over the window's first
 * rows, and `breakdownRows` says how many when that is fewer than the total.
 * Neither `/api/v1/store/auth-events` (a raw passthrough) nor anything else
 * exposes a Keycloak-event aggregation. */
const getAuthEvents: Backend['getAuthEvents'] = async () => {
  const [page, day] = await Promise.all([
    get<StorePage<AuthEventRow>>('getAuthEvents', '/api/v1/store/auth-events', { offset: 0, size: 100 }),
    get<StorePage<AuthEventRow>>('getAuthEvents', '/api/v1/store/auth-events', { offset: 0, size: WINDOW_ROWS, q: WINDOW_24H }),
  ])
  const inWindow = day ? day.rows.map(toAuthFailure) : null
  return {
    events: (page ?? { total: 0, rows: [] }).rows.map(toAuthFailure),
    failed24h: day ? day.total : null,
    byClient: inWindow && counted(inWindow.map((e) => e.clientId), 10),
    topSources: inWindow && counted(inWindow.map((e) => e.ip), 10),
    ...(day && day.total > day.rows.length ? { breakdownRows: day.rows.length } : {}),
  }
}

/** A query no backend route serves yet. It throws rather than answering
 * empty, so the page's unavailable state names the gap instead of showing a
 * calm empty list. `gap` is the issue that tracks the missing route. */
const unavailable = (endpoint: string, gap: string): ApiError => new ApiError('unavailable', endpoint, { detail: `${NOT_YET} (${gap})` })

/** A list read's answer, or an error when there is none. A 404 on a list is a
 * route this tier calls that the backend does not register; it must never
 * read as an empty list. */
const listOf = <T>(endpoint: string, wire: T | null): T => {
  if (wire === null) throw new ApiError('unavailable', endpoint, { detail: 'the list did not answer' })
  return wire
}

/** The events list, as the source and session reads want it: one page of at
 * most 100 rows (the handler's own clamp), newest first. */
const EVENT_LIST_SIZE = 100
const RANGES = new Set(['1h', '6h', '24h', '7d', '30d'])
/** The `since` window for a page range. `all` is `365d`, not the handler's
 * silent default: an omitted or unparseable `since` falls back to 10 days
 * (events.rs `since_to_range`), which would narrow "all" without saying so. */
const sinceOf = (range?: string): { since: string } => ({ since: range && RANGES.has(range) ? range : range === 'all' ? '365d' : '24h' })

/** GET /api/v1/events — the wire page the source and session reads derive from. */
const eventsWire = async (endpoint: string, search: EventsQueryWire): Promise<EventsPageWire> =>
  listOf(endpoint, await get<EventsPageWire>(endpoint, '/api/v1/events', { offset: 0, size: EVENT_LIST_SIZE, ...search }))

/** GET /api/v1/events?ip=&since= — the source's events. The page's list, and
 * the most recent 100 of them: the handler's ceiling. */
const getSourceEvents: Backend['getSourceEvents'] = async (ip, range) => paged(await eventsWire('getSourceEvents', { ip, ...sinceOf(range) })).rows

/** GET /api/v1/events?ip=&since= as the source's timeline (sourceTimeline).
 * Only this source's events: see the adapter for what the mock adds that the
 * backend does not serve for a source yet. */
const getSourceTimeline: Backend['getSourceTimeline'] = async (ip, range) => sourceTimeline((await eventsWire('getSourceTimeline', { ip, ...sinceOf(range) })).rows)

/** The source's sessions, derived from the same events read. A session is
 * counted only from the events this read returns, so a session whose other
 * events fall past the 100-row ceiling is under-counted. */
const getSourceSessions: Backend['getSourceSessions'] = async (ip, range) => sessionSummaries(paged(await eventsWire('getSourceSessions', { ip, ...sinceOf(range) })).rows)

/** GET /api/v1/events?session= — one session's events. */
const getSessionEvents: Backend['getSessionEvents'] = async (sessionId) => paged(await eventsWire('getSessionEvents', { session: sessionId, since: '365d' })).rows

/** GET /api/v1/events?shasum= — the download events that carried a payload,
 * and the sessions and addresses behind them. All three are derived from
 * those download rows: the sessions are the ones that downloaded it, not the
 * wider sessions they belong to. */
const getPayloadDelivery: Backend['getPayloadDelivery'] = async (hash) => {
  const events = paged(await eventsWire('getPayloadDelivery', { shasum: hash, since: '365d' })).rows
  return { events, sessions: sessionSummaries(events), sources: sourceCounts(events) }
}

/** The /24 an IPv4 address belongs to, named as the correlator names its
 * campaigns (correlator.rs `ip_prefix` at 24). Null for anything else. */
const cidr24 = (ip: string): string | null => (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ? `${ip.split('.').slice(0, 3).join('.')}.0/24` : null)

/** GET /api/v1/investigate/ip/{ip} (organization and country), GET /api/v1/sources
 * (the addresses in the same /24) and GET /api/v1/campaigns (the correlator's
 * campaign for that /24). Three reads, one page.
 *
 * Two gaps are named here, not hidden. `asn` is the AS number, which the
 * ip profile does not carry (only the organization), so it is left absent and
 * the page shows the organization without a link. The network-v1 document this
 * would otherwise read (`/sources/{ip}/network`) is not served on real data
 * (Xore/APIARY#3554). The neighbours come from the top 1000 addresses by
 * events, so a neighbour outside that list is not shown. */
const getSourceNetwork: Backend['getSourceNetwork'] = async (ip) => {
  const [profile, sources, campaigns] = await Promise.all([
    get<IpProfileWire>('getSourceNetwork', `/api/v1/investigate/ip/${encodeURIComponent(ip)}`),
    get<SourcesPageWire>('getSourceNetwork', '/api/v1/sources', { offset: 0, size: 1000 }),
    get<CampaignPageWire>('getSourceNetwork', '/api/v1/campaigns', { size: 100 }),
  ])
  const cidr = cidr24(ip)
  if (!profile || !cidr) return null
  const neighbours = sourceProfiles(listOf('getSourceNetwork', sources)).filter((p) => p.ip !== ip && cidr24(p.ip) === cidr)
  const campaign = networkCampaigns(listOf('getSourceNetwork', campaigns)).find((c) => c.cidr === cidr)
  // The ip profile names the organization, not the AS number, so `asn` is
  // absent rather than a placeholder.
  return { cidr, ...(profile.asn ? { org: profile.asn } : {}), ...(profile.country ? { country: profile.country } : {}), neighbours, ...(campaign ? { campaign } : {}) }
}

/** GET /api/v1/sources/{ip}/identities — the attacker document the address
 * belongs to. A 404 is "no identity for this address", which is the answer. */
const getSourceIdentity: Backend['getSourceIdentity'] = async (ip) => {
  const row = await get<AttackerEntityWire>('getSourceIdentity', `/api/v1/sources/${encodeURIComponent(ip)}/identities`)
  return row ? attacker(row) : null
}

/** GET /api/v1/investigate/blocked-ips → the addresses whose block holds now. */
const getBlockedIps: Backend['getBlockedIps'] = async () => activeBlockIps(listOf('getBlockedIps', await get<BlockedIpsWire>('getBlockedIps', '/api/v1/investigate/blocked-ips')))

// ---- queries with no backend route yet: they throw, they never answer empty ----

const getAsn: Backend['getAsn'] = async () => {
  throw unavailable('getAsn', 'Xore/APIARY#3554')
}
const getEntityTimeline: Backend['getEntityTimeline'] = async () => {
  throw unavailable('getEntityTimeline', 'Xore/APIARY#3554')
}
const getRelated: Backend['getRelated'] = async () => {
  throw unavailable('getRelated', 'Xore/APIARY#3554')
}
const getIoc: Backend['getIoc'] = async () => {
  throw unavailable('getIoc', 'Xore/APIARY#3554')
}
const getIocCatalog: Backend['getIocCatalog'] = async () => {
  throw unavailable('getIocCatalog', 'Xore/APIARY#3554')
}
const getFacets: Backend['getFacets'] = async () => {
  throw unavailable('getFacets', 'Xore/APIARY#3524')
}

/** There is no preview route (APIARY#3524): the backend renders a stored
 * report (`reports_api::render_definition_to_stored`) but does not render a
 * draft without saving it. So a live deployment has no preview and answers
 * `null` without a request. The wizard runs its checks without counts and
 * shows the document's structure only, and the mock keeps its preview. */
const previewReport: Backend['previewReport'] = async () => null

/** This slice's queries, and nothing else. Each keeps the mock
 * implementation's signature exactly — `queries.ts` is generated from it and
 * pages are typed against it.
 *
 * DELIBERATELY ABSENT, and the reason is the one thing in this slice worth
 * reading before changing anything:
 *
 * - The reports gap list (`sandbox-runs` / payload search for the artifact
 *   pickers) is in contracts/reports.ts, typed and deliberately unadapted: no
 *   page type exists to adapt them to.
 *
 * Gaps that are wired anyway, and why, are in the slice's own tests: the
 * lossy scope filters, the scope keys with no page field, `schedule.enabled`
 * and `schedule.failures`, the wire fields the page types do not carry, and
 * the `{ deleted }` responses nothing adapts. */
const LIVE: Partial<Record<keyof Backend, (...args: never[]) => Promise<unknown>>> = {
  getEvents,
  getCommands,
  searchHistory,
  getEventDetail,
  getSessionDetail,
  getSessionEvents,
  getRecordings,
  getReplayDetail,
  searchAll,
  getSettings,
  getPreferences,
  savePreferences,
  getShellConfig,
  validateConfig,
  saveConfigSection,
  rollbackConfig,
  runServiceAction,
  getMail,
  getProblemReports,
  submitProblemReport,
  setProblemStatus,
  getPayloads,
  getPayloadDelivery,
  getPayloadAnalysis,
  getAnalysisResults,
  getAnalyzerCatalog,
  startAnalysisRun,
  setRunChild,
  abortGpuJob,
  getSandboxRun,
  getSandboxLiveStatus,
  getGhidraAnalysis,
  getCapeRuns,
  getCapeRun,
  getGithubAnalyses,
  getGithubAnalysis,
  getRevDeckRuns,
  getRevDeckRun,
  getArtifacts,
  getArtifactFile,
  queuePayloadAction,
  // Operations (#77)
  getSensorCatalog,
  getSensorDetail,
  getAlerts,
  getOpenAlertCount,
  setAlertsAcknowledged,
  acknowledgeAllAlerts,
  getAlertDetail,
  getSourceHealth,
  getTopology,
  getDeadLetters,
  purgeDeadLetters,
  // Sources and correlation (#76)
  getSourceProfiles,
  getSourceEvents,
  getSourceSessions,
  getSourceTimeline,
  getSourceNetwork,
  getSourceIdentity,
  getAttackers,
  getNetworkCampaigns,
  getInfraClusters,
  getKillChain,
  getIpProfile,
  setIpBlocked,
  getNetwork,
  getAsn,
  getCampaign,
  getIdentity,
  getCluster,
  getIdentityFusion,
  getEntityTimeline,
  getRelated,
  getIoc,
  getIocCatalog,
  getFacets,
  getBlockedIps,
  resolveHash,
  // Tools (#80)
  getCanarytokens,
  createCanarytoken,
  getCredentials,
  provisionCredential,
  rotateCredential,
  linkCredentialToken,
  // Reports (#79)
  getReports,
  saveReportDefinition,
  deleteReportDefinition,
  generateReport,
  deleteGeneratedReport,
  generatePayloadReport,
  generateReportFrom,
  previewReport,
  // Monitor (#74)
  getOverview,
  getOverviewViews,
  getMlAnomalies,
  getAnomaly,
  acknowledgeAnomalies,
  acknowledgeAllAnomalies,
  setAnomalyDisposition,
  getLlmAnalyses,
  getLlmAnalysis,
  semanticSearch,
  getAgentCampaigns,
  getAgentCampaign,
  getAuthEvents,
  // Public queries that run before sign-in: the session user is already
  // resolved by runForRequest and stored in the request scope, so this
  // returns the caller (or null for unauthenticated) without calling the
  // backend — letting the auth redirect in _layout.tsx fire before any
  // backend-dependent query runs.
  getSessionUser: async () => callerOf() ?? null,
}

/** The guarded live implementation of `name`, or undefined when this slice
 * does not implement it or when no BACKEND_URL is configured.
 *
 * The authorization decision is the same one `backend()` applies, so a role
 * is refused identically whichever tier answers. */
export function liveQuery(name: string, user: Caller, requestId: string = crypto.randomUUID()): ((...args: unknown[]) => Promise<unknown>) | undefined {
  if (!isLiveBackend()) return undefined
  const query = LIVE[name as keyof Backend] as ((...args: unknown[]) => Promise<unknown>) | undefined
  if (!query) return undefined
  return async (...args) => {
    if (user !== undefined) {
      const decision = authorize(name, user)
      if (decision === 'sign-in') throw new ApiError('expired', name)
      if (decision === 'admin-only') throw new ApiError('forbidden', name)
    }
    // The mounted mutations read the actor off the request's scope rather
    // than taking it as a parameter: the mock's signatures are the contract
    // and none of them carry a caller. run(), not an assignment — see
    // requestScope.
    return requestScope.run({ user, requestId }, () => query(...args))
  }
}

/** The names this module answers, for the report and the tests. */
export const liveQueryNames = (): string[] => Object.keys(LIVE)

/** The shell's export cap, read through the same `getShellConfig` the pages
 * use — `GET /api/v1/config`'s `behavior.max_export_rows`, whose default is
 * 5000 (config.rs:804). The download route needs this through its own path,
 * not `liveQuery`: `liveQuery` is reachable only from `runForRequest`'s
 * server-function funnel, and a direct handler in `serveDownload` never
 * passes through that. */
export async function liveShellCap(): Promise<number> {
  return (await getShellConfig()).behavior.maxExportRows
}

/** Re-exported for the test that asserts the response handling degrades
 * rather than throwing on a body the endpoints really send. */
export const __testing = { paged, pageEvent, get, EMPTY_PAGE }
