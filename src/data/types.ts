// Domain types the UI renders. Shaped after the canonical BFF responses so the
// mock implementations in ./mock can be swapped for real server functions
// without touching page code.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** The application protocol a sensor recorded (`network.protocol`): ssh,
 * telnet, http, smb, modbus, s7comm, sip, dns, dicom, … as each sensor names it. */
export type Protocol = string

export type EventType =
  | 'connection'
  | 'login.failed'
  | 'login.success'
  | 'command.input'
  | 'file.download'
  | 'http.request'
  | 'ids.alert'
  /** A non-HTTP application request: ICS, SIP, DNS, DICOM, SMTP, IKE. Not the
   * fallback for an unrecognised live event: it claims a protocol the row does
   * not show. The live seam falls to `connection` instead. */
  | 'protocol.request'

/** One value in a sensor's own fields: JSON, as the sensor wrote it. */
export type FieldValue = string | number | boolean | null | FieldValue[] | { [key: string]: FieldValue }
export type SensorFields = Record<string, FieldValue>

export type SensorStatus = 'online' | 'degraded' | 'offline'

export interface SessionUser {
  name: string
  email: string
  roles: string[]
}

export interface Sensor extends Record<string, unknown> {
  /** The sensor name events carry in `event.sensor`, e.g. `cowrie`, `conpot-s7-1200`. */
  id: string
  name: string
  /** The family, e.g. Cowrie, Conpot. */
  kind: string
  /** One phrase: what this sensor is and what it captures. */
  what: string
  /** Listening ports on the sensor host. */
  ports: Array<{ proto: 'tcp' | 'udp'; port: number }>
  /** The decoy identity it wears: a fictional organization, site and assets. */
  persona?: { id: string; organization: string; site: string; assets: string[] }
  protocols: Protocol[]
  location: string
  status: SensorStatus
  eventsLast24h: number
  lastSeen: string
}

export interface HoneypotEvent extends Record<string, unknown> {
  id: string
  timestamp: string
  sensor: string
  /** Absent on sensor-endpoint rows, which do not say which protocol they are. */
  protocol?: Protocol
  type: EventType
  /** Absent when the backend does not classify the row. Never defaulted to
   * `info`: that would claim "nothing known" as a classification. */
  severity?: Severity
  srcIp: string
  /** What the request itself claimed as its source (X-Forwarded-For), when
   * it disagrees with the address portbridge recorded for the connection.
   * The connection is the stronger evidence and is `srcIp`; a claim like
   * this is most likely forged, and is kept because hiding it would hide
   * the attempt. */
  srcIpClaimed?: string
  /** Absent when the row does not carry the source port. */
  srcPort?: number
  dstPort: number
  country?: string
  asn?: string
  sessionId?: string
  username?: string
  password?: string
  command?: string
  summary?: string
  /** The sensor's own event name: `cowrie.login.failed`, `handshake`, `NEW_CONNECTION`, … */
  eventName: string
  /** The sensor's own `honeypot.*` object, as that sensor writes it. */
  fields: SensorFields
  /** The decoy identity that was targeted (`honeypot.persona_id` and
   * friends); absent on sensors that wear none. */
  persona?: string
  site?: string
  asset?: string
  organization?: string
  /** The client fingerprint this event carries, and what kind it is
   * (HASSH, JA4, User-Agent, SSH client, client banner, SSH pubkey). */
  fingerprint?: string
  fingerprintKind?: string
  /** ATT&CK techniques the pipeline mapped this event to. */
  techniques: string[]
  /** The source network: organization, provider class, city. */
  org?: string
  provider?: ProviderClass
  city?: string
  /** What an HTTP request carried (php-code, path-traversal, …). */
  payloadClass?: string
  /** DNP3 control-function severity: an unconfirmed operate is critical. */
  icsSeverity?: 'critical' | 'high'
  /** The flow's Community ID (`network.community_id`), written by the flow
   * sensors in front of the honeypots; the sharpest pivot into packet and
   * IDS tools. Absent on events no flow sensor saw. */
  communityId?: string
}

/** How the source network is classified (`source.as.type`). */
export type ProviderClass = 'network' | 'hosting' | 'cloud' | 'scanner' | 'blocklist:spamhaus'

export interface AttackSource extends Record<string, unknown> {
  ip: string
  country: string
  asn: string
  org: string
  events: number
  sessions: number
  firstSeen: string
  lastSeen: string
  riskScore: number
  tags: string[]
  provider: ProviderClass
  city: string
}

export interface Kpi {
  id: string
  label: string
  /** Null when the endpoint that fills this tile has no answer. */
  value: Unavailable<number>
  previous: Unavailable<number>
  /** Hourly values oldest → newest, for sparklines. */
  trend: number[]
}

export interface TimeBucket extends Record<string, unknown> {
  /** ISO timestamp of the bucket start. */
  time: string
  total: number
  byProtocol: Record<Protocol, number>
}

export interface CountRow extends Record<string, unknown> {
  id: string
  label: string
  count: number
}

/** A Monitor widget's data, or `null` when the backend cannot supply it: no
 * endpoint carries the figure yet (APIARY#3556 for the sessions count and a
 * true 24 h timeline), or the chart route the widget reads is missing. A
 * widget given `null` renders "not available from the backend yet", never an
 * empty list or a zero that reads like a measurement. An empty array is always
 * a real answer ("nothing in the window"). */
export type Unavailable<T> = T | null

/** One top attacker on the overview. `/api/v1/sources` ranks by events over
 * the last 10 days (not 24 h) and carries no ASN, org, risk score, tags,
 * provider or city, so none of those is here: a field the wire does not
 * supply is left out, not set to a placeholder. */
export interface OverviewSource extends Record<string, unknown> {
  ip: string
  /** Absent when the wire has no country for the address. */
  country?: string
  events: number
  firstSeen: string
  lastSeen: string
}

export interface OverviewData {
  generatedAt: string
  kpis: Kpi[]
  /** Unavailable: a 24 h protocol timeline needs a windowed rollup the backend
   * does not serve yet (APIARY#3556). */
  timeline: Unavailable<TimeBucket[]>
  /** Unavailable: derived from the same 18 recent events as the timeline, so
   * it is not a 24 h figure. */
  topProtocols: Unavailable<Protocol[]>
  topSources: Unavailable<OverviewSource[]>
  topCountries: Unavailable<CountRow[]>
  /** Unavailable: the wire serves usernames and passwords only as `user / pass`
   * pairs (`top_creds`), and the credentials tab shows those. */
  topUsernames: Unavailable<CountRow[]>
  /** Unavailable: see `topUsernames`. */
  topPasswords: Unavailable<CountRow[]>
  recentEvents: Unavailable<HoneypotEvent[]>
  sensors: Unavailable<SensorSummary[]>
}

// ---- Monitor: ML anomalies -------------------------------------------------

export const DISPOSITIONS = ['false_positive', 'true_positive', 'benign_known'] as const
export type Disposition = (typeof DISPOSITIONS)[number]
export type AnomalyStatus = 'open' | 'acknowledged' | Disposition

export interface MlAnomaly extends Record<string, unknown> {
  id: string
  timestamp: string
  severity: Severity
  compositeScore: number
  modelScores: { isolationForest: number; lstmAe: number; hbos: number }
  srcIp?: string
  country?: string
  explanation: string
  sourceEventId: string
  sourceIndex: string
  eventType: string
  dstPort: number
  proto: string
  sensor: string
  status: AnomalyStatus
  dispositionReason?: string
  /** Anomalies from the same address in the same second, folded into this row. */
  folded: number
  thresholdAtScoring: number
  modelState?: string
}

export interface ModelHealth extends Record<string, unknown> {
  model: string
  timestamp: string
  accepted: boolean
  reason: string
  anomalyRateNew: number
  anomalyRatePrevious: number
  trainSamples: number
}

export interface ScorePoint extends Record<string, unknown> {
  time: string
  isolationForest: number
  lstmAe: number
  hbos: number
}

export interface MlAnomaliesData {
  anomalies: MlAnomaly[]
  /** Every anomaly in the last 24 h (a windowed store count). */
  total24h: Unavailable<number>
  openBacklog: number
  /** The three breakdowns below are counted over the window's rows. When
   * `breakdownRows` is set, that is the latest N of `total24h`, not all of it. */
  bySeverity: Unavailable<CountRow[]>
  topSources: Unavailable<CountRow[]>
  eventTypes: Unavailable<string[]>
  breakdownRows?: number
  scoreTimeline: ScorePoint[]
  modelHealth: ModelHealth[]
}

// ---- Monitor: LLM analysis -------------------------------------------------

export type LlmDocType = 'session' | 'payload' | 'report'

export interface LlmAnalysis extends Record<string, unknown> {
  id: string
  timestamp: string
  docType: LlmDocType
  severity: Severity
  confidence?: 'low' | 'medium' | 'high'
  intent: string
  summary: string
  sessionId?: string
  payloadSha256?: string
  srcIp?: string
  model: string
  behaviors: string[]
  error?: string
}

export interface SemanticHit extends Record<string, unknown> {
  id: string
  score: number
  severity: Severity
  summary: string
  sessionId?: string
}

export type SemanticSearchResult = { available: true; hits: SemanticHit[] } | { available: false; reason: string }

// ---- Monitor: agent campaigns ----------------------------------------------

export interface DecodeStep {
  transform: string
  inputSha256: string
  outputSha256: string
  outputLen: number
}

export interface MatchedRule {
  rule: string
  reason: string
  trustBoundary: string
  decodeChain: DecodeStep[]
}

export interface CampaignEvent {
  eventId: string
  sourceIndex: string
  timestamp: string
  matchedRules: MatchedRule[]
}

export interface AgentCampaign extends Record<string, unknown> {
  id: string
  timestamp: string
  start: string
  end: string
  severity: Severity
  categories: string[]
  identifiers: string[]
  eventCount: number
  events: CampaignEvent[]
}

// ---- Monitor: auth-failure events ------------------------------------------

export interface AuthFailure extends Record<string, unknown> {
  id: string
  timestamp: string
  type: string
  ip?: string
  error: string
  username?: string
  clientId: string
  realm: string
  redirectUri?: string
  userId?: string
}

export interface AuthEventsData {
  events: AuthFailure[]
  /** Every failure in the last 24 h (a windowed store count). */
  failed24h: Unavailable<number>
  /** Counted over the window's rows. When `breakdownRows` is set, over the
   * latest N of `failed24h`, not all of it. */
  byClient: Unavailable<CountRow[]>
  topSources: Unavailable<CountRow[]>
  breakdownRows?: number
}

// ---- Investigate -----------------------------------------------------------

export type EventKind = 'connection' | 'login' | 'login-success' | 'command' | 'download' | 'http' | 'protocol' | 'alert'

/** Each filter is a comma list (?sensor=a,b) and matches any of its values. */
export interface EventFilters {
  /** Decoy pivots: which persona, site or asset was targeted. */
  persona?: string
  site?: string
  asset?: string
  /** Source pivots. */
  fingerprint?: string
  org?: string
  provider?: string
  city?: string
  ip?: string
  sensor?: string
  country?: string
  proto?: string
  port?: string | number
  kind?: string
  /** Relative window such as `1h`, `6h`, `24h`. */
  since?: string
}

/** One page of a list the backend filters and pages: the rows, where they
 * start, and how many match in all (the real API's `{ total, offset, rows }`). */
export interface Paged<T> {
  rows: T[]
  total: number
  offset: number
}

/** Which page to fetch. Without a limit, every matching row (exports). */
export interface PageRequest {
  offset?: number
  limit?: number
}

export interface EventsPage extends Paged<HoneypotEvent> {
  values: { sensors: string[]; countries: string[]; protos: Protocol[]; ports: number[] }
}

export interface SourceProfile extends Record<string, unknown> {
  ip: string
  country: string
  org: string
  events: number
  logins: number
  sessions: number
  sensors: string[]
  first: string
  last: string
}

export interface MapPoint {
  country: string
  lat: number
  lon: number
  events: number
  /** Distinct source addresses from this country, when known. */
  ips?: number
}

export interface NetworkCampaign extends Record<string, unknown> {
  cidr: string
  score: number
  events: number
  uniqueIps: number
  sensors: string[]
  ports: number[]
  creds: number
  payloads: number
  alerts: number
  providers: string[]
  asns: string[]
  fingerprints: number
  explanation: string
  sequence: string[]
  scan?: 'horizontal' | 'vertical'
  dstIpsTouched: number
  portsTouched: number
  first: string
  last: string
}

export interface CredEdge extends Record<string, unknown> {
  id: string
  user: string
  pass: string
  uniqueIps: number
  sensors: string[]
  events: number
  last: string
}

export type ClusterKind = 'fingerprint' | 'payload' | 'asn' | 'provider' | 'credential'

export interface InfraCluster extends Record<string, unknown> {
  id: string
  kind: ClusterKind
  value: string
  sources: number
  events: number
  sensors: string[]
}

export interface AttackerEntity extends Record<string, unknown> {
  id: string
  ips: string[]
  fingerprints: string[]
  payloads: string[]
  credentials: string[]
  sensors: string[]
  events: number
  first: string
  last: string
  updated: string
  verdicts: string[]
  techniques: string[]
  scan?: 'horizontal' | 'vertical'
  destIps: number
  portsTouched: number
}

export interface KillChainData {
  flow: { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }
  timeline: Array<{ cidr: string; first: string; last: string; events: number }>
  coverage: Array<{ tactic: string; technique: string; name: string; events: number }>
  tactics: string[]
}

export interface SensorSummary {
  sensor: string
  events: number
}

export interface SensorMeasure {
  label: string
  value: number
  /** The busiest single source for this measure, e.g. "12 from 198.51.100.7". */
  peak: string
}

/** How to read one sensor's own fields: a column per field that matters,
 * and the artefact worth running the sensor for. */
export interface SensorReading {
  what: string
  columns: Array<{ header: string; field: string | string[]; mono?: boolean; badge?: 'danger' | 'warning' | 'success' | 'muted' | 'info' }>
  artefacts: Array<{ label: string; field: string | string[] }>
}

export interface SensorDetail {
  sensor: Sensor
  uniqueSources: number
  firstSeen: string
  timeline: TimeBucket[]
  /** The quantities this sensor type exists to produce. */
  measures: SensorMeasure[]
  topSources: CountRow[]
  topCountries: CountRow[]
  /** This sensor type's own leaderboards. */
  topLists: Array<{ label: string; rows: CountRow[] }>
  byType: CountRow[]
  recentEvents: HoneypotEvent[]
  /** How to read this sensor's own fields. */
  reading: SensorReading
}

export interface Recording extends Record<string, unknown> {
  id: string
  when: string
  srcIp?: string
  country?: string
  session: string
  shasum: string
  sizeBytes: number
  durationMs: number
}

export interface Replay {
  shasum: string
  frames: number
  durationSeconds: number
  transcript: string
}

// ---- Operations ------------------------------------------------------------

export interface AlertRecord {
  key: string
  kind: string
  message: string
  severity: Severity
  count: number
  firstSeen: string
  lastSeen: string
  lastNotified?: string
  acknowledged: boolean
  acknowledgedBy?: string
  link?: string
}

/** Same-rule alerts folded into one row (hashes/IPs blanked in the message). */
export interface AlertGroup extends Record<string, unknown> {
  id: string
  kind: string
  message: string
  severity: Severity
  count: number
  firstSeen: string
  lastSeen: string
  acknowledged: boolean
  members: AlertRecord[]
}

export type FeedState = 'fresh' | 'delayed' | 'stale' | 'silent'

export interface SensorFeed extends Record<string, unknown> {
  sensor: string
  state: FeedState
  documents: number
  lastSeen: string
}

export interface SourceHealth {
  clusterStatus: 'green' | 'yellow' | 'red'
  indexedDocuments: number
  feeds: SensorFeed[]
  ingest: { state: FeedState; lastIngest: string; ageSeconds: number; recentDeadLetters: number }
  yara: { enabled: boolean; lastScan: string; rulesSha256: string; samples: number; matched: number; errors: number }
  runtime: { uptimeSeconds: number; rssBytes: number; vmBytes: number }
  pipeline: { state: 'running' | 'degraded' | 'stopped'; acked: number; failed: number; dropped: number; active: number; decodeFailures: number }
  deadLetters: number
  /** Events in the last 24 h that arrived over the WireGuard tunnel with no
   * recoverable client address: in every total, attributed to no source. */
  unattributed24h: number
}

export interface TopologySensor extends Record<string, unknown> {
  sensor: string
  ingress: Array<'portbridge' | 'traefik' | 'tunnel-only' | 'direct' | 'proxy'>
  hostnames: string[]
  ports: Array<{ proto: 'tcp' | 'udp'; public: number; host: number }>
  rawIndex: string
  feed: FeedState
}

export type ContainerState = 'running' | 'restarting' | 'exited' | 'unknown'

export interface Topology {
  flow: { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }
  sensors: TopologySensor[]
  /** `unknown`: outside the services adapter's allowlist, so no live state
   * is reported. `exitCode` on an exited container. */
  stacks: Array<{ stack: string; containers: Array<{ name: string; state: ContainerState; exitCode?: number }> }>
}

// ---- Reports ---------------------------------------------------------------

export type ReportFrequency = 'daily' | 'weekly' | 'monthly'

export interface ReportDefinition extends Record<string, unknown> {
  id: string
  name: string
  template: string
  theme: 'dark' | 'light'
  elements: string[]
  /** Each filter matches any of its values; an empty list means no filter. */
  scope: { window: string; ip: string[]; sensor: string[]; port: string[]; signature: string[] }
  branding: { title: string; author: string; headerLeft: string; headerRight: string; footerLeft: string; classification: string }
  /** When it runs by itself, and (kept by the scheduler) when it last ran
   * and runs next. */
  schedule: { frequency: ReportFrequency; hour: number; minute: number; weekday: number; monthDay: number; lastRunAt?: string; nextRunAt?: string } | null
  /** At most this many rows in each table of the appendix. */
  appendixLimit: number
  created: string
}

export interface ReportTemplate {
  id: string
  name: string
  description: string
  elements: string[]
}

export interface GeneratedReport extends Record<string, unknown> {
  id: string
  title: string
  template: string
  origin: 'manual' | 'schedule'
  createdAt: string
  sizeBytes: number
  definitionId: string
}

/** One value a filter can take, with how many events carry it. */
export interface FacetValue {
  value: string
  label?: string
  count: number
}

/** Every value each filter can take, for pickers that show them all. */
export interface Facets {
  sensors: FacetValue[]
  sources: FacetValue[]
  countries: FacetValue[]
  protocols: FacetValue[]
  ports: FacetValue[]
  signatures: FacetValue[]
  kinds: FacetValue[]
  personas: FacetValue[]
  providers: FacetValue[]
  cities: FacetValue[]
}

/** What a draft definition would cover, checked before rendering. */
export interface ReportPreview {
  events: number
  sources: number
  sensors: number
  sessions: number
  /** Rows each selected section would carry, and its approximate pages. */
  sections: Array<{
    id: string
    label: string
    rows: number
    pages: number
    /** Column headings and the first rows as the document will print them. */
    columns: [string, string]
    sample: Array<[string, string]>
  }>
  pages: number
  /** The period the scope window covers, as ISO timestamps. */
  period: { from: string; to: string }
  /** The scope filter that matched nothing, when one did. */
  emptyFilter?: { field: 'ip' | 'sensor' | 'port' | 'signature' | 'window'; message: string }
}

export interface ReportsData {
  templates: ReportTemplate[]
  elements: Array<{ id: string; label: string; description: string }>
  definitions: ReportDefinition[]
  generated: GeneratedReport[]
}

// ---- Tools -----------------------------------------------------------------

export interface CanaryToken extends Record<string, unknown> {
  id: string
  type: string
  memo: string
  url: string
  hostname: string
  createdAt: string
  createdBy: string
  artifact?: string
}

export interface CanaryTrigger extends Record<string, unknown> {
  id: string
  tokenId: string
  memo: string
  type: string
  triggeredAt: string
  srcIp: string
  userAgent: string
  location: string
  /** The token service's own page for this token, when it gives one. */
  manageUrl?: string
}

export interface CanaryTokenType {
  type: string
  label: string
  description: string
  /** Minting it needs a file from the operator (the custom web image). */
  requiresUpload: boolean
  /** The document can carry a line of the operator's text, to look lived-in. */
  supportsSnippet: boolean
}

export interface BaitCredential extends Record<string, unknown> {
  id: string
  path: string
  target: string
  username: string
  password: string
  memo: string
  template: string
  linkedTokenId?: string
  createdAt: string
  createdBy: string
  rotatedAt?: string
  rotatedBy?: string
}

// ---- Evidence --------------------------------------------------------------

export interface CapturedPayload extends Record<string, unknown> {
  hash: string
  sources: string[]
  kind: string
  platform: string
  mime: string
  sizeBytes: number
  copies: number
  dynamic: boolean
  preview: string
  capturedAt: string
  verdict?: { label: 'malicious' | 'suspicious' | 'clean'; family?: string }
}

export type AnalyzerTab = 'workbench' | 'static' | 'yara' | 'sandbox' | 'ghidra'

export interface AnalysisResult extends Record<string, unknown> {
  id: string
  analyzer: AnalyzerTab
  hash: string
  file: string
  at: string
  summary: string
  state?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  risk?: number
  matches?: string[]
  platform?: string
  owner?: string
  recipe?: string
  /** What this analyzer concluded about the payload (not the workbench). */
  verdict?: ResultVerdict
  /** The payload's overall verdict, so a disagreeing analyzer shows. */
  payloadVerdict?: ResultVerdict
  detail: Record<string, unknown>
}

/** A payload is clean; a sandbox detonation is benign (its own scale). */
export type ResultVerdict = 'malicious' | 'suspicious' | 'benign' | 'clean'

export interface GpuJob extends Record<string, unknown> {
  jobId: string
  requestedAt: string
  startedAt?: string
  finishedAt?: string
  /** Why a failed job failed. */
  error?: string
  jobType: string
  model: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'aborted'
  attempts: number
  abortRequested: boolean
  ref: string
  /** The VRAM the job is expected to hold (the queue admits by it). */
  vramMib: number
}

export type AnalyzerId = 'static' | 'yara' | 'sandbox' | 'cape' | 'ghidra' | 'revdeck' | 'github'

/** The whole option set one analyzer takes (workbench_domain.rs `WorkbenchOptions`). */
export interface AnalyzerOptions {
  timeoutSeconds: number
  maxQueueAgeSeconds: number
  retryLimit: number
}

/** The bounds the backend validates an analyzer's options against
 * (workbench_domain.rs `WorkbenchOptionSchema`). */
export interface AnalyzerOptionSchema {
  timeoutMinSeconds: number
  timeoutMaxSeconds: number
  queueAgeMinSeconds: number
  queueAgeMaxSeconds: number
  retryLimitMax: number
}

/** One analyzer as the workbench offers it, and what running it means. */
export interface AnalyzerInfo {
  id: AnalyzerId
  label: string
  description: string
  /** Holds a GPU: waits on the GPU queue. */
  gpu: boolean
  /** Payload kinds it takes (ELF, PE32, shell script, …). */
  acceptedKinds: string[]
  /** Whether its service is up right now, and why not. */
  availability: 'available' | 'degraded' | 'unavailable'
  availabilityNote?: string
  requiredRole: 'viewer' | 'admin'
  /** Runs the sample live (in an isolated guest). */
  detonates: boolean
  /** What the operator confirms before it runs, when anything. */
  confirmation?: string
  /** Everything stays on our hosts; false when it publishes or calls out. */
  localOnly: boolean
  /** Never picked by default or by a recipe: the operator ticks it. */
  requiresOptIn: boolean
  /** The options the backend uses when the operator sets none. */
  defaultOptions: AnalyzerOptions
  /** The bounds the operator's options must fall within. */
  optionSchema: AnalyzerOptionSchema
}

/** How the pipeline classified a sample, which decides its analysis path. */
export interface PayloadClassification {
  code: string
  label: string
  platform: string
  category: 'executable' | 'script' | 'document' | 'archive'
  /** The route a dynamic analysis takes, or `static only`. */
  analysisPath: string
  dynamic: boolean
}

/** The analyzers for one sample: which apply, and why not. */
export interface AnalyzerCatalog {
  classification: PayloadClassification
  analyzers: Array<AnalyzerInfo & { applicable: boolean; reason?: string }>
}

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'

/** One analyzer's part of a workbench run. */
export interface WorkbenchRunChild {
  analyzerId: AnalyzerId
  label: string
  state: RunState
  /** Why it failed or was skipped. */
  reason?: string
  summary?: string
  /** Where its result reads, once there is one. */
  resultHref?: string
  createdAt: string
  updatedAt: string
  attempts: number
  retryable: boolean
  cancelable: boolean
}

/** A run of several analyzers over one sample, as its owner sees it. */
export interface WorkbenchRun extends Record<string, unknown> {
  id: string
  hash: string
  payloadKind: string
  owner: string
  label: string
  recipeId?: string
  recipeName?: string
  state: RunState
  createdAt: string
  updatedAt: string
  children: WorkbenchRunChild[]
}

/** A saved set of analyzers and their options, to start runs from. */
export interface WorkbenchRecipe {
  id: string
  revision: number
  name: string
  description: string
  owner: string
  scope: 'personal' | 'shared'
  createdAt: string
  analyzers: Array<{ analyzerId: AnalyzerId; options: AnalyzerOptions }>
}

/** What one analysis run is told: the analyzers to run, and each one's
 * options. Every analyzer in `analyzers` has an entry in `options`. */
export interface AnalysisRunConfig {
  hash: string
  analyzers: AnalyzerId[]
  options: Partial<Record<AnalyzerId, AnalyzerOptions>>
}

export interface AnalysisResultsData {
  results: AnalysisResult[]
  gpuQueue: GpuJob[]
  analyzers: AnalyzerInfo[]
  /** The signed-in operator's own runs, newest first. */
  runs: WorkbenchRun[]
  recipes: WorkbenchRecipe[]
}

// ---- Detail pages ----------------------------------------------------------

export interface Technique extends Record<string, unknown> {
  id: string
  name: string
  tactic: string
  events: number
}

export interface EventDetail {
  event: HoneypotEvent
  session: HoneypotEvent[]
  connection: HoneypotEvent[]
  source: HoneypotEvent[]
  hashes: string[]
  /** The session's terminal recording, when it has one. */
  recordingShasum?: string
  /** How to read the capturing sensor's own fields. */
  reading: SensorReading
}

export interface SessionDetail {
  id: string
  events: HoneypotEvent[]
  srcIp: string
  country: string
  first: string
  last: string
  sensors: CountRow[]
  commands: CountRow[]
  credentials: CountRow[]
  payloads: CountRow[]
  techniques: Technique[]
  recordingShasum?: string
}

/** A manual block at portbridge: who set it, when, and until when (none:
 * until someone lifts it). */
export interface BlockRecord {
  by: string
  at: string
  expiresAt?: string
}

export interface IpProfile {
  source: SourceProfile & { asn: string; riskScore: number; tags: string[] }
  blocked: boolean
  block?: BlockRecord
  /** A sandbox detonation of a sample that references this address
   * connected to it: two independent pipelines agree. Informational; an
   * absent badge means no such corroboration, not benign. */
  confirmedMalicious: boolean
  events: HoneypotEvent[]
  sensors: CountRow[]
  credentials: CountRow[]
  commands: CountRow[]
  paths: CountRow[]
  ports: CountRow[]
  protocols: CountRow[]
  sessions: CountRow[]
  payloads: CountRow[]
  alerts: CountRow[]
  techniques: Technique[]
  correlation: { totalMatches: number; tunnelConnections: number; distinctSensors: number; tunnelOsGuesses: string[] }
  attackerId?: string
}

export interface Correlation {
  title: string
  members: string[]
  totalMatches: number
  tunnelConnections: number
  sensors: CountRow[]
  events: HoneypotEvent[]
}

export interface ReplayDetail {
  replay: Replay
  sessions: Recording[]
  attacker: { ip: string; events: number; sessions: number; commands: CountRow[]; credentials: CountRow[]; sensors: CountRow[]; sessionIds: CountRow[] } | null
}

export interface SearchGroup {
  id: string
  title: string
  total: number
  items: Array<{ label: string; detail: string; href: string }>
  /** Where the rest of this group's matches are listed, when there are
   * more than shown. */
  moreHref?: string
}

export interface DeadLetter extends Record<string, unknown> {
  id: string
  timestamp: string
  reason: string
  source: string
  index: string
  document: Record<string, unknown>
}

export type ProblemStatus = 'open' | 'triaged' | 'fixed' | 'wontfix'

export interface ProblemReport extends Record<string, unknown> {
  id: string
  submittedAt: string
  submittedBy: string
  status: ProblemStatus
  page: string
  expected: string
  actual: string
  consoleErrors: string[]
  networkFailures: string[]
  apiCalls: Array<{ method: string; path: string; status: number }>
  actionTrail: string[]
  userAgent: string
  hasSnapshot: boolean
}

/** A message a mail sensor captured. The body is kept as plain text only
 * (an HTML body is decoded, never rendered) and attachments as metadata
 * only, so the viewer can be neither a script sink nor a malware source. */
export interface CapturedMail {
  sessionId: string
  sizeBytes: number
  importedAt: string
  from: MailAddress | null
  to: MailAddress[]
  subject: string
  /** The Date header, as sent. */
  date: string
  messageId: string
  bodyText: string
  /** True when the message had only an HTML part, decoded to text here. */
  fromHtml: boolean
  attachments: Array<{ filename: string; contentType: string; sizeBytes: number; sha256: string }>
}

export interface MailAddress {
  name: string
  address: string
}

/** Per-operator preferences, as the preference store keeps them. */
export interface Preferences {
  theme: 'system' | 'dark' | 'light'
  /** Accent palette from the shared theme. */
  palette: Palette
  density: 'comfortable' | 'compact'
  motion: 'system' | 'on' | 'off'
  highContrast: boolean
  /** Bigger monospace for payloads, commands and raw records. */
  largeEvidenceText: boolean
  /** Wrap long values in tables instead of truncating them. */
  wrapLongValues: boolean
  collapsedSidebar: boolean
  landing: string
  rowsPerPage: number
  openDetailsInNewTab: boolean
  /** Keep a page's filters when coming back to it. */
  rememberFilters: boolean
  /** `browser`, or an IANA zone such as Europe/Berlin. */
  timezone: string
  clock: 'h24' | 'h12'
  timestamps: 'relative' | 'absolute'
  autoRefresh: boolean
  refreshSeconds: number
  liveToasts: boolean
  /** Minimum seconds between two operational toasts. */
  liveToastSeconds: number
  mapBasemap: 'osm'
  mapClustering: boolean
  mapAnimation: boolean
  /** Notify for alerts at or above this severity. */
  notifySeverity: Severity
  notifySound: boolean
  notifyDesktop: boolean
  notifyCanary: boolean
  defaultWindow: string
}

/** One of APIARY's nine palette themes, or one of Astryx's own themes. */
export type Palette = 'claude' | 'slate' | 'sage' | 'lavender' | 'lime' | 'amber' | 'ocean' | 'rose' | 'neon' | AstryxTheme

/** The themes Astryx ships (`astryx theme list`), whole designs of their own. */
export type AstryxTheme = 'neutral' | 'butter' | 'chocolate' | 'gothic' | 'matcha' | 'stone' | 'y2k'

/** Dashboard configuration, by section, as the config store keeps it.
 * Every write is validated first and recorded as a revision. */
export interface DashboardConfig {
  revision: number
  presentation: {
    appName: string
    /** The browser tab's title, for everyone: {page}, {app}, {section}. */
    titleFormat: string
    productLabel: string
    dashboardTitle: string
    dashboardSubtitle: string
    orgName: string
    overviewIntro: string
    helpLinkLabel: string
    helpLinkUrl: string
    bannerText: string
    bannerSeverity: '' | 'info' | 'success' | 'warning' | 'danger'
    /** RFC 3339, or empty for no expiry. */
    bannerExpires: string
    footerText: string
    aiDisclaimer: string
    privacyNotice: string
  }
  behavior: {
    defaultLanding: string
    defaultTimeWindow: string
    rowsPerPageOptions: number[]
    maxExportRows: number
    refreshIntervalOptions: number[]
    sourceStaleMinutes: number
    mapProvider: 'osm'
    defaultTimezone: string
    showMlPanels: boolean
    maintenanceMode: boolean
    readOnly: boolean
    showProblemReportButton: boolean
  }
  honeypot: {
    /** A duration such as 30m or 2h, between 5m and 168h. */
    alertCooldown: string
    alertCampaignScore: number
    sandboxAlertRiskScore: number
    mlAlertThreshold: number
    yaraScanIntervalSeconds: number
    yaraMaxBytes: number
    payloadDedupeIntervalSeconds: number
  }
  /** Name and description overrides per report template id. */
  reportPresets: Partial<Record<string, { name?: string; description?: string }>>
}

export type ConfigSection = Exclude<keyof DashboardConfig, 'revision'>

/** Where the deployment's other tools live, from its environment rather
 * than the settings: each is absent when not deployed, and a link to it is
 * then left out rather than guessed. */
export interface DeploymentLinks {
  kibana?: string
  evebox?: string
  arkime?: string
  /** The identity provider's account console (Keycloak's `<issuer>/account/`). */
  accountConsole?: string
}

/** What the shell itself needs of the configuration: labels, the banner,
 * notices, and the switches that change every page; and where the
 * deployment's other tools are. */
export type ShellConfig = Pick<DashboardConfig, 'presentation' | 'behavior'> & { links: DeploymentLinks }

/** What validation found wrong, field name → message. Empty when valid. */
export type ConfigProblems = Record<string, string>

/** The report sender's own counters, as it last published them. */
export interface ReporterStats {
  available: boolean
  reason?: string
  stats?: { attempted: number; sent: number; suppressedCooldown: number; dryRun: number; failed: number; updatedAt: string }
}

/** Elasticsearch storage at a glance. */
export interface EsStorage {
  clusterStatus: 'green' | 'yellow' | 'red'
  indexCount: number
  docCount: number
  storeBytes: number
  /** The biggest index families, for where the space goes. */
  families: Array<{ family: string; indices: number; docs: number; bytes: number }>
}

export interface ServiceStatus extends Record<string, unknown> {
  name: string
  stack: string
  state: ContainerState
  uptime: string
  image: string
}

export interface ConfigRevision extends Record<string, unknown> {
  id: string
  at: string
  actor: string
  section: string
  summary: string
}

export interface AuditEntry extends Record<string, unknown> {
  id: string
  at: string
  actor: string
  action: string
  fields: string[]
  result: 'ok' | 'rejected'
}

/** Someone who has signed in, as the session store saw them (read only:
 * accounts live in the identity provider). */
export interface DashboardOperator {
  subject: string
  username: string
  name: string
  role: 'admin' | 'viewer'
  firstSeenAt: string
  lastSeenAt: string
}

export interface SettingsData {
  user: SessionUser
  users: DashboardOperator[]
  preferences: Preferences
  services: ServiceStatus[]
  history: ConfigRevision[]
  audit: AuditEntry[]
  config: DashboardConfig
  reporter: ReporterStats
  storage: EsStorage
  /** The template catalog, for naming preset overrides. */
  reportTemplates: ReportTemplate[]
}

// ---- Evidence detail -------------------------------------------------------

export interface Ioc extends Record<string, unknown> {
  id: string
  kind: 'ip' | 'domain' | 'url' | 'path'
  value: string
}

export interface PayloadAnalysis {
  payload: CapturedPayload
  staticRisk: number
  packingLikelihood: number
  hashes: { md5: string; sha1: string; sha256: string; ssdeep: string; tlsh: string }
  fileType: string
  entryPoint?: string
  classification?: string
  yara: string[]
  iocs: Ioc[]
  strings: string[]
  decoded: Array<{ encoding: string; value: string }>
  sections: Array<{ name: string; size: number; entropy: number }>
  preview: string
  sandbox?: { job: string; risk: number; verdict: string }
  ghidra: boolean
  github?: { status: GithubStatus; detections: number; engines: number }
}

/** The Windows sandbox's golden image: how old it is and whether its
 * checksum was verified against a live clone. Absent when unconfigured. */
export interface GoldenImageStatus {
  builtAt: string
  ageDays: number
  checksumWritten: boolean
  checksumVerified: boolean
  /** Past the monthly rebuild cadence. */
  staleMonthly: boolean
  /** Built from an evaluation ISO that has likely expired (90 days). */
  staleIsoEval: boolean
  checkedAt: string
  error?: string
}

export interface SandboxRun {
  /** On Windows runs: the image the next detonation would start from. */
  goldenImage?: GoldenImageStatus
  job: string
  hash: string
  at: string
  verdict: 'malicious' | 'suspicious' | 'benign'
  risk: number
  platform: string
  durationSeconds: number
  packets: number
  changedPaths: string[]
  syscalls: CountRow[]
  processesAdded: string[]
  socketsAdded: string[]
  output: string
  dns: string[]
  connections: Array<{ proto: string; dst: string; port: number; bytes: number }>
  iocsStatic: string[]
  iocsDynamic: string[]
  techniques: Technique[]
  diagnostics: Record<string, string>
  /** Which sandbox ran it, and on what image. */
  route: { name: 'linux-qemu' | 'windows-kvm'; vm: string; snapshot: string }
  /** What the payload did: process and socket state before and after. */
  processes: { added: string[]; removed: string[] }
  sockets: { before: string[]; after: string[] }
  stdout: string
  stderr: string
  /** The packet captures, on the host bridge and inside the guest. */
  network: {
    bytes: number
    protocols: CountRow[]
    remoteIps: string[]
    hostEvents: string[]
    attempts: string[]
    guest: { packets: number; pcapBytes: number; protocols: CountRow[]; events: string[] }
  }
  /** Indicators the static pass found, for the runtime to confirm or not. */
  staticIocs: { remoteIps: string[]; uncPaths: string[]; downloadUrls: string[]; downloadCradles: number }
  /** PE forensics, for Windows samples only. */
  windows?: WindowsForensics
  /** The run's own logs, for when the run itself went wrong. */
  logs: { kernel: string; hostTcpdump: string; guestTcpdump: string; serialConsole: string; qemu: string; domainState: string; classifierError?: string; peParserError?: string }
  /** Files the run exported, downloadable from the run page. */
  exported: Array<{ name: string; size: number; sha256: string }>
}

export interface WindowsForensics {
  peType: 'PE32' | 'PE32+'
  machine: string
  subsystem: string
  imageBase: string
  entryPoint: string
  compileTimestamp: string
  imphash: string
  isDll: boolean
  signaturePresent: boolean
  authenticode: string
  suspiciousImports: Array<{ name: string; library: string; why: string }>
  sections: Array<{ name: string; virtualSize: number; rawSize: number; entropy: number; characteristics: string }>
  imports: Array<{ library: string; symbols: string[] }>
  exports: string[]
  warnings: string[]
  asciiStrings: string[]
  utf16Strings: string[]
  exiftool: string
}

export interface GhidraFunction extends Record<string, unknown> {
  name: string
  address: string
  size: number
  /** How many functions it calls. */
  calls: number
  /** The decompiler's recovered signature. */
  signature: string
  /** Function names that call it, and that it calls: the call graph. */
  callers: string[]
  callees: string[]
  decompiled: string
}

/** Where an indicator was seen: only in FLOSS's recovered strings, only in
 * the sandbox's static pass, or confirmed when the sample actually ran. */
export interface IocEvidence {
  flossOnly: string[]
  sandboxStaticOnly: string[]
  confirmedAtRuntime: string[]
}

/** A Ghidra decompilation and everything run alongside it (LIEF, capa,
 * FLOSS, fuzzy hashes, triage), plus the deep-dive data a RevDeck session
 * recovers (types, globals, annotations, memory, chat, symbols). */
export interface GhidraAnalysis {
  hash: string
  at: string
  arch: string
  run: { requestedAt: string; startedAt: string; completedAt: string; exitStatus: 'ok' | 'error'; error?: string }
  /** Functions Ghidra found; only the deepened ones are listed. */
  functionsTotal: number
  functions: GhidraFunction[]
  imports: CountRow[]
  strings: string[]
  cryptoConstants: Array<{ name: string; address: string; algorithm: string }>
  fuzzy: { ssdeep: string; tlsh: string; imphash: string }
  lief: { format: 'ELF' | 'PE'; architecture: string; entrypoint: string; isPie: boolean; stripped: boolean; isDll: boolean | null; compileTimestamp: string | null; sectionCount: number; libraries: string[] }
  capa: Array<{ capability: string; namespace: string; matches: number; attck?: string }>
  capaAttack: Array<{ id: string; tactic: string; technique: string }>
  capaMbc: Array<{ id: string; objective: string; behavior: string }>
  floss: { decoded: string[]; stack: string[]; tight: string[]; static: string[]; totals: { decoded: number; stack: number; tight: number; static: number }; truncated: boolean }
  iocCorrelation: { hasSandboxRun: boolean; ips: IocEvidence; domains: IocEvidence; urls: IocEvidence; uncPaths: IocEvidence }
  aiTriage: { summary: string; model: string; confidence: 'low' | 'medium' | 'high'; familyGuess: string; behaviors: string[] }
  types: Array<{ name: string; kind: 'struct' | 'enum' | 'typedef'; size: number; fields: Array<{ name: string; type: string; offset: number; size: number }> }>
  globals: Array<{ address: string; name: string; type: string; size: number }>
  annotations: { revision: number; entries: Array<{ address: string; displayName: string; comment: string; tags: string[] }> }
  memoryMap: Array<{ name: string; start: string; end: string; size: number; permissions: string; hex: string; ascii: string }>
  chat: { threads: Array<{ id: string; title: string; messageCount: number }>; messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; tool?: string }> }
  symbolRecovery: { matched: number; total: number; candidates: Array<{ address: string; recovered: string; confidence: number; source: string }> }
}

/** One turn of RevDeck's model loop, as the run records it: the workflow's
 * system prompt, the request, then the model's turns and the tool calls
 * each made against the Ghidra service. */
export interface RevDeckMessage {
  role: 'system' | 'user' | 'assistant'
  at: string
  text: string
  toolCalls?: Array<{ tool: string; input: string; output: string; durationMs: number; error?: string }>
}

export interface RevDeckRun extends Record<string, unknown> {
  sha: string
  at: string
  status: 'completed' | 'failed'
  verdict: string
  summary: string
  steps: Array<{ tool: string; input: string; output: string }>
  citations: { valid: string[]; invalid: string[] }
  error?: string
  /** The RevDeck workflow that drove the walk (which prompt and tool set). */
  workflow: string
  /** The whole conversation, in order; `steps` is its tool calls alone. */
  transcript: RevDeckMessage[]
}

export interface CapeRun extends Record<string, unknown> {
  sha: string
  at: string
  status: 'reported' | 'failed_analysis'
  malscore: number
  signatures: Array<{ name: string; severity: number; description: string }>
  processes: Array<{ pid: number; name: string; commandLine: string }>
  dumps: string[]
  config: Record<string, string>
  log: string
  /** CAPE's own task number, and its raw task status (`reported`,
   * `failed_analysis`, …). */
  taskId: number | null
  capeStatus: string | null
  /** CAPE's verdict word for the score (Malicious, Suspicious, Clean). */
  malstatus: string
  /** API calls the behavior log recorded. */
  totalCalls: number
  /** The report's top-level sections, so a missing one is visible. */
  sections: string[]
  /** Errors from CAPE's own analysis log. */
  debugErrors: string[]
  /** The package CAPE ran the sample with (exe, dll, …), when it reports one. */
  package?: string
}

export type GithubStatus = 'published' | 'dry_run' | 'denylist_blocked' | 'quota_exceeded'

export interface GithubAnalysis extends Record<string, unknown> {
  sha: string
  at: string
  status: GithubStatus
  detections: number
  engines: number
  risk: 'high' | 'medium' | 'low'
  family?: string
  /** Each scanner's verdict, and its own report page when it gives one. */
  results: Array<{ engine: string; verdict: 'malicious' | 'suspicious' | 'undetected'; label?: string; permalink?: string }>
  yaraRules: string[]
  repoPath: string
  /** The commit that published the sample, and the Actions run that scanned it. */
  commit?: { sha: string; url: string }
  runUrl?: string
  /** Who asked for the publication. */
  requestedBy: string
  /** The publications-per-day cap, reported when it refused this one. */
  dailyCap?: number
  /** The report the Actions run rendered, and where it can be read. */
  reportPdf?: string
  viewUrl?: string
}

// ---- Overview views --------------------------------------------------------

export interface SeriesPoint extends Record<string, unknown> {
  time: string
}

export interface HeatmapRow {
  sensor: string
  /** Events per hour, oldest → newest (24 cells). */
  cells: number[]
}

export interface AttackVectors {
  ports: CountRow[]
  protocols: CountRow[]
}

/** The deep-dive tabs. Every field the dashboard endpoint fills, and the
 * payloads and campaigns legs, is `Unavailable` when its endpoint has no
 * answer. The chart-backed fields are `Unavailable` when their
 * `/api/v1/charts/*` route does not answer; `vectors` and `conformance` have no
 * backend source at all. */
export interface OverviewViews {
  heatmap: Unavailable<HeatmapRow[]>
  vectors: Unavailable<Record<string, AttackVectors>>
  mapPoints: Unavailable<MapPoint[]>
  feeds: Unavailable<SensorFeed[]>
  protocols: Unavailable<CountRow[]>
  mlBacklog: Unavailable<SeriesPoint[]>
  topIps: Unavailable<CountRow[]>
  topPorts: Unavailable<CountRow[]>
  countries: Unavailable<CountRow[]>
  asns: Unavailable<CountRow[]>
  providers: Unavailable<CountRow[]>
  netflowBytes: Unavailable<SeriesPoint[]>
  netflowPackets: Unavailable<SeriesPoint[]>
  conformance: Unavailable<SeriesPoint[]>
  cves: Unavailable<CountRow[]>
  credentials: Unavailable<CountRow[]>
  commands: Unavailable<CountRow[]>
  clients: Unavailable<CountRow[]>
  fingerprints: Unavailable<CountRow[]>
  paths: Unavailable<CountRow[]>
  osDistribution: Unavailable<CountRow[]>
  tcpClusters: Unavailable<CountRow[]>
  icsFunctions: Unavailable<CountRow[]>
  decoyRequests: Unavailable<CountRow[]>
  decoyClients: Unavailable<CountRow[]>
  ja4h: Unavailable<CountRow[]>
  ja4l: Unavailable<CountRow[]>
  ja4x: Unavailable<CountRow[]>
  tls: Unavailable<CountRow[]>
  ssh: Unavailable<CountRow[]>
  endlessh: Unavailable<CountRow[]>
  alerts: Unavailable<CountRow[]>
  alertCategories: Unavailable<CountRow[]>
  payloads: Unavailable<CapturedPayload[]>
  campaigns: Unavailable<NetworkCampaign[]>
}

// ---- Entity pages ----------------------------------------------------------

export type TimelineKind = 'event' | 'capture' | 'anomaly' | 'llm' | 'canary' | 'auth' | 'alert'

export interface TimelineItem extends Record<string, unknown> {
  id: string
  at: string
  kind: TimelineKind
  title: string
  detail?: string
  severity?: Severity
  href?: string
}

export interface SessionSummary extends Record<string, unknown> {
  id: string
  srcIp: string
  sensors: string[]
  first: string
  last: string
  events: number
  logins: number
  commands: number
  downloads: number
  recordingShasum?: string
}

export interface SourceNetwork {
  cidr: string
  /** The AS number, when the backend names one. Absent, not empty. */
  asn?: string
  org?: string
  country?: string
  neighbours: SourceProfile[]
  campaign?: NetworkCampaign
}

// ---- Entity groups (epic #25, Phase C) --------------------------------------

/** Any set of source IPs seen as one thing: a network, an ASN, a campaign, a
 * cluster, or an attacker identity. Every group page is built from this. */
export interface SourceGroup {
  members: SourceProfile[]
  events: HoneypotEvent[]
  /** Matches across honeypot, Suricata, and portbridge tunnel records. */
  totalMatches: number
  tunnelConnections: number
  /** p0f's OS guesses for the tunnel connections (TCP/IP stack
   * fingerprints), most frequent first. */
  tunnelOsGuesses: string[]
  first?: string
  last?: string
  sensors: CountRow[]
  countries: CountRow[]
  networks: CountRow[]
  ports: CountRow[]
  credentials: CountRow[]
  commands: CountRow[]
  payloads: CountRow[]
}

/** A signal several members share: the reason they are grouped. */
export interface SharedSignal extends Record<string, unknown> {
  id: string
  kind: 'credential' | 'fingerprint' | 'payload' | 'network' | 'asn'
  value: string
  members: string[]
}

export interface NetworkEntity {
  cidr: string
  /** The AS number, when the backend names one. Absent, not empty. */
  asn?: string
  org?: string
  country?: string
  group: SourceGroup
  campaign?: NetworkCampaign
}

export interface AsnEntity {
  asn: string
  orgs: string[]
  group: SourceGroup
}

export interface CampaignEntity {
  campaign: NetworkCampaign
  group: SourceGroup
  shared: SharedSignal[]
}

export interface ClusterEntity {
  kind: ClusterKind
  value: string
  group: SourceGroup
}

/** Why an identity merged: per signal category, how many distinct values
 * two or more of its member addresses share. A category nothing produced is
 * a zero, not missing. */
export interface IdentityFusion {
  categories: string[]
  values: number[]
  ips: string[]
}

export interface IdentityEntity {
  identity: AttackerEntity
  group: SourceGroup
  shared: SharedSignal[]
}

// ---- IOCs (epic #25, Phase E) ------------------------------------------------

export type IocHubKind = 'hash' | 'domain' | 'url' | 'credential' | 'command' | 'fingerprint' | 'cve' | 'signature' | 'username' | 'password'

export interface IocRow extends Record<string, unknown> {
  id: string
  kind: IocHubKind
  value: string
  events: number
  sources: number
  sessions: number
  last?: string
}

export interface IocEntity {
  kind: IocHubKind
  value: string
  events: HoneypotEvent[]
  group: SourceGroup
  sessions: SessionSummary[]
  payloads: CountRow[]
}

/** Which entity a timeline belongs to. */
export type TimelineEntity = 'source' | 'session' | 'network' | 'asn' | 'campaign' | 'cluster' | 'identity' | 'payload' | 'ioc'

/** Entities related to the one on screen, grouped by kind. `kind` is an
 * entity-registry kind (src/lib/entities.ts). */
export interface RelatedGroup {
  kind: string
  label: string
  items: Array<{ id: string; label?: string; note?: string }>
}
