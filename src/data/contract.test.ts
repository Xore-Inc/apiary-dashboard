// The dashboard's side of the backend contract (#244). backend-service is
// released on its own schedule, so three things are checked here rather than
// in a deploy:
//
//   1. the pinned backend artifact (contracts/backend, refreshed with
//      `bun run contract:sync`) publishes a contract version this build
//      supports, and every backend call the dashboard makes is a route,
//      method and (for the store) name that artifact declares;
//   2. the hand-written wire types in contracts/*.ts accept representative
//      responses. The artifact leaves response bodies open (its own
//      description says so), so schema validation cannot prove them; the
//      captured fixtures in __fixtures__ do, by being assigned to the wire
//      types below under `tsc --noEmit`, and by driving the adapters in
//      api.entities.test.ts;
//      The same holds for every other contract file (monitor, operations,
//      settings, reports, tools, evidence, charts, explorer): each has a
//      wire-*.json fixture whose provenance is its `_source` note, and the
//      request bodies are in contract.requests.test.ts;
//   3. downloads and the live stream are declared with the content types
//      the dashboard's handlers rely on, and every UI path the backend emits
//      resolves to a dashboard route.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_API_VERSIONS } from '#/server/backendContract'
import type { EventsPage } from './contracts/events'
import type { IpProfileWire, SourcesPageWire } from './contracts/sources'
import type { ChartName, Charts, FlowGraph } from './contracts/charts'
import { CHART_NAMES } from './contracts/charts'
import type { EventPageWire, FilterValuesWire, RecordingsPageWire, ReplayWire, SearchResultWire, SessionDetailWire } from './contracts/explorer'
import type {
  AnalyzerCatalogWire, ArtifactListWire, CapeRunPageWire, GhidraCallGraphWire, GhidraRunPageWire, GhidraSubmitWire, GithubAnalysisPageWire, GithubAnalysisSubmitWire, GoldenImageStatusWire,
  GpuAbortWire, GpuQueueWire, MlHealthWire, PayloadDetailWire, PayloadPageWire, PayloadReportWire, RevDeckRunPageWire, SandboxRunPageWire as SandboxRunDetailPageWire, SandboxSubmitWire,
  SandboxVncStatusWire, WorkbenchRecipeListWire, WorkbenchRunEnvelopeWire, WorkbenchRunListWire, CreateWorkbenchRunWire, SaveWorkbenchRecipeWire,
} from './contracts/evidence'
import type {
  AgentCampaignRow, AuthEventRow, CampaignRow, ConfigDoc, Dashboard, LlmAnalysisRow, LlmSearchResponse, MlAckAllResponse, MlAckRecord, MlAcks, MlAnomalyRow, MlAnomalyStats, MlDispositionResponse,
  MlModelHealth, OverviewKpis, PayloadsPage, StorePage,
} from './contracts/monitor'
import type {
  AckAlertWire, AlertPageWire, CuratedSensorsWire, DeadLetterWire, ProblemReportPageWire, PurgeDeadLettersWire, SensorCatalogWire, SensorEventsWire, SensorOverviewWire, SourceHealthWire, TopologyWire,
} from './contracts/operations'
import type {
  GenerateReportWire, GeneratedReportPageWire, PayloadSearchPageWire, ReportDefinitionEnvelopeWire, ReportDefinitionsWire, ReportDeletedWire, ReportTemplatesWire,
  SandboxRunPageWire as ReportSandboxRunPageWire,
} from './contracts/reports'
import type {
  AttackVectorsWire, AuditWire, ConfigHistoryWire, ConfigValidateWire, ConfigWire, MailWire, PreferencesWire, ProblemReportsPageWire, ReporterStatsWire, ServiceActionWireResponse, ServiceLogsWire,
  ServicesWire, StorageWire, UsersWire,
} from './contracts/settings'
import type { CanaryFiredPageWire, CanarytokenListWire, CanarytokenStorePageWire, CanaryTokenTypeWire, CreatedCanarytokenWire, CredentialListWire } from './contracts/tools'
import entityReads from './__fixtures__/entity-reads.json'
import entityGroups from './__fixtures__/entity-groups.json'
import wireCharts from './__fixtures__/wire-charts.json'
import wireEvidence from './__fixtures__/wire-evidence.json'
import wireExplorer from './__fixtures__/wire-explorer.json'
import wireMonitor from './__fixtures__/wire-monitor.json'
import wireOperations from './__fixtures__/wire-operations.json'
import wireReports from './__fixtures__/wire-reports.json'
import wireSettings from './__fixtures__/wire-settings.json'
import wireTools from './__fixtures__/wire-tools.json'

// ---- compile-time conformance -------------------------------------------------
//
// A JSON fixture imports with widened types (every string is `string`), so
// `const x: Wire = fixture` proves the fixture carries every key the type
// REQUIRES with a compatible value, but not that the type knows every key the
// backend EMITS: an excess key on a non-fresh object is silently allowed. That
// second half is exactly how a type falls behind its producer, so
// `conforms<Wire>()(fixture)` also fails `tsc --noEmit` naming any key the
// fixture has that the type does not (recursively, through arrays). Literal
// unions in the type (`'active' | 'quiet'`) are widened first, because JSON
// cannot say which member it is; the few that matter are asserted at runtime.
//
// Use it for shapes backend-service builds itself (serde structs and `json!`
// literals). Raw Elasticsearch `_source` documents are typed as the subset the
// dashboard reads, by design, so those use a plain assignment instead.
type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T extends readonly (infer U)[] ? Widen<U>[] : T extends object ? { [K in keyof T]: Widen<T[K]> } : T
type Extra<TFixture, TWire> = [TWire] extends [readonly (infer TWireItem)[]]
  ? TFixture extends readonly (infer TFixtureItem)[]
    ? Extra<TFixtureItem, TWireItem>
    : never
  : [keyof TWire] extends [never]
    ? never // `unknown` / `{}`: the type deliberately leaves this open
    : [TWire] extends [object]
      ? TFixture extends object
        ? { [K in keyof TFixture & string]: K extends keyof TWire ? Extra<TFixture[K], NonNullable<TWire[K]>> : K }[keyof TFixture & string]
        : never
      : never
const conforms =
  <TWire,>() =>
  <TFixture extends Widen<TWire>>(fixture: TFixture & ([Extra<TFixture, Widen<TWire>>] extends [never] ? unknown : { 'keys the wire type does not declare': Extra<TFixture, Widen<TWire>> })): TFixture =>
    fixture
/** The same check without the excess-key half, for raw `_source` documents the type covers only in part. */
const accepts =
  <TWire,>() =>
  <TFixture extends Widen<TWire>>(fixture: TFixture): TFixture =>
    fixture
const sortedKeys = (value: object) => Object.keys(value).sort()

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

interface Operation {
  parameters?: { name: string; in: string; schema?: { enum?: string[] } }[]
  responses: Record<string, { content?: Record<string, unknown> }>
}
const pinned = JSON.parse(read('contracts/backend/openapi.json')) as {
  info: { 'x-api-version'?: number }
  paths: Record<string, Record<string, Operation | undefined>>
}
const source = JSON.parse(read('contracts/backend/SOURCE.json')) as { sha: string; apiVersion: number }

/** Stands for an interpolated path segment: matches an enum-valued parameter,
 * where a literal segment has to be one of its members. */
const VALUE = '\u0000'

/** The operation a concrete request path resolves to, as the backend's router
 * would: a `{param}` segment matches any single segment, but an enum-valued
 * one (the store's allowlist) only its members. */
function resolve(method: string, path: string): Operation | undefined {
  const segments = path.split('/')
  for (const [template, item] of Object.entries(pinned.paths)) {
    const op = item[method.toLowerCase()]
    const parts = template.split('/')
    if (!op || parts.length !== segments.length) continue
    const fits = parts.every((part, i) => {
      const name = /^\{(.+)\}$/.exec(part)?.[1]
      if (name === undefined) return part === segments[i]
      const allowed = op.parameters?.find((p) => p.in === 'path' && p.name === name)?.schema?.enum
      return !allowed || segments[i] === VALUE || allowed.includes(segments[i])
    })
    if (fits) return op
  }
  return undefined
}

/** Every `/api/v1` request the dashboard source makes: the helper called
 * (get/raw/stream are GET, post is POST, request names its method) and the
 * path literal, with `${...}` segments standing for a value. */
function dashboardCalls(): { method: string; path: string }[] {
  const calls = new Map<string, { method: string; path: string }>()
  for (const file of ['src/data/api.ts', 'src/routes/api.live.ts', 'src/routes/api.topology.flow.ts']) {
    const text = read(file)
    for (const m of text.matchAll(/\b(get|post|request|raw|stream)\s*(?:<[^()]*?>)?\s*\(\s*(?:'[A-Za-z]+'\s*,\s*)?([`'])(\/api\/v1[^`']*)\2([^\n]*)/g)) {
      const named = /method:\s*'([A-Z]+)'/.exec(m[4])?.[1]
      const method = m[1] === 'post' ? 'POST' : m[1] === 'request' && named ? named : 'GET'
      const path = m[3].split('?')[0].replace(/\$\{[^}]*\}/g, VALUE)
      calls.set(`${method} ${path}`, { method, path })
    }
  }
  return [...calls.values()]
}

describe('the pinned backend artifact', () => {
  it('records the commit it came from and a contract version this build supports', () => {
    expect(source.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(pinned.info['x-api-version']).toBe(source.apiVersion)
    expect(SUPPORTED_API_VERSIONS).toContain(source.apiVersion)
  })

  it('declares every route, method and store name the dashboard calls', () => {
    const calls = dashboardCalls()
    expect(calls.length).toBeGreaterThan(100) // the extraction found the calls, not nothing
    expect(calls.filter((c) => !resolve(c.method, c.path)).map((c) => `${c.method} ${c.path}`)).toEqual([])
  })
})

describe('wire types against representative responses', () => {
  // Compile-time proof: these assignments fail `tsc --noEmit` if a captured
  // response stops matching the hand-written type.
  it('accept the captured events, sources and profile responses', () => {
    const pages: EventsPage[] = [entityReads.eventsIp, entityReads.eventsSession]
    const sources: SourcesPageWire = entityReads.sources
    const profile: IpProfileWire = entityReads.ipProfile
    for (const page of pages) {
      expect(page.rows.length).toBeGreaterThan(0)
      for (const row of page.rows) expect(Object.keys(row)).toEqual(expect.arrayContaining(['id', 'time', 'sensor', 'src_ip', 'pivots']))
    }
    expect(sources.rows.length).toBeGreaterThan(0)
    expect(profile.ip).toBeTruthy()
  })
})


// ---- every other contract file ------------------------------------------------
//
// Each fixture group names the Rust (or worker) source it was derived from in
// its file's `_source` note. A key the backend emits that its wire type lacks
// is reported by tsc, not by a test run.

describe('charts and the topology slice', () => {
  it('serve every chart the proxy lets through, in the shape the serializer builds', () => {
    const charts = conforms<Charts>()(wireCharts.charts)
    const flow = conforms<FlowGraph>()(wireCharts.topologyFlow)
    expect(sortedKeys(charts)).toEqual([...CHART_NAMES].sort())
    expect(flow.nodes.length).toBeGreaterThan(0)
    // Series times are strings the chart builders parse; bars keep categories and values parallel.
    for (const name of ['dionaea-cves', 'ics-functions', 'decoy-requests', 'endlessh-held-histogram'] as const satisfies ChartName[]) {
      expect(charts[name].values).toHaveLength(charts[name].categories.length)
    }
    // fusion.rs: one count per signal label, in the label order of its SIGNALS table.
    expect(charts['attacker-fusion'].values).toHaveLength(charts['attacker-fusion'].categories.length)
    // kill_chain.rs: a cell points inside the grid it ships with.
    for (const cell of charts['attck-coverage'].cells) {
      expect(cell.tactic_idx).toBeLessThan(charts['attck-coverage'].tactics.length)
      expect(cell.technique_idx).toBeLessThan(charts['attck-coverage'].techniques.length)
    }
  })
})

describe('monitor wire types', () => {
  it('accept the overview, campaign, payload and config responses', () => {
    const kpis = conforms<OverviewKpis>()(wireMonitor.kpis)
    conforms<OverviewKpis>()(wireMonitor.kpisEmptyPrevious)
    expect(kpis.hourly).toHaveLength(24)
    expect(kpis.hourly_by_protocol).toHaveLength(24)
    const dashboard = conforms<Dashboard>()(wireMonitor.dashboard)
    conforms<Dashboard>()(wireMonitor.dashboardNoParts)
    // dashboard.rs derives `state` from the sensor's age; the type narrows it to three values.
    for (const sensor of dashboard.sensors) expect(['active', 'quiet', 'stale']).toContain(sensor.state)
    const campaigns = accepts<StorePage<CampaignRow>>()(wireMonitor.campaignsPage)
    expect(campaigns.rows[0]._doc_id).toBeTruthy()
    const payloads = accepts<PayloadsPage>()(wireMonitor.payloadsPage)
    expect(payloads.source_buckets).toBeDefined()
    const never: ConfigDoc = wireMonitor.configNever
    const stored: ConfigDoc = wireMonitor.configStored
    expect(never.payload.presentation).toBeUndefined()
    expect(stored.payload.presentation?.banner_severity).toBe('warning')
  })

  it('accept the ML anomaly, ack, disposition and health responses', () => {
    const anomalies = accepts<StorePage<MlAnomalyRow>>()(wireMonitor.mlAnomaliesPage)
    expect(anomalies.rows.map((row) => row._doc_id)).toEqual(['anom-0001', 'anom-0002'])
    const ack = conforms<MlAckRecord>()(wireMonitor.mlAck)
    const acks = accepts<MlAcks>()(wireMonitor.mlAcks)
    const all = conforms<MlAckAllResponse>()(wireMonitor.mlAckAll)
    const stats = conforms<MlAnomalyStats>()(wireMonitor.mlStats)
    const verdict = conforms<MlDispositionResponse>()(wireMonitor.mlDisposition)
    const retraction = conforms<MlDispositionResponse>()(wireMonitor.mlDispositionRetract)
    const health = wireMonitor.mlHealth.map((row) => conforms<MlModelHealth>()(row))
    expect([ack.Acknowledged, all.changed, stats.open, verdict.status, retraction.status, health.length]).toEqual([true, 3, 97, 'true_positive', 'open', 1])
    expect(Object.values(acks).every((record) => record.Key.length > 0)).toBe(true)
  })

  it('accept the LLM analysis, semantic search, agent campaign and auth-failure rows', () => {
    const analyses = accepts<StorePage<LlmAnalysisRow>>()(wireMonitor.llmPage)
    // llm-worker record_error writes doc_type "error", which the type documents as outside the page's three.
    expect(analyses.rows.map((row) => row.doc_type)).toEqual(['session', 'error'])
    const hits = [wireMonitor.llmSearch, wireMonitor.llmSearchForeign, wireMonitor.llmSearchUnavailable].map((hit) => accepts<LlmSearchResponse>()(hit))
    expect(hits.map((hit) => hit.available)).toEqual([true, true, false])
    const campaigns = accepts<StorePage<AgentCampaignRow>>()(wireMonitor.agentCampaignsPage)
    expect(campaigns.rows[0].severity).toMatch(/^(high|critical)$/)
    const failures = accepts<StorePage<AuthEventRow>>()(wireMonitor.authEventsPage)
    // Keycloak omits these, and Python None reaches Elasticsearch as null.
    expect(failures.rows[1]).toMatchObject({ client_id: null, user_id: null, ip_address: null, error: null })
  })
})

describe('operations wire types', () => {
  it('accept the sensor, alert and health responses', () => {
    const curated = conforms<CuratedSensorsWire>()(wireOperations.curatedSensors)
    // sensors.rs: credential_present is Option<bool>, so null is a real answer here.
    expect(curated.http_requests[0].credential_present).toBeNull()
    conforms<SensorCatalogWire>()(wireOperations.sensorCatalog)
    conforms<SensorEventsWire>()(wireOperations.sensorEvents)
    conforms<SensorOverviewWire>()(wireOperations.sensorOverview)
    const alerts = accepts<AlertPageWire>()(wireOperations.alertsPage)
    expect(alerts.rows.map((row) => row.LastNotified)).toEqual(['2026-10-14T08:00:00+00:00', null])
    conforms<AckAlertWire>()(wireOperations.alertAck)
    conforms<SourceHealthWire>()(wireOperations.sourceHealth)
    // webhook_delivery.rs: no record yet answers available:false with both attempts null.
    conforms<SourceHealthWire>()(wireOperations.sourceHealthNoWebhook)
  })

  it('accept the topology, dead-letter and problem-report responses', () => {
    conforms<TopologyWire>()(wireOperations.topology)
    const deadLetters = accepts<StorePage<DeadLetterWire>>()(wireOperations.deadLettersPage)
    expect(deadLetters.rows[0]._doc_id).toBeTruthy()
    conforms<PurgeDeadLettersWire>()(wireOperations.deadLettersPurged)
    const reports = accepts<ProblemReportPageWire>()(wireOperations.problemReportsPage)
    expect(reports.rows[0].status).toBe('open')
  })
})

describe('settings wire types', () => {
  it('accept the preferences and config responses', () => {
    conforms<PreferencesWire>()(wireSettings.preferences)
    conforms<PreferencesWire>()(wireSettings.preferencesNeverSaved)
    const config = accepts<ConfigWire>()(wireSettings.config)
    expect(Object.keys(config.payload)).toEqual(['presentation', 'behavior', 'honeypot', 'report_presets'])
    const empty = accepts<ConfigWire>()(wireSettings.configNeverWritten)
    expect(empty.payload).toEqual({})
    conforms<ConfigValidateWire>()(wireSettings.configValidate)
    conforms<ConfigValidateWire>()(wireSettings.configValidateOk)
    conforms<ConfigHistoryWire>()(wireSettings.configHistory)
    conforms<AuditWire>()(wireSettings.audit)
    conforms<UsersWire>()(wireSettings.users)
  })

  it('accept the services, reporter, storage, problem-report and mail responses', () => {
    // services-adapter.py container_status: a not_found or unknown container has NO
    // exit_code, started_at or restart_count key, only name and state.
    const services = accepts<ServicesWire>()(wireSettings.services)
    expect(services.services.map((s) => s.state)).toEqual(['running', 'exited', 'not_found', 'unknown'])
    const unavailable = accepts<ServicesWire>()(wireSettings.servicesUnavailable)
    expect(unavailable.available).toBe(false)
    conforms<ServiceLogsWire>()(wireSettings.serviceLogs)
    const actions = [wireSettings.serviceActionOk, wireSettings.serviceActionRefused].map((action) => accepts<ServiceActionWireResponse>()(action))
    expect(actions.map((a) => a.ok)).toEqual([true, false])
    conforms<ReporterStatsWire>()(wireSettings.reporterStats)
    conforms<ReporterStatsWire>()(wireSettings.reporterStatsNone)
    conforms<StorageWire>()(wireSettings.storage)
    const reports = accepts<ProblemReportsPageWire>()(wireSettings.problemReportsPage)
    expect(reports.rows[0].api_calls[0].response_body).toBe('boom')
    // mail.rs: `from` is an Option serialized without skip, so a message with no From header carries null.
    conforms<MailWire>()(wireSettings.mail)
    conforms<MailWire>()(wireSettings.mailNoFrom)
    conforms<AttackVectorsWire>()(wireSettings.attackVectors)
  })
})

describe('reports wire types', () => {
  it('accept the template, definition and generated-report responses', () => {
    conforms<ReportTemplatesWire>()(wireReports.templates)
    const definitions = accepts<ReportDefinitionsWire>()(wireReports.definitions)
    // reports_store.rs skips empty strings and a zero failure count, so a bare definition has no schedule and an empty branding.
    expect(definitions.definitions[1].schedule).toBeUndefined()
    expect(definitions.definitions[1].branding).toEqual({})
    const created = accepts<ReportDefinitionEnvelopeWire>()(wireReports.definitionCreated)
    const updated = accepts<ReportDefinitionEnvelopeWire>()(wireReports.definitionUpdated)
    expect([created.definition.id, updated.definition.id]).toEqual(['def-1', 'def-2'])
    conforms<ReportDeletedWire>()(wireReports.definitionDeleted)
    conforms<ReportDeletedWire>()(wireReports.generatedDeleted)
    conforms<GenerateReportWire>()(wireReports.generated)
    const generated = accepts<GeneratedReportPageWire>()(wireReports.generatedReportsPage)
    expect(generated.rows.map((row) => row.origin)).toEqual(['schedule', 'manual'])
  })

  it('accept the sandbox-run and payload pickers', () => {
    const runs = accepts<ReportSandboxRunPageWire>()(wireReports.sandboxRunsPage)
    expect(runs.rows[0].sandbox.job).toBe('job1')
    const payloads = accepts<PayloadSearchPageWire>()(wireReports.payloadSearchPage)
    expect(payloads.rows[0].Hash).toHaveLength(64)
  })
})

describe('tools wire types', () => {
  it('accept the canarytoken responses', () => {
    // canarytokens.rs `types` serializes the bare array, not an envelope.
    expect(Array.isArray(wireTools.types)).toBe(true)
    wireTools.types.map((type) => conforms<CanaryTokenTypeWire>()(type))
    conforms<CreatedCanarytokenWire>()(wireTools.created)
    const list = accepts<CanarytokenListWire>()(wireTools.list)
    expect(list.tokens.map((token) => token.filename_hint)).toEqual(['quarterly-report.docx', ''])
    const store = accepts<CanarytokenStorePageWire>()(wireTools.storePage)
    // The store page excludes auth_token (stores.rs), as the dedicated list does.
    expect(JSON.stringify([list, store])).not.toContain('auth_token')
    const fired = accepts<CanaryFiredPageWire>()(wireTools.fired)
    expect(fired.rows[0].record.honeypot.token_type).toBe('ms_word')
  })

  it('accept the bait credential responses', () => {
    const credentials = accepts<CredentialListWire>()(wireTools.credentials)
    expect(credentials.credentials.map((c) => c.linked_token_id)).toEqual([undefined, 'a1b2c3d4e5f6a7b8c9d0e1f2a'])
    const outage = accepts<CredentialListWire>()(wireTools.credentialsUnavailable)
    expect(outage).toMatchObject({ available: false, credentials: [] })
  })
})

describe('evidence wire types', () => {
  it('accept the payload inventory, detail and report responses', () => {
    const payloads = accepts<PayloadPageWire>()(wireEvidence.payloadsPage)
    expect(payloads.rows[0]._doc_id).toBe(payloads.rows[0].Hash)
    const detail = accepts<PayloadDetailWire>()(wireEvidence.payloadDetail)
    const bytesOnly = accepts<PayloadDetailWire>()(wireEvidence.payloadDetailBytesOnly)
    // payload_detail.rs: any one of inventory, analysis, yara or bytes makes a payload exist; the rest are null / [].
    expect([detail.inventory.Kind, bytesOnly.inventory, bytesOnly.analysis]).toEqual(['ELF executable', null, null])
    conforms<PayloadReportWire>()(wireEvidence.payloadReport)
  })

  it('accept the sandbox, Ghidra, CAPE, Rev.Deck and GitHub analysis documents', () => {
    const sandbox = accepts<SandboxRunDetailPageWire>()(wireEvidence.sandboxRunPage)
    expect(sandbox.rows[0].sandbox.risk_level).toBe('low')
    const golden = [wireEvidence.goldenImageStatus, wireEvidence.goldenImageUnconfigured].map((status) => accepts<GoldenImageStatusWire>()(status))
    expect(golden.map((g) => g.configured)).toEqual([true, false])
    const vnc = conforms<SandboxVncStatusWire>()(wireEvidence.sandboxVnc)
    expect(vnc.bridge_ws).toBeTruthy()
    // ghidra-worker.py failure_result writes explicit nulls for the optional blocks.
    const ghidra = accepts<GhidraRunPageWire>()(wireEvidence.ghidraRunPage)
    expect(ghidra.rows.map((row) => row.ghidra.exit_status)).toEqual(['ok', 'error'])
    expect(ghidra.rows[0].ioc_correlation?.has_sandbox_run).toBe(true)
    conforms<GhidraCallGraphWire>()(wireEvidence.ghidraCallGraph)
    const revdeck = accepts<RevDeckRunPageWire>()(wireEvidence.revdeckRunPage)
    expect(revdeck.rows[0].revdeck.status).toBe('complete')
    // cape-worker.py failure_result writes null task_id and cape_status.
    const cape = accepts<CapeRunPageWire>()(wireEvidence.capeRunPage)
    expect(cape.rows.map((row) => row.cape.exit_status)).toEqual(['ok', 'error'])
    const github = accepts<GithubAnalysisPageWire>()(wireEvidence.githubAnalysisPage)
    expect(github.rows[0].github_analysis.verdict.level).toBe('high')
  })

  it('accept the submit, artifact, workbench, GPU queue and model-health responses', () => {
    conforms<SandboxSubmitWire>()(wireEvidence.sandboxSubmit)
    conforms<GhidraSubmitWire>()(wireEvidence.ghidraSubmit)
    conforms<GithubAnalysisSubmitWire>()(wireEvidence.githubAnalysisSubmit)
    conforms<ArtifactListWire>()(wireEvidence.artifactList)
    conforms<AnalyzerCatalogWire>()(wireEvidence.analyzerCatalog)
    conforms<CreateWorkbenchRunWire>()(wireEvidence.workbenchRunCreated)
    conforms<WorkbenchRunEnvelopeWire>()(wireEvidence.workbenchRunEnvelope)
    conforms<WorkbenchRunListWire>()(wireEvidence.workbenchRunList)
    conforms<WorkbenchRecipeListWire>()(wireEvidence.workbenchRecipeList)
    conforms<SaveWorkbenchRecipeWire>()(wireEvidence.workbenchRecipeSaved)
    const queue = accepts<GpuQueueWire>()(wireEvidence.gpuQueue)
    // gpu_queue.rs: `result` is Null unless a vault-rag job produced one.
    expect(queue.map((job) => job.result)).toEqual([null, { answer: 'x', citations: [] }])
    conforms<GpuAbortWire>()(wireEvidence.gpuAbort)
    const health = accepts<MlHealthWire>()(wireEvidence.mlHealth)
    expect(health[0].accepted).toBe(true)
  })
})

describe('explorer wire types', () => {
  it('accept the filter values, event page, session, recordings, replay and search responses', () => {
    conforms<FilterValuesWire>()(wireExplorer.filterValues)
    conforms<EventPageWire>()(wireExplorer.eventPage)
    const session = accepts<SessionDetailWire>()(wireExplorer.sessionDetail)
    expect(session.events.length).toBe(1)
    conforms<RecordingsPageWire>()(wireExplorer.recordingsPage)
    conforms<ReplayWire>()(wireExplorer.replay)
    conforms<SearchResultWire>()(wireExplorer.searchResult)
    conforms<SearchResultWire>()(wireExplorer.searchRedirect)
  })
})

describe('the entity-group events response', () => {
  // events.rs `EventsPage.fingerprint_ips` is an `Option` with no skip_serializing_if, so the
  // backend always sends the key: null unless a fingerprint filter matched more than one address.
  it('carries fingerprint_ips, as the backend always sends it', () => {
    const page = accepts<EventsPage>()(entityGroups.events)
    expect(page).toHaveProperty('fingerprint_ips', null)
    for (const captured of [entityReads.eventsIp, entityReads.eventsSession]) expect(captured).toHaveProperty('fingerprint_ips')
  })
})

describe('downloads and the live stream', () => {
  it('are declared with the media types the handlers rely on', () => {
    const contentTypes = (path: string) => Object.keys(resolve('GET', path)?.responses['200']?.content ?? {})
    expect(contentTypes('/api/v1/live')).toEqual(['text/event-stream'])
    expect(contentTypes('/api/v1/artifacts/ghidra/key/file.bin')).toEqual(['application/octet-stream'])
    // The canarytoken download is a redirect to the token's file, not a body.
    expect(Object.keys(resolve('GET', '/api/v1/canarytokens/x/download')!.responses)).toContain('302')
  })

  it('are served by the dashboard with the same media types', () => {
    expect(read('src/routes/api.live.ts')).toContain("'content-type': 'text/event-stream'")
  })
})

// ---- UI paths the backend emits --------------------------------------------
//
// The backend builds dashboard paths itself (search hits, aggregation links,
// timeline hrefs, workbench result links, observation links). Rather than move
// every one to the client, this table names each shape with where APIARY
// emits it; the test resolves a sample of each against the route tree, so a
// dashboard route rename or removal fails here instead of leaving a dead link.
// A NEW backend-emitted path is not caught automatically: add it here in the
// change that adds it.
const EMITTED = [
  // backend-service/src/search.rs
  '/sessions/abc', '/investigate/ip/203.0.113.4', '/events?cmd=ls', '/events?kind=login', '/events?fingerprint=f', '/events?persona=p', '/events', '/sensors', '/history?q=x',
  // backend-service/src/dashboard.rs
  '/events?asn=1', '/events?shasum=ab', '/events?proto=tcp', '/events?port=22', '/events?country=NL', '/events?city=Rome', '/events?provider=p', '/events?ip=1.2.3.4', '/events?path=%2Fx', '/commands',
  // backend-service/src/detail.rs, events.rs, worker.rs
  '/events?sensor=cowrie&k=v', '/tty-replay/abc', '/events?cidr=203.0.113.0/24',
  // backend-service/src/entity_details.rs (timeline hrefs)
  '/events/abc', '/payloads/abc',
  // backend-service/src/workbench_domain.rs, workbench_orchestrator.rs, worker.rs
  '/ghidra/abc', '/sandbox/job1', '/cape/abc',
]

function routePatterns(): string[] {
  const tree = read('src/routeTree.gen.ts')
  const block = tree.slice(tree.indexOf('export interface FileRoutesByFullPath'))
  return [...block.slice(0, block.indexOf('\n}')).matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1].replace(/(.)\/$/, '$1'))
}

describe('backend-emitted UI paths', () => {
  it('each resolve to a dashboard route', () => {
    const patterns = routePatterns().map((p) => p.split('/'))
    const matches = (path: string) => {
      const segments = path.split(/[?#]/)[0].replace(/(.)\/$/, '$1').split('/')
      return patterns.some((p) => p.length === segments.length && p.every((part, i) => part.startsWith('$') || part === segments[i]))
    }
    expect(EMITTED.filter((p) => !matches(p))).toEqual([])
  })
})
