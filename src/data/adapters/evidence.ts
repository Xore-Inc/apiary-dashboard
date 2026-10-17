// Wire → page mapping for the evidence slice (payloads, analysis results,
// sandbox, Ghidra, CAPE, GitHub analysis, RevDeck, Workbench). Pure
// functions over the shapes in ../contracts/evidence; nothing here fetches.
//
// The page types stay exactly as they render today. Where the wire is a
// superset the extras are dropped, and where it is a subset the lost page
// fields are named in the doc comment on that adapter (and in the slice's
// gaps) rather than widening a page type to hold them.
import type { ArtifactRow } from '../queries.impl'
import type {
  AnalyzerCatalog,
  AnalyzerId,
  AnalyzerInfo,
  AnalyzerOptions,
  AnalysisResult,
  GpuJob,
  CapeRun,
  CapturedPayload,
  CountRow,
  GhidraAnalysis,
  GithubAnalysis,
  GithubStatus,
  Ioc,
  ModelHealth,
  PayloadAnalysis,
  PayloadClassification,
  RevDeckRun,
  SandboxRun,
  WorkbenchRecipe,
  WorkbenchRun,
  WorkbenchRunChild,
} from '../types'
import type {
  AnalyzerCatalogWire,
  ArtifactListWire,
  CapeRunPageWire,
  CapeRunWire,
  CreateWorkbenchRunBody,
  GhidraCallGraphWire,
  GhidraRunDetailWire,
  GhidraRunPageWire,
  GithubAnalysisPageWire,
  GithubAnalysisWire,
  GpuJobWire,
  MlHealthWire,
  PayloadClassificationWire,
  PayloadDetailWire,
  PayloadPageWire,
  RevDeckRunPageWire,
  RevDeckRunWire,
  SandboxRunDetailWire,
  SandboxRunPageWire,
  SaveWorkbenchRecipeBody,
  WorkbenchAnalyzerWire,
  WorkbenchOptionsWire,
  WorkbenchRunEnvelopeWire,
  WorkbenchRunListWire,
  WorkbenchRecipeWire,
  WorkbenchRunWire,
  WorkbenchSelectionWire,
  YaraRunPageWire,
} from '../contracts/evidence'

/** A sandbox risk score as the run page words it. Same scale the mock's
 * sandboxVerdict uses, so a wire-backed run reads identically. */
export const sandboxVerdict = (risk: number): SandboxRun['verdict'] => (risk > 70 ? 'malicious' : risk > 40 ? 'suspicious' : 'benign')

const lines = (value: string | string[] | undefined | null): string[] => (Array.isArray(value) ? value : value ? [value] : [])

/** The Ghidra `sha256`, or "" on a run whose producer never stamped one. */
const subject = (wire: { sha256?: string }, fallback: string): string => wire.sha256 || fallback

// ---- Payloads --------------------------------------------------------------

/** GET /api/v1/payloads and GET /api/v1/payloads/{hash}.inventory — one
 * dashboard-payload-inventory-v1 `_source`.
 *
 * `SizeH` (the writer's human-readable size), `Mtime` (local), `KindCode`,
 * `AnalysisPath` and `GitHubAnalysisURL` have no page field. The page's
 * `verdict` is not on the wire at all: it comes from the analysis results,
 * so it is left off here (see `getPayloads`' documented gap).
 */
export function capturedPayload(wire: PayloadPageWire['rows'][number]): CapturedPayload {
  return {
    hash: wire.Hash,
    sources: lines(wire.Sources),
    kind: wire.Kind,
    platform: wire.Platform,
    mime: wire.MIME,
    sizeBytes: wire.Size,
    copies: wire.Copies,
    dynamic: wire.Dynamic,
    preview: wire.Preview,
    capturedAt: wire.MtimeUTC,
  }
}

/** GET /api/v1/payloads. The `?aggs=sources` census becomes the page's
 * source counts; without it the page counts what the loaded page carries. */
export function capturedPayloads(wire: PayloadPageWire): { payloads: CapturedPayload[]; sources: CountRow[] } {
  const counts = new Map<string, number>()
  for (const bucket of wire.source_buckets ?? []) counts.set(bucket.key, bucket.doc_count)
  return {
    payloads: wire.rows.map(capturedPayload),
    sources: [...counts].map(([id, count]) => ({ id, label: id, count })),
  }
}

/** An indicator as a page `Ioc`. The wire carries bare strings, so the kind
 * comes from the value's own shape — the same order `IocLookup`'s
 * `classify` reads them in, narrowed to the four kinds the page allows. */
const iocKind = (value: string): Ioc['kind'] => {
  if (/^https?:\/\//i.test(value)) return 'url'
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-f:]*:[0-9a-f:]+$/i.test(value)) return 'ip'
  if (value.startsWith('/')) return 'path'
  return 'domain'
}

/** GET /api/v1/payloads/{hash}. The page's verdict is not on this endpoint:
 * `verdict` stays unset (the caller's github summary fills that in).
 *
 * Gaps: the page's `hashes.ssdeep`/`tlsh` and `sections` have no field on
 * this index (fuzzy hashes and section entropy live on the Ghidra doc's
 * `fuzzy`/`lief`, which `getGhidraAnalysis` reads instead), and
 * `staticRisk` is the caller's number — the index's own `StaticRiskScore`
 * is not what the page shows.
 */
export function payloadAnalysis(wire: PayloadDetailWire, payload: CapturedPayload, risk: number): PayloadAnalysis {
  const analysis = wire.analysis?.Analysis ?? {}
  const yara = wire.yara.flatMap((row) => row.yara.matches ?? [])
  const iocValues = lines(analysis.IOCs)
  return {
    payload,
    staticRisk: risk,
    packingLikelihood: analysis.PackedLikely ? 80 : 5,
    hashes: {
      md5: analysis.MD5 ?? '',
      sha1: analysis.SHA1 ?? '',
      sha256: analysis.SHA256 || wire.hash,
      ssdeep: '',
      tlsh: '',
    },
    fileType: analysis.MIME || wire.inventory?.Kind || '',
    ...(analysis.Classification ? { classification: analysis.Classification.label } : {}),
    yara: [...new Set([...(analysis.YARAMatches ?? []), ...(analysis.yara_matches ?? []), ...yara])],
    iocs: iocValues.map((value, i) => ({ id: `ioc-${i}`, kind: iocKind(value), value })),
    strings: lines(analysis.Indicators),
    decoded: (analysis.Decoded ?? []).map((item) => ({ encoding: item.source, value: item.preview })),
    sections: [],
    preview: analysis.Hexdump || wire.hex_preview.join('\n'),
    ghidra: false,
  }
}

// ---- Sandbox ---------------------------------------------------------------

/** GET /api/v1/sandbox/{job} and GET /api/v1/store/sandbox-runs. The row
 * nests the run under the importer's `sandbox` label (es_importer.rs
 * `build_document`), so the label is unwrapped here rather than by every
 * caller.
 *
 * Big gaps, all on the page side: the run's `packets`, `output`, `dns`,
 * `connections`, `route`, `processes`, `sockets`, `stdout`/`stderr`,
 * `network`, `staticIocs`, `windows`, `logs`, `exported` and `diagnostics`
 * have no field in export-result.py's payload — the worker writes raw text
 * logs under `artifacts` and free-form `network_summary` instead. The page
 * type is not widened to hold them.
 */
export function sandboxRun(wire: SandboxRunDetailWire): SandboxRun {
  const run = wire.sandbox
  const technique = (id: string) => ({ id, name: id, tactic: id, events: 0 })
  return {
    job: run.job,
    hash: run.sha256,
    at: run.completed_at,
    verdict: sandboxVerdict(run.risk_score),
    risk: run.risk_score,
    platform: run.platform,
    durationSeconds: run.duration_seconds,
    packets: 0,
    changedPaths: lines(run.changed_files),
    syscalls: (run.top_syscalls ?? []).map((s) => ({ id: s.name, label: s.name, count: s.count })),
    processesAdded: [],
    socketsAdded: lines(run.sockets_after),
    output: run.stdout ?? '',
    dns: [],
    connections: [],
    iocsStatic: [],
    iocsDynamic: lines(run.iocs),
    techniques: (run.techniques ?? []).map((t) => ({ ...technique(t.id), name: t.name })),
    diagnostics: { exit_status: run.exit_status, run_status: run.run_status ?? '' },
    route: { name: run.platform.toLowerCase().includes('windows') ? 'windows-kvm' : 'linux-qemu', vm: '', snapshot: '' },
    processes: { added: [], removed: [] },
    sockets: { before: lines(run.sockets_before), after: lines(run.sockets_after) },
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
    network: { bytes: 0, protocols: [], remoteIps: [], hostEvents: [], attempts: [], guest: { packets: 0, pcapBytes: 0, protocols: [], events: [] } },
    staticIocs: { remoteIps: [], uncPaths: [], downloadUrls: [], downloadCradles: 0 },
    logs: { kernel: '', hostTcpdump: '', guestTcpdump: '', serialConsole: '', qemu: '', domainState: '' },
    exported: [],
  }
}

/** GET /api/v1/store/sandbox-runs?offset&size. */
export function sandboxRunPage(wire: SandboxRunPageWire): { total: number; runs: SandboxRun[] } {
  return { total: wire.total, runs: wire.rows.map(sandboxRun) }
}

/** GET /api/v1/sandbox/golden-image-status. The host timer writes its own
 * key names; the page's camelCase shape only exists on the mock, so what
 * the wire carries is passed through as the page's own record and `error`
 * is filled from the backend's refusal to answer. */
export function goldenImageStatus(wire: Record<string, unknown> & { configured: boolean }): SandboxRun['goldenImage'] {
  if (!wire.configured) return undefined
  // `path` and the not-found `error` are the writer's own; the page has no
  // field for the path.
  return {
    builtAt: typeof wire.built_at === 'string' ? wire.built_at : '',
    ageDays: typeof wire.age_days === 'number' ? wire.age_days : 0,
    checksumWritten: wire.checksum_written === true,
    checksumVerified: wire.checksum_verified === true,
    staleMonthly: wire.stale_monthly === true,
    staleIsoEval: wire.stale_iso_eval === true,
    checkedAt: typeof wire.checked_at === 'string' ? wire.checked_at : '',
    ...(typeof wire.error === 'string' ? { error: wire.error } : {}),
  }
}

// ---- Ghidra ----------------------------------------------------------------

/** GET /api/v1/ghidra/{sha} and GET /api/v1/store/ghidra-runs. The row
 * nests the analysis under the importer's `ghidra` label; `ioc_correlation`
 * is written by detail.rs BESIDE that label (and canonical reads it from
 * there, ghidra.$sha.tsx:1103), so it is read off the row, not the run.
 *
 * Gaps: the worker records `arch` nowhere (it is not in `result`), so the
 * page reads it from LIEF's `architecture`; `functionsTotal` is the length
 * of the collected list, not the program's real function count; the page's
 * `cryptoConstants` maps from `findcrypt`, which carries no algorithm name;
 * and `chat`/`symbolRecovery` come from the revdeck chat/recovery fields,
 * whose own shape is not the page's thread/message form.
 */
export function ghidraAnalysis(wire: GhidraRunDetailWire): GhidraAnalysis {
  const doc = wire.ghidra
  const floss = doc.floss?.strings ?? {}
  const totals = {
    decoded: floss.decoded?.length ?? 0,
    stack: floss.stack?.length ?? 0,
    tight: floss.tight?.length ?? 0,
    static: floss.static?.length ?? 0,
  }
  const correlation = wire.ioc_correlation
  const evidence = (k?: { floss_only: string[]; sandbox_static_only: string[]; confirmed_at_runtime: string[] }) => ({
    flossOnly: k?.floss_only ?? [],
    sandboxStaticOnly: k?.sandbox_static_only ?? [],
    confirmedAtRuntime: k?.confirmed_at_runtime ?? [],
  })
  return {
    hash: doc.sha256,
    at: doc.completed_at,
    arch: doc.lief?.architecture ?? '',
    run: {
      requestedAt: doc.requested_at,
      startedAt: doc.started_at,
      completedAt: doc.completed_at,
      exitStatus: doc.exit_status === 'ok' ? 'ok' : 'error',
      ...(doc.exit_status === 'ok' ? {} : { error: `Ghidra worker exited ${doc.exit_status}.` }),
    },
    functionsTotal: doc.functions.length,
    functions: doc.functions.map((fn) => ({
      name: fn.name,
      address: fn.address,
      size: fn.size ?? 0,
      calls: (fn.callees ?? []).length,
      signature: fn.signature ?? '',
      callers: (fn.callers ?? []).map((c) => c.name),
      callees: (fn.callees ?? []).map((c) => c.name),
      decompiled: fn.decompiled ?? '',
    })),
    imports: (doc.imports ?? []).map((i) => ({ id: typeof i === 'string' ? i : i.name, label: typeof i === 'string' ? i : i.name, count: typeof i === 'string' ? 1 : i.count ?? 1 })),
    strings: doc.strings ?? [],
    cryptoConstants: (doc.findcrypt ?? []).map((c) => ({ name: c.name, address: c.address, algorithm: '' })),
    fuzzy: { ssdeep: doc.fuzzy_hashes?.ssdeep ?? '', tlsh: doc.fuzzy_hashes?.tlsh ?? '', imphash: doc.fuzzy_hashes?.imphash ?? '' },
    lief: {
      format: doc.lief?.format === 'PE' ? 'PE' : 'ELF',
      architecture: doc.lief?.architecture ?? '',
      entrypoint: doc.lief?.entrypoint ?? '',
      isPie: doc.lief?.is_pie ?? false,
      stripped: doc.lief?.stripped ?? false,
      isDll: doc.lief?.is_dll ?? null,
      compileTimestamp: doc.lief?.compile_timestamp ?? null,
      sectionCount: doc.lief?.section_count ?? 0,
      libraries: doc.lief?.libraries ?? [],
    },
    capa: (doc.capa?.capabilities ?? []).map((c) => ({ capability: c.name, namespace: c.namespace, matches: c.matches, ...(c.attck?.[0] ? { attck: c.attck[0] } : {}) })),
    capaAttack: doc.capa?.attack ?? [],
    capaMbc: doc.capa?.mbc ?? [],
    floss: { decoded: floss.decoded ?? [], stack: floss.stack ?? [], tight: floss.tight ?? [], static: floss.static ?? [], totals, truncated: doc.floss?.truncated ?? false },
    iocCorrelation: {
      hasSandboxRun: correlation?.has_sandbox_run ?? false,
      ips: evidence(correlation?.ips),
      domains: evidence(correlation?.domains),
      urls: evidence(correlation?.urls),
      uncPaths: evidence(correlation?.unc_paths),
    },
    aiTriage: {
      summary: doc.ai_triage?.summary ?? '',
      model: doc.ai_triage?.model ?? '',
      confidence: doc.ai_triage?.confidence === 'high' ? 'high' : doc.ai_triage?.confidence === 'low' ? 'low' : 'medium',
      familyGuess: doc.ai_triage?.family_guess ?? '',
      behaviors: doc.ai_triage?.behaviors ?? [],
    },
    // The wire's `kind` is free-form; the page allows three. Anything else
    // reads as a typedef, which is the shape RevDeck actually emits.
    types: (doc.types ?? []).map((t) => ({ ...t, kind: t.kind === 'struct' || t.kind === 'enum' ? t.kind : 'typedef' })),
    globals: doc.globals ?? [],
    annotations: { revision: doc.annotations?.revision ?? 0, entries: doc.annotations?.entries ?? [] },
    memoryMap: doc.memory_map ?? [],
    chat: { threads: [], messages: [] },
    symbolRecovery: { matched: 0, total: 0, candidates: [] },
  }
}

/** GET /api/v1/store/ghidra-runs?offset&size. */
export function ghidraRunPage(wire: GhidraRunPageWire): { total: number; runs: GhidraAnalysis[] } {
  return { total: wire.total, runs: wire.rows.map(ghidraAnalysis) }
}

/** GET /api/v1/ghidra-callgraph/{sha}. Cytoscape reads this shape as-is.
 *
 * There is no page type for this: the dashboard renders the call graph from
 * `GhidraAnalysis.functions` (see `#/lib/callGraphLayout`), not from this
 * endpoint, so this is a pass-through for whoever wants the Cytoscape view.
 * `GhidraAnalysis` itself never carries `truncated` — the node cap is
 * `detail.rs`'s own `GHIDRA_CALLGRAPH_MAX_NODES`. */
export function ghidraCallGraph(wire: GhidraCallGraphWire): GhidraCallGraphWire {
  return { nodes: wire.nodes, edges: wire.edges, truncated: wire.truncated }
}

// ---- RevDeck ---------------------------------------------------------------

/** GET /api/v1/revdeck/{sha}. The endpoint serves the doc's `revdeck` field
 * alone, so the subject sha comes from the caller. `steps` and `citations`
 * are null on a RevDeck run that reported neither. */
export function revDeckRun(wire: RevDeckRunWire, sha: string): RevDeckRun {
  return {
    sha,
    at: '',
    status: wire.status === 'complete' ? 'completed' : 'failed',
    verdict: wire.citations ? `${wire.citations.valid.length} of ${wire.citations.valid.length + wire.citations.invalid.length} citations valid` : '',
    summary: wire.answer,
    steps: wire.steps ?? [],
    citations: wire.citations ?? { valid: [], invalid: [] },
    ...(wire.error ? { error: wire.error } : {}),
    workflow: wire.workflow,
    transcript: [],
  }
}

/** GET /api/v1/store/revdeck?offset&size. The subject sha lives on the doc
 * beside the label (the importer copies `sha256` up, and canonical reads it
 * the same way — revdeck.index.tsx:25), never inside the nested run. */
export function revDeckRuns(wire: RevDeckRunPageWire): RevDeckRun[] {
  return wire.rows.flatMap((row) => (row.revdeck ? [revDeckRun(row.revdeck, row.sha256 ?? row.file?.hash?.sha256 ?? '')] : []))
}

// ---- CAPE ------------------------------------------------------------------

/** GET /api/v1/cape/{sha} and GET /api/v1/store/cape. The detail endpoint
 * writes `report_summary` into the nested `cape` field, and that summary is
 * what carries the process list and call counts; the page's `processes`
 * (pid/name/commandLine) reads `module_path` off it, and `config`/`log`
 * read CAPE's own `debug_log` and payload config. A STORE row has no
 * summary (the generic store serves the `_source` verbatim), so its
 * processes and call counts are genuinely empty rather than wrong.
 */
export function capeRun(wire: CapeRunWire): CapeRun {
  const doc = wire
  const summary = doc.report_summary
  return {
    sha: doc.sha256,
    at: doc.completed_at,
    status: doc.cape_status === 'reported' ? 'reported' : 'failed_analysis',
    malscore: doc.score ?? summary?.malscore ?? 0,
    signatures: doc.signatures.map((s) => ({ name: s.name, severity: s.severity ?? 0, description: s.description })),
    processes: (summary?.processes ?? []).map((p) => ({ pid: p.process_id, name: p.process_name, commandLine: p.module_path })),
    dumps: lines((summary?.payloads as string[] | undefined) ?? undefined),
    config: (summary?.configs as Record<string, string> | undefined) ?? {},
    log: typeof summary?.debug_log === 'string' ? summary.debug_log : '',
    // cape-worker.py's failure envelope writes null for both (CAPE never took the sample).
    taskId: doc.task_id ?? 0,
    capeStatus: doc.cape_status ?? '',
    malstatus: summary?.malstatus ?? '',
    totalCalls: summary?.total_calls ?? 0,
    sections: summary?.summary_keys ?? [],
    debugErrors: lines((summary?.debug_errors as string[] | undefined) ?? undefined),
    ...(summary?.package ? { package: summary.package } : {}),
  }
}

/** GET /api/v1/store/cape?offset&size. Rows are nested under `cape` by the
 * importer, and the store serves them WITHOUT the summary reduction, so
 * every row here has empty processes/call counts until its detail endpoint
 * adds them — a real gap, not a mapping failure.
 */
export function capeRuns(wire: CapeRunPageWire): CapeRun[] {
  return wire.rows.flatMap((row) => (row.cape ? [capeRun(row.cape)] : []))
}

// ---- GitHub analysis -------------------------------------------------------

/** The scanner verdicts a GitHub result carries, as the page's rows: an
 * ok scanner that flagged the sample is malicious, one that flagged it as
 * suspicious is suspicious, and anything else is undetected. */
function scannerVerdicts(wire: GithubAnalysisWire): GithubAnalysis['results'] {
  return wire.scanners.map((s) => ({
    engine: s.source,
    verdict: !s.ok || !s.positives ? 'undetected' : s.suspicious ? 'suspicious' : 'malicious',
    ...(s.suspicious ? { label: 'Suspicious' } : {}),
    ...(s.permalink ? { permalink: s.permalink } : {}),
  }))
}

const githubStatus = (wire: GithubAnalysisWire): GithubStatus => (wire.exit_status === 'ok' && wire.report_pdf ? 'published' : 'dry_run')

/** GET /api/v1/github-analysis/{sha}. The handler serves the doc's
 * `github_analysis` field unwrapped, with `requested_by` and `view_url`
 * written INTO that inner object.
 *
 * `denylist_blocked` and `quota_exceeded` are refusals the backend records
 * in the audit log, not states the result document carries; a refused
 * publication reads here as `dry_run`.
 *
 * `requestedBy` is required on the page but only `detail.rs` computes it
 * (from the audit log), so a store row — which carries no such field —
 * reads as "unknown" rather than claiming nobody asked for it.
 */
export function githubAnalysis(wire: GithubAnalysisWire): GithubAnalysis {
  const doc = wire
  const requestedBy = doc.requested_by
  const viewUrl = doc.view_url

  const detections = doc.verdict?.malicious ?? 0
  return {
    sha: doc.sha256,
    at: doc.completed_at,
    status: githubStatus(doc),
    detections,
    engines: doc.verdict?.total ?? 0,
    risk: doc.verdict?.level === 'high' ? 'high' : doc.verdict?.level === 'medium' ? 'medium' : 'low',
    ...(doc.family ? { family: doc.family } : {}),
    results: scannerVerdicts(doc),
    yaraRules: doc.yara_auto_rules ?? [],
    repoPath: doc.sample_path ?? '',
    ...(doc.commit ? { commit: { sha: doc.commit, url: viewUrl ?? '' } } : {}),
    ...(doc.run_url ? { runUrl: doc.run_url } : {}),
    requestedBy: requestedBy || 'unknown',
    ...(doc.report_pdf ? { reportPdf: doc.report_pdf } : {}),
    ...(viewUrl ? { viewUrl } : {}),
  }
}

/** GET /api/v1/store/github-analysis?offset&size. Rows are still nested under
 * the importer's `github_analysis` label, and the two fields the detail
 * endpoint computes (`requested_by`, `view_url`) are absent from a store row,
 * so it reads as "unknown" rather than claiming nobody asked for it. */
export function githubAnalysisPage(wire: GithubAnalysisPageWire): GithubAnalysis[] {
  return wire.rows.map((row) => githubAnalysis(row.github_analysis))
}

// ---- Artifacts -------------------------------------------------------------

/** GET /api/v1/artifacts/{kind}/{key}. The row is the page's row, renamed
 * only. `importedAt` comes from the store's own field. */
export function artifactRows(wire: ArtifactListWire): ArtifactRow[] {
  return wire.rows.map((row) => ({ filename: row.filename, kind: row.kind, contentType: row.content_type, sizeBytes: row.size_bytes, importedAt: row.imported_at }))
}

// ---- Workbench -------------------------------------------------------------

/** GET /api/v1/workbench/analyzers?hash=.
 *
 * The wire's analyzer ids are the workbench's own (`deterministic`,
 * `linux-sandbox`, `windows-sandbox`, `windows-ghosts`, `ghidra`, `revdeck`,
 * `cape`); the page's AnalyzerId set is a different one (`static`, `yara`,
 * `sandbox`, …). The catalog maps `deterministic` → `static` and the three
 * sandbox routes → `sandbox`, so a page render cannot claim an analyzer the
 * backend does not offer. Everything an analyzer id has no page slot for
 * (concurrency_class, result_link_shape) is dropped.
 */
export function analyzerId(wire: string): AnalyzerId {
  switch (wire) {
    case 'deterministic':
      return 'static'
    case 'linux-sandbox':
    case 'windows-sandbox':
    case 'windows-ghosts':
      return 'sandbox'
    default:
      return wire as AnalyzerId
  }
}

function analyzerInfo(wire: WorkbenchAnalyzerWire): AnalyzerInfo {
  return {
    id: analyzerId(wire.id),
    label: wire.display_name,
    description: wire.description,
    gpu: wire.gpu_consuming,
    acceptedKinds: wire.accepted_kinds,
    availability: wire.availability === 'configured' ? 'available' : 'unavailable',
    ...(wire.availability === 'configured' ? {} : { availabilityNote: wire.reason }),
    requiredRole: wire.required_role === 'admin' ? 'admin' : 'viewer',
    detonates: wire.detonates,
    ...(wire.confirmation !== 'none' ? { confirmation: wire.confirmation } : {}),
    localOnly: !wire.externally_publishing,
    requiresOptIn: wire.requires_opt_in,
    defaultOptions: analyzerOptions(wire.default_options),
    optionSchema: {
      timeoutMinSeconds: wire.option_schema.timeout_min_seconds,
      timeoutMaxSeconds: wire.option_schema.timeout_max_seconds,
      queueAgeMinSeconds: wire.option_schema.queue_age_min_seconds,
      queueAgeMaxSeconds: wire.option_schema.queue_age_max_seconds,
      retryLimitMax: wire.option_schema.retry_limit_max,
    },
  }
}

const classification = (wire: PayloadClassificationWire): PayloadClassification => ({
  code: wire.code,
  label: wire.label,
  platform: wire.platform,
  category: (wire.category === 'library' ? 'executable' : wire.category === 'binary' ? 'executable' : wire.category) as PayloadClassification['category'],
  analysisPath: wire.analysis_path,
  dynamic: wire.dynamic,
})

/** GET /api/v1/workbench/analyzers?hash=. */
export function analyzerCatalog(wire: AnalyzerCatalogWire): AnalyzerCatalog {
  return {
    classification: classification(wire.classification),
    analyzers: wire.analyzers.map((a) => ({ ...analyzerInfo(a), applicable: a.applicable, ...(a.reason ? { reason: a.reason } : {}) })),
  }
}

/** The whole registry's analyzer rows, for the results page's catalog. The
 * `applicable`/`reason` pair is per-payload and not on the bare registry. */
export function analyzerInfos(wire: AnalyzerCatalogWire[]): AnalyzerInfo[] {
  return wire.flatMap((catalog) => catalog.analyzers.map(analyzerInfo))
}

const runState = (state: string): WorkbenchRun['state'] => (['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'].includes(state) ? (state as WorkbenchRun['state']) : 'queued')

/** GET /api/v1/workbench/runs/{id} and POST .../children/{id}/{action}. */
export function workbenchRun(wire: WorkbenchRunWire): WorkbenchRun {
  const children: WorkbenchRunChild[] = wire.children.map((child) => ({
    analyzerId: analyzerId(child.analyzer_id),
    label: child.display_name,
    state: runState(child.state),
    ...(child.reason ? { reason: child.reason } : {}),
    ...(child.summary ? { summary: child.summary } : {}),
    ...(child.result_url ? { resultHref: child.result_url } : {}),
    createdAt: child.created_at,
    updatedAt: child.updated_at,
    attempts: child.attempts,
    retryable: child.retryable,
    cancelable: child.cancelable,
  }))
  return {
    id: wire.id,
    hash: wire.payload_sha256,
    payloadKind: wire.payload_kind,
    owner: wire.owner,
    label: wire.recipe_name || wire.recipe_id || wire.id,
    ...(wire.recipe_id ? { recipeId: wire.recipe_id } : {}),
    ...(wire.recipe_name ? { recipeName: wire.recipe_name } : {}),
    state: runState(wire.state),
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
    children,
  }
}

export const workbenchRunEnvelope = (wire: WorkbenchRunEnvelopeWire): WorkbenchRun => workbenchRun(wire.run)

/** GET /api/v1/workbench/runs?hash&limit. */
export function workbenchRuns(wire: WorkbenchRunListWire): WorkbenchRun[] {
  return wire.runs.map(workbenchRun)
}

/** GET /api/v1/store/workbench-runs?offset&size: the same documents
 * through the generic store, which serves the raw `_source` (and adds
 * `_doc_id`). */
export function workbenchRunStorePage(wire: { total: number; rows: Array<{ _doc_id: string } & Partial<WorkbenchRunWire>> }): { total: number; runs: WorkbenchRun[] } {
  return {
    total: wire.total,
    runs: wire.rows.flatMap((row) => (row.id && row.payload_sha256 ? [workbenchRun(row as WorkbenchRunWire)] : [])),
  }
}

/** workbench_domain.rs `WorkbenchOptions`: the three numbers the backend
 * validates, per analyzer. The page and the wire carry the same set. */
const analyzerOptions = (wire: WorkbenchOptionsWire): AnalyzerOptions => ({
  timeoutSeconds: wire.timeout_seconds,
  maxQueueAgeSeconds: wire.max_queue_age_seconds,
  retryLimit: wire.retry_limit,
})

const wireOptions = (options: AnalyzerOptions): WorkbenchOptionsWire => ({
  timeout_seconds: options.timeoutSeconds,
  max_queue_age_seconds: options.maxQueueAgeSeconds,
  retry_limit: options.retryLimit,
})

const wireAnalyzerId = (id: AnalyzerId): string => (id === 'static' ? 'deterministic' : id === 'sandbox' ? 'linux-sandbox' : id)

/** POST /api/v1/workbench/runs. Each chosen analyzer goes out with its three
 * numbers; a chosen analyzer without options is a caller bug, not a default. */
export function createWorkbenchRunBody(hash: string, analyzers: AnalyzerId[], options: Partial<Record<AnalyzerId, AnalyzerOptions>>, recipe?: { id: string; name: string; revision: number }): CreateWorkbenchRunBody {
  return {
    payload_sha256: hash,
    ...(recipe ? { recipe_id: recipe.id, recipe_revision: recipe.revision, recipe_name: recipe.name } : {}),
    analyzers: analyzers.map((id): WorkbenchSelectionWire => {
      const own = options[id]
      if (!own) throw new Error(`No options set for analyzer ${id}`)
      return { analyzer_id: wireAnalyzerId(id), options: wireOptions(own) }
    }),
  }
}

const recipeAnalyzerId = (wire: string): AnalyzerId => analyzerId(wire)

/** POST /api/v1/workbench/recipes. Each analyzer's three numbers go out as
 * they are; the scope is `personal` on the wire for anything the page calls
 * `personal`, and the backend takes owner from the forwarded actor header,
 * so a saved recipe's `owner` is not sent. */
export function saveWorkbenchRecipeBody(recipe: WorkbenchRecipe, baseRevision = recipe.revision): SaveWorkbenchRecipeBody {
  return {
    ...(recipe.id ? { id: recipe.id } : {}),
    name: recipe.name,
    description: recipe.description,
    scope: recipe.scope === 'shared' ? 'shared' : 'personal',
    analyzers: recipe.analyzers.map((a): WorkbenchSelectionWire => ({ analyzer_id: wireAnalyzerId(a.analyzerId), options: wireOptions(a.options) })),
    base_revision: baseRevision,
  }
}

/** GET /api/v1/workbench/recipes. */
export function workbenchRecipes(wire: { recipes: WorkbenchRecipe[] }): WorkbenchRecipe[] {
  return wire.recipes
}

/** The recipes the backend serves, as the page's own shape. Kept as its own
 * adapter so the recipes page reads one name rather than reaching into the
 * contract. */
export function savedWorkbenchRecipes(wire: { recipes: WorkbenchRecipeWire[] }): WorkbenchRecipe[] {
  return wire.recipes.map((recipe) => ({
    id: recipe.id,
    revision: recipe.revision,
    name: recipe.name,
    description: recipe.description,
    owner: recipe.owner,
    scope: recipe.scope === 'shared' ? 'shared' : 'personal',
    createdAt: recipe.created_at,
    analyzers: recipe.analyzers.map((a) => ({ analyzerId: recipeAnalyzerId(a.analyzer_id), options: analyzerOptions(a.options) })),
  }))
}

// ---- GPU queue and model health --------------------------------------------

/** GET /api/v1/gpu-queue. `result` (a drained job's own payload) has no
 * page field. The backend's status words are the page's own. */
export function gpuJobs(wire: GpuJobWire[]): AnalysisResult[] {
  return wire.map((job) => ({
    id: job.job_id,
    analyzer: 'workbench',
    hash: job.ref,
    file: job.ref,
    at: job.requested_at,
    summary: `${job.job_type} · ${job.model}`,
    detail: { jobId: job.job_id, jobType: job.job_type, status: job.status },
  }))
}

/** The same queue as the page's own job rows. The wire's `status` is the
 * backend's word; the page allows five, and anything else reads as queued
 * rather than inventing a state the page cannot render. `vram_mib` is
 * `estimated_vram_mib` — what the queue admits by, which is what the page
 * labels it. */
export function gpuQueue(wire: GpuJobWire[]): GpuJob[] {
  return wire.map((job) => ({
    jobId: job.job_id,
    requestedAt: job.requested_at,
    ...(job.started_at ? { startedAt: job.started_at } : {}),
    ...(job.finished_at ? { finishedAt: job.finished_at } : {}),
    ...(job.error ? { error: job.error } : {}),
    jobType: job.job_type,
    model: job.model,
    status: (['queued', 'running', 'done', 'failed', 'aborted'].includes(job.status) ? job.status : 'queued') as GpuJob['status'],
    attempts: job.attempts,
    abortRequested: job.abort_requested,
    ref: job.ref,
    vramMib: job.estimated_vram_mib,
  }))
}

/** GET /api/v1/ml-health. `ml_health.rs ModelHealth` serializes
 * snake_case (`train_samples`), the page reads camelCase. */
export function modelHealths(wire: MlHealthWire): ModelHealth[] {
  return wire.map((m) => ({
    model: m.model,
    timestamp: m.timestamp,
    accepted: m.accepted,
    reason: m.reason,
    anomalyRateNew: m.anomaly_rate_new,
    anomalyRatePrevious: m.anomaly_rate_previous,
    trainSamples: m.train_samples,
  }))
}

/** GET /api/v1/store/yara?offset&size: matched rule names per sample. */
export function yaraRuns(wire: YaraRunPageWire): AnalysisResult[] {
  return wire.rows.flatMap((row) => {
    const yara = row.yara
    if (!yara?.sha256) return []
    const matches = yara.matches ?? []
    return [
      {
        id: yara.sha256,
        analyzer: 'yara',
        hash: yara.sha256,
        file: yara.sha256.slice(0, 12),
        at: yara.scanned_at ?? '',
        summary: `${matches.length} rule${matches.length === 1 ? '' : 's'} matched`,
        matches,
        detail: { ...(yara.error ? { error: yara.error } : {}) },
      },
    ]
  })
}

/** The wire subject id, for endpoints that serve a field with no id of its
 * own (RevDeck's `revdeck` blob, CAPE's `cape` blob). */
export const analysisSubject = subject