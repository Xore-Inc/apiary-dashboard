// The payloads, analysis results and Workbench payloads the Rust tier serves
// (backend-service stores.rs, payload_detail.rs, detail.rs, artifacts.rs,
// workbench_api.rs, workbench_domain.rs, payload_kind.rs, gpu_queue.rs,
// ml_health.rs, sandbox_submit.rs, ghidra_submit.rs,
// github_analysis_submit.rs), as they arrive on the wire.
//
// Every analysis store below is served as a raw ES `_source` document, so a
// record's fields are the literal the writing worker (or the
// es-results-importer's `build_document`, which namespaces the producer's
// whole payload under its source label) put there -- not a serde struct of
// the serving crate. The field names below are read off those writers:
//
//   sandbox          sandbox/export-result.py `payload`
//   ghidra           analysis/ghidra/worker/ghidra-worker.py `result`
//   revdeck          ghidra-worker.py `_revdeck_chat` / the standalone writer
//   cape             sandbox/cape/worker/cape-worker.py `build` return
//   github_analysis  analysis/github/collect-results.py `build_result`
//   yara             analysis/yara/scanner.py `scan`
//   payloads         payload_inventory.rs `CapturedFile`
//   static-analysis  payload_detail.rs `analysis` (see the note there)
//
// Where a writer emits a key that no reading route types and no page type
// reads, the key is left out and named in the slice's gaps instead.

/** One dashboard-payload-inventory-v1 `_source`, as the payloads store and
 * GET /api/v1/payloads/{hash}.inventory serve it. `GitHubAnalysisURL` and
 * `SizeH` are writer fields with no page counterpart (gaps). */
export interface PayloadInventoryWire {
  Hash: string
  Size: number
  SizeH: string
  Mtime: string
  MtimeUTC: string
  MIME: string
  Kind: string
  KindCode: string
  Platform: string
  AnalysisPath: string
  Dynamic: boolean
  Sources: string[]
  Copies: number
  Preview: string
  PreviewTruncated: boolean
  GitHubAnalysisURL?: string
}

/** GET /api/v1/payloads?offset&size[&aggs=sources] (stores.rs `payloads`).
 * Same rows the store-page shape serves, plus the source census the
 * `?aggs=sources` query adds. */
export interface PayloadPageWire {
  total: number
  rows: Array<PayloadInventoryWire & { _doc_id: string }>
  source_buckets?: Array<{ key: string; doc_count: number }>
  source_other?: number
}

/** The dashboard-static-analysis-v1 `_source` the payload detail serves as
 * `analysis`. The Go writer's payloadStaticAnalysis fields serialize
 * Go-capitalized except the json-tagged nested structs, so `Classification`,
 * `Rules` and each `Decoded` item are lowercase. Field names below are
 * read off the index mapping (elasticsearch-setup.sh) and the reader in
 * frontend-next `payload-analysis.$hash.tsx` `buildStaticView`, which
 * deliberately accepts either spelling because the two writers disagree --
 * hence the `| snake_case` unions here too. */
export interface StaticAnalysisDocWire {
  Fingerprint: string
  Analysis?: {
    Classification?: { code: string; label: string; platform: string; category: string; analysis_path: string; dynamic: boolean } | null
    Magic?: string
    /** `Entropy` is the display string, `EntropyValue` the float (mapping). */
    Entropy?: string
    EntropyValue?: number
    MIME?: string
    ScriptType?: string
    StaticRiskScore?: number
    StaticRiskLevel?: string
    PackedLikely?: boolean
    Truncated?: boolean
    Hexdump?: string
    ASCII?: string[]
    UTF16?: string[]
    FormatInfo?: string[]
    Decoded?: Array<{ kind: string; source: string; preview: string }>
    Indicators?: string[]
    IOCs?: string[]
    Rules?: Array<{ name: string; severity: string; description: string }>
    /** The mapping writer spells it `YARA…`; the Rust struct `yara_matches`. */
    YARAMatches?: string[]
    yara_matches?: string[]
    Size?: string
    SHA256?: string
    SHA1?: string
    MD5?: string
  }
}

/** A yara-analysis-v1 `_source`: the scanner's per-sample result, namespaced
 * under `yara` by the importer. `size`/`mtime_ns` are scanner bookkeeping. */
export interface YaraDocWire {
  yara: {
    sha256?: string
    size?: number
    mtime_ns?: number
    scanned_at?: string
    matches?: string[]
    source?: string
    error?: string
  }
}

/** GET /api/v1/payloads/{hash} (payload_detail.rs `PayloadDetail`). */
export interface PayloadDetailWire {
  hash: string
  inventory: PayloadInventoryWire | null
  analysis: StaticAnalysisDocWire | null
  yara: YaraDocWire[]
  size_bytes: number
  hex_preview: string[]
}

/** POST /api/v1/payloads/{hash}/report, 201 (reports_api
 * `generate_payload_report`): `{id, generated}`, where `generated` is the
 * same stored record the generated-reports store serves. */
export interface PayloadReportWire {
  id: string
  generated: {
    id: string
    definition_id?: string
    name: string
    template: string
    theme: string
    title: string
    size_bytes: number
    created_at: string
    origin: string
  }
}

/** One sandbox-analysis-v1 `_source` (export-result.py `payload`). */
export interface SandboxRunWire {
  version?: number
  job: string
  sha256: string
  capture_name?: string
  source?: string
  requested_at: string
  started_at: string
  completed_at: string
  exit_status: string
  run_status?: string
  guest_started?: boolean
  failure_reason?: string
  timeout_reason?: string
  duration_seconds: number
  risk_score: number
  risk_level: string
  network?: string
  file_type?: string
  platform: string
  analysis_path?: string
  execution_mode?: string
  classification?: {
    code: string
    label: string
    platform: string
    category: string
    analysis_path: string
    dynamic: boolean
  }
  hashes?: { md5: string; sha1: string; sha256: string }
  stdout?: string
  stderr?: string
  runner_log?: string
  changed_files?: string[]
  sockets_before?: string[]
  sockets_after?: string[]
  top_syscalls?: Array<{ name: string; count: number }>
  network_summary?: unknown
  iocs?: string[]
  windows_forensics?: unknown
  artifacts?: Record<string, string | string[]>
  techniques?: Array<{ id: string; name: string; evidence: string }>
  truncated?: boolean
}

/** GET /api/v1/sandbox/{job} (detail.rs `sandbox_run`) and
 * GET /api/v1/store/sandbox-runs: the raw `_source`, which es_importer.rs's
 * `build_document` nests under the `sandbox` source label, plus the `_doc_id`
 * one_doc attaches. The Windows and GHOSTS sandboxes share the label, so one
 * row type covers all three. */
export interface SandboxRunDetailWire {
  sandbox: SandboxRunWire
  _doc_id?: string
}

/** GET /api/v1/store/sandbox-runs?offset&size: raw `_source` rows. */
export interface SandboxRunPageWire {
  total: number
  rows: SandboxRunDetailWire[]
}

/** GET /api/v1/sandbox/golden-image-status (sandbox_submit
 * `golden_image_status`): the host timer's own JSON with `configured`
 * stamped on. `configured: false` is the whole body when the timer has not
 * written, or the directory is unset. */
export interface GoldenImageStatusWire {
  configured: boolean
  BuiltAt?: string
  Checksum?: string
  [key: string]: unknown
}

/** GET /api/v1/sandbox/vnc (sandbox_submit `vnc_status`). A 404 is the
 * normal answer: no bridge configured, or nothing running. */
export interface SandboxVncStatusWire {
  sha256: string
  bridge_ws: string
}

/** POST /api/v1/sandbox/submit body (SubmitBody) and its 200 response. */
export interface SandboxSubmitBody {
  hash: string
}

export interface SandboxSubmitWire {
  target: 'windows' | 'linux'
  queued: true
}

/** One ghidra-analysis-v1 `_source` (ghidra-worker.py `result`). */
export interface GhidraRunWire {
  version?: number
  sha256: string
  requested_at: string
  started_at: string
  completed_at: string
  exit_status: string
  analyzer_version?: string
  artifact_schema_version?: string
  service_sha256?: string
  functions: GhidraFunctionWire[]
  functions_truncated?: boolean
  functions_deepened?: number
  functions_deepened_truncated?: boolean
  strings?: string[]
  imports?: Array<{ name: string; count?: number } | string>
  findcrypt?: Array<{ name: string; address: string; algorithm?: string }>
  call_graph_svg?: string | null
  types?: Array<{ name: string; kind: string; size: number; fields: Array<{ name: string; type: string; offset: number; size: number }> }>
  globals?: Array<{ address: string; name: string; type: string; size: number }>
  annotations?: { revision?: number; entries?: Array<{ address: string; displayName: string; comment: string; tags: string[] }> } | null
  memory_map?: Array<{ name: string; start: string; end: string; size: number; permissions: string; hex: string; ascii: string }>
  ai_triage?: { summary?: string; model?: string; confidence?: string; family_guess?: string; behaviors?: string[]; risk_level?: string; workflow?: string } | null
  fuzzy_hashes?: { ssdeep?: string; tlsh?: string; imphash?: string } | null
  lief?: {
    format?: string
    architecture?: string
    entrypoint?: string
    is_pie?: boolean
    stripped?: boolean
    is_dll?: boolean | null
    compile_timestamp?: string | null
    section_count?: number
    libraries?: string[]
  } | null
  capa?: { capabilities?: Array<{ name: string; namespace: string; matches: number; attck?: string[] }>; attack?: Array<{ id: string; tactic: string; technique: string }>; mbc?: Array<{ id: string; objective: string; behavior: string }> } | null
  floss?: { strings?: Record<string, string[] | undefined>; total?: number; truncated?: boolean } | null
  revdeck?: RevDeckRunWire | null
  revdeck_chat_threads?: unknown
  revdeck_recovery?: unknown
  report_pdf?: string | null
  /** Folded in by detail.rs `ghidra_run`, so the page keeps one hydrate. */
  ioc_correlation?: IocCorrelationWire
}

/** One recovered Ghidra function. `callers`/`callees` are the cross-
 * reference entries ({addr, name}); the deepening pass fills them only for
 * the functions it covered. */
export interface GhidraFunctionWire {
  name: string
  address: string
  size?: number
  callers?: Array<{ addr: string; name: string }>
  callees?: Array<{ addr: string; name: string }>
  signature?: string
  decompiled?: string
}

/** detail.rs `IocCorrelation`, attached to the Ghidra run as
 * `ioc_correlation`. `is_empty` and `has_floss_data` have no page field. */
export interface IocCorrelationWire {
  has_sandbox_run: boolean
  has_floss_data: boolean
  is_empty: boolean
  ips: IocKindCorrelationWire
  domains: IocKindCorrelationWire
  urls: IocKindCorrelationWire
  unc_paths: IocKindCorrelationWire
}

export interface IocKindCorrelationWire {
  floss_only: string[]
  sandbox_static_only: string[]
  confirmed_at_runtime: string[]
}

/** GET /api/v1/ghidra/{sha} (detail.rs `ghidra_run`) and
 * GET /api/v1/store/ghidra-runs: the raw `_source`, which es_importer.rs's
 * `build_document` nests under the `ghidra` source label, plus `_doc_id` and
 * the correlation folded in at the DOC level (not inside the label —
 * `ghidra_run` writes `doc["ioc_correlation"]` beside the nested result, and
 * frontend-next's ghidra.$sha.tsx:1103 reads it from there). */
export interface GhidraRunDetailWire {
  ghidra: GhidraRunWire
  ioc_correlation?: IocCorrelationWire
  _doc_id?: string
}

/** GET /api/v1/store/ghidra-runs?offset&size: raw `_source` rows. */
export interface GhidraRunPageWire {
  total: number
  rows: GhidraRunDetailWire[]
}

/** GET /api/v1/ghidra-callgraph/{sha} (detail.rs `build_ghidra_callgraph`).
 * Built from the same per-function xrefs as the static graphviz SVG, capped
 * at 200 nodes. */
export interface GhidraCallGraphWire {
  nodes: Array<{ id: string; label: string; kind: 'function' | 'leaf' }>
  edges: Array<{ source: string; target: string }>
  truncated: boolean
}

/** POST /api/v1/ghidra/submit body (SubmitBody) and its 200 response. */
export interface GhidraSubmitBody {
  hash: string
}

export interface GhidraSubmitWire {
  queued: true
}

/** The revdeck-analysis-v1 `_source`'s `revdeck` field. The importer
 * (es_importer.rs `build_document`) nests the whole producer payload under
 * the `revdeck` source label, and detail.rs `revdeck_run` serves that same
 * nested field alone — so `sha`/`at` are not on the wire for this endpoint
 * and the adapter takes the subject sha. */
export interface RevDeckRunWire {
  workflow: string
  status: 'complete' | 'max_turns' | string
  answer: string
  steps?: Array<{ tool: string; input: string; output: string }> | null
  tool_calls?: number
  citations?: { valid: string[]; invalid: string[] } | null
  warnings?: string[]
  error?: string
}

/** GET /api/v1/store/revdeck?offset&size: raw `_source` rows. The importer's
 * `sha256` is on the doc (and under `file.hash`), never inside the nested
 * `revdeck` payload, so a row's subject comes from the side of the doc. */
export interface RevDeckRunPageWire {
  total: number
  rows: Array<{
    _doc_id: string
    sha256?: string
    file?: { hash?: { sha256?: string } }
    requested_at?: string
    completed_at?: string
    exit_status?: string
    revdeck?: RevDeckRunWire | null
  }>
}

/** One cape-analysis-v1 `_source` (cape-worker.py). The handler strips
 * `report` (CAPE's own unbounded report) and adds `report_summary`
 * (detail.rs `summarize_cape_report`) — but only on the DETAIL endpoint;
 * `GET /api/v1/cape/{sha}/raw` serves the doc's `cape` field verbatim, so a
 * raw read has no `report_summary` at all. */
export interface CapeRunWire {
  version?: number
  sha256: string
  requested_at: string
  started_at: string
  completed_at: string
  exit_status: string
  /** null on the failure envelope (cape-worker.py `failure_result`), which
   * is written when CAPE never accepted the sample. */
  task_id: number | null
  cape_status: string | null
  route?: string
  score?: number | null
  category?: string | null
  signatures: Array<{ name: string; description: string; severity: number | null }>
  error?: string
  report_summary?: {
    machine?: unknown
    package?: string
    route?: string
    timeout?: number
    duration?: number
    malscore?: number
    malstatus?: string
    summary?: Record<string, unknown>
    summary_keys?: string[]
    processes?: Array<{ process_id: number; process_name: string; parent_id: number; module_path: string; first_seen: string; call_count: number }>
    total_calls?: number
    payloads?: unknown[]
    configs?: unknown
    debug_log?: unknown
    debug_errors?: unknown[]
  } | null
}

/** GET /api/v1/store/cape?offset&size: raw `_source` rows, still nested under
 * the importer's `cape` source label, and served WITHOUT the summary
 * reduction. */
export interface CapeRunPageWire {
  total: number
  rows: Array<{ _doc_id: string; cape?: CapeRunWire }>
}

/** One github-analysis-v1 `_source` (collect-results.py `build_result`).
 * `requested_by` and `view_url` are added by detail.rs
 * `github_analysis_run`, so only the detail endpoint carries them. */
export interface GithubAnalysisWire {
  version?: number
  sha256: string
  requested_at: string
  started_at: string
  completed_at: string
  exit_status: string
  commit: string
  report_commit?: string
  run_id?: number | string | null
  run_url?: string
  sample_path?: string
  family?: string
  verdict?: { malicious: number; suspicious: number; total: number; level: 'clean' | 'low' | 'medium' | 'high' }
  scanners: Array<{ source: string; ok: boolean; positives: number; total: number; suspicious: boolean; permalink: string; error: string }>
  yara_auto_rules?: string[]
  report_pdf?: string | null
  error?: string
  requested_by?: string
  view_url?: string | null
}

/** GET /api/v1/store/github-analysis?offset&size: raw `_source` rows, still
 * nested under the `github_analysis` source label and without the two
 * doc-computed fields. The importer puts `file.hash.sha256`, `exit_status`
 * and `@timestamp` beside the label, so a row without a nested result has
 * no sha to link. */
export interface GithubAnalysisPageWire {
  total: number
  rows: Array<{ github_analysis: GithubAnalysisWire; _doc_id: string; file?: { hash?: { sha256?: string } } }>
}

/** POST /api/v1/github-analysis/submit body (SubmitBody). `confirm` must
 * be exactly "publish" or the backend refuses and audits the attempt; the
 * actor fields are added by the dashboard's server fn. */
export interface GithubAnalysisSubmitBody {
  hash: string
  confirm: 'publish'
  actor_subject?: string
  actor_username?: string
}

export interface GithubAnalysisSubmitWire {
  queued: true
}

/** GET /api/v1/artifacts/{kind}/{key} (artifacts.rs `list`): one row per
 * filename, `data_base64` excluded, chunked artifacts collapsed. */
export interface ArtifactListWire {
  rows: Array<{
    filename: string
    kind: string
    content_type: string
    size_bytes: number
    imported_at: string
  }>
}

/** GET /api/v1/artifacts/{kind}/{key}/{filename} streams the bytes with the
 * stored content type, not JSON. `kind` is `ghidra` (key = sha256) or
 * `sandbox` (key = job); anything else is a 404. */
export interface ArtifactDownloadMetaWire {
  kind: 'ghidra' | 'sandbox'
  contentType: string
}

/** payload_kind.rs `PayloadClassification`, as GET
 * /api/v1/workbench/analyzers returns it under `classification`. */
export interface PayloadClassificationWire {
  code: string
  label: string
  platform: string
  category: string
  analysis_path: string
  dynamic: boolean
}

/** workbench_domain.rs `WorkbenchOptionSchema`: the bounds a recipe's
 * per-analyzer options are validated against. */
export interface WorkbenchOptionSchemaWire {
  timeout_min_seconds: number
  timeout_max_seconds: number
  queue_age_min_seconds: number
  queue_age_max_seconds: number
  retry_limit_max: number
}

/** workbench_domain.rs `WorkbenchOptions` -- the whole per-analyzer option
 * set. Three numbers, on every analyzer. */
export interface WorkbenchOptionsWire {
  timeout_seconds: number
  max_queue_age_seconds: number
  retry_limit: number
}

/** workbench_domain.rs `WorkbenchAnalyzer`. `availability` is
 * configured | unconfigured | unavailable (not the page's three words);
 * `concurrency`, `result_link_shape` and `available` have no page field. */
export interface WorkbenchAnalyzerWire {
  id: string
  display_name: string
  description: string
  accepted_kinds: string[]
  availability: 'configured' | 'unconfigured' | 'unavailable' | string
  available: boolean
  applicable: boolean
  reason: string
  result_link_shape: string
  required_role: 'admin' | 'viewer' | string
  confirmation: 'none' | 'detonation' | string
  concurrency_class: string
  local_only: boolean
  externally_publishing: boolean
  detonates: boolean
  gpu_consuming: boolean
  requires_opt_in: boolean
  default_options: WorkbenchOptionsWire
  option_schema: WorkbenchOptionSchemaWire
}

/** GET /api/v1/workbench/analyzers?hash= */
export interface AnalyzerCatalogWire {
  classification: PayloadClassificationWire
  analyzers: WorkbenchAnalyzerWire[]
}

/** workbench_domain.rs `WorkbenchSelection` -- one analyzer and its options,
 * the unit both the run and the recipe bodies are built from. */
export interface WorkbenchSelectionWire {
  analyzer_id: string
  options: WorkbenchOptionsWire
}

/** workbench_domain.rs `WorkbenchChild`. Empty-string fields are skipped in
 * serialization (`skip_serializing_if`), so they arrive only when set. */
export interface WorkbenchChildWire {
  analyzer_id: string
  display_name: string
  state: string
  reason?: string
  summary?: string
  result_url?: string
  target_hash?: string
  options: WorkbenchOptionsWire
  created_at: string
  updated_at: string
  deadline: string
  queue_deadline: string
  attempts: number
  retryable: boolean
  cancelable: boolean
  detonates: boolean
  gpu_consuming: boolean
  local_only: boolean
  stale: boolean
}

/** workbench_domain.rs `WorkbenchRun`. */
export interface WorkbenchRunWire {
  schema_version: number
  id: string
  payload_sha256: string
  payload_kind: string
  owner: string
  recipe_id?: string
  recipe_revision: number
  recipe_name?: string
  recipe_snapshot?: WorkbenchSelectionWire[]
  idempotency_key: string
  state: string
  created_at: string
  updated_at: string
  children: WorkbenchChildWire[]
}

/** GET /api/v1/workbench/runs?hash&limit -- the calling operator's runs. */
export interface WorkbenchRunListWire {
  runs: WorkbenchRunWire[]
}

/** GET /api/v1/workbench/runs/{id} and POST
 * /api/v1/workbench/runs/{id}/children/{analyzer_id}/{action}. */
export interface WorkbenchRunEnvelopeWire {
  run: WorkbenchRunWire
}

/** POST /api/v1/workbench/runs (CreateRunBody) and its 200 response. The
 * owner is taken from the forwarded `X-Actor-Username` header, not the body;
 * a body naming another operator is parsed and dropped. */
export interface CreateWorkbenchRunBody {
  payload_sha256: string
  recipe_id?: string
  recipe_revision?: number
  recipe_name?: string
  analyzers: WorkbenchSelectionWire[]
}

export interface CreateWorkbenchRunWire {
  run: WorkbenchRunWire
  reused: boolean
}

/** workbench_domain.rs `WorkbenchRecipe`. */
export interface WorkbenchRecipeWire {
  schema_version: number
  id: string
  revision: number
  name: string
  description: string
  owner: string
  scope: string
  created_at: string
  analyzers: WorkbenchSelectionWire[]
}

/** GET /api/v1/workbench/recipes */
export interface WorkbenchRecipeListWire {
  recipes: WorkbenchRecipeWire[]
}

/** POST /api/v1/workbench/recipes (SaveRecipeBody) and its 200 response.
 * `base_revision` is the optimistic-lock check: a mismatch is a 409. */
export interface SaveWorkbenchRecipeBody {
  id?: string
  name: string
  description?: string
  scope: string
  analyzers: WorkbenchSelectionWire[]
  base_revision?: number
}

export interface SaveWorkbenchRecipeWire {
  recipe: WorkbenchRecipeWire
}

/** gpu_queue.rs `GpuJob`. `started_at`/`finished_at`/`error` are plain
 * strings ("" when unset) and `result` is free JSON -- a drained
 * vault-rag job's `{answer, citations}` -- with no page field. */
export interface GpuJobWire {
  job_id: string
  job_type: string
  ref: string
  model: string
  estimated_vram_mib: number
  status: string
  requested_at: string
  started_at: string
  finished_at: string
  abort_requested: boolean
  error: string
  attempts: number
  result: unknown
}

/** GET /api/v1/gpu-queue */
export type GpuQueueWire = GpuJobWire[]

/** POST /api/v1/gpu-queue/{job_id}/abort. The backend only flags the job;
 * the drainer moves it to `aborted` on its next tick, and setting the flag
 * on a running or finished job is a documented no-op. */
export interface GpuAbortWire {
  ok: true
  job_id: string
  abort_requested: true
}

/** ml_health.rs `ModelHealth`: one row per model, its newest retrain. */
export interface ModelHealthWire {
  model: string
  timestamp: string
  accepted: boolean
  reason: string
  anomaly_rate_new: number
  anomaly_rate_previous: number
  train_samples: number
}

/** GET /api/v1/ml-health */
export type MlHealthWire = ModelHealthWire[]

/** GET /api/v1/store/yara?offset&size: raw `_source` rows. */
export interface YaraRunPageWire {
  total: number
  rows: Array<{ _doc_id: string; yara?: YaraDocWire['yara'] }>
}

/** GET /api/v1/store/static-analysis?offset&size: raw `_source` rows. */
export interface StaticAnalysisPageWire {
  total: number
  rows: Array<{ _doc_id: string } & StaticAnalysisDocWire>
}

/** GET /api/v1/store/workbench-runs?offset&size: raw `_source` rows. */
export interface WorkbenchRunPageWire {
  total: number
  rows: Array<{ _doc_id: string } & Partial<WorkbenchRunWire>>
}