// Evidence slice adapters: one realistic wire fixture per endpoint, mapped to
// the page types the payload/analysis pages already render.
import { describe, expect, it } from 'vitest'
import type { CapeRunWire, GhidraRunDetailWire, GhidraRunWire, GithubAnalysisWire, RevDeckRunWire, SandboxRunDetailWire, SandboxRunWire } from '../contracts/evidence'
import {
  analyzerCatalog,
  artifactRows,
  capeRuns,
  capturedPayloads,
  createWorkbenchRunBody,
  ghidraCallGraph,
  ghidraRunPage,
  githubAnalysis,
  goldenImageStatus,
  gpuJobs,
  modelHealths,
  payloadAnalysis,
  revDeckRuns,
  sandboxRun,
  sandboxVerdict,
  workbenchRun,
  yaraRuns,
} from './evidence'

const optionSchema = { timeout_min_seconds: 30, timeout_max_seconds: 3600, queue_age_min_seconds: 60, queue_age_max_seconds: 86400, retry_limit_max: 3 }

const inventory = {
  _doc_id: 'inv-1',
  Hash: 'a'.repeat(64),
  Size: 18_432,
  SizeH: '4.50 KiB',
  Mtime: '2026-10-01 09:12:44',
  MtimeUTC: '2026-10-01T09:12:44Z',
  MIME: 'application/x-dosexec',
  Kind: 'PE32',
  KindCode: 'pe32',
  Platform: 'windows',
  AnalysisPath: 'windows-sandbox',
  Dynamic: true,
  Sources: ['cowrie', 'suricata'],
  Copies: 2,
  Preview: 'MZ\x90\x00',
  PreviewTruncated: false,
  GitHubAnalysisURL: 'https://github.test/x/y',
}

const detail = {
  hash: 'b'.repeat(64),
  inventory: null,
  analysis: null,
  yara: [],
  size_bytes: 0,
  hex_preview: [],
}

const staticDoc = {
  Fingerprint: 'fp-1',
  Analysis: {
    Classification: { code: 'pe32', label: 'Windows PE', platform: 'windows', category: 'binary', analysis_path: 'windows-sandbox', dynamic: true },
    Magic: 'Windows PE/DOS executable',
    MIME: 'application/x-dosexec',
    StaticRiskScore: 82,
    StaticRiskLevel: 'high',
    PackedLikely: true,
    Entropy: '7.81',
    Hexdump: '00000000  4d 5a 90 00  |MZ..|',
    Indicators: ['mimikatz', 'CreateRemoteThread'],
    IOCs: ['198.51.100.4', 'cnc.example.test', '/tmp/.x', 'http://cnc.example.test/b'],
    Decoded: [{ kind: 'base64', source: 'ASCII[128..196]', preview: 'TVqQAAMAAAAEAAAA' }],
    SHA256: 'c'.repeat(64),
    MD5: 'd'.repeat(32),
    SHA1: 'e'.repeat(40),
  },
}

const sandboxWire = {
  job: 'sbx-8812',
  sha256: 'f'.repeat(64),
  requested_at: '2026-10-01T09:00:00Z',
  started_at: '2026-10-01T09:00:05Z',
  completed_at: '2026-10-01T09:04:31Z',
  exit_status: 'ok',
  run_status: 'completed',
  duration_seconds: 266,
  risk_score: 78,
  risk_level: 'high',
  platform: 'linux-x86_64',
  changed_files: ['/etc/cron.d/kworker', '/tmp/.x'],
  sockets_before: [],
  sockets_after: ['198.51.100.4:4444'],
  top_syscalls: [{ name: 'socket', count: 12 }, { name: 'execve', count: 3 }],
  iocs: ['198.51.100.4', 'cnc.example.test'],
  techniques: [{ id: 'T1071.001', name: 'Web protocols', evidence: 'HTTP GET to /b' }],
  stdout: 'started\n',
  stderr: '',
} satisfies SandboxRunWire

// The importer nests the payload under the producer's source label, so every
// row the store or a detail endpoint serves carries it under `sandbox`.
const sandboxDetail = { sandbox: sandboxWire } satisfies SandboxRunDetailWire

const ghidraWire = {
  sha256: '1'.repeat(64),
  requested_at: '2026-10-01T10:00:00Z',
  started_at: '2026-10-01T10:00:02Z',
  completed_at: '2026-10-01T10:12:00Z',
  exit_status: 'ok',
  functions: [
    {
      name: 'main',
      address: '0x1400',
      size: 412,
      signature: 'int main(int, char **)',
      callers: [],
      callees: [{ addr: '0x1500', name: 'connect' }],
      decompiled: 'void main() { connect(); }',
    },
    { name: 'connect', address: '0x1500', size: 96, callers: [{ addr: '0x1400', name: 'main' }], callees: [] },
  ],
  imports: [{ name: 'ws2_32.dll', count: 2 }],
  strings: ['cmd.exe', '/c whoami'],
  lief: { format: 'PE', architecture: 'x86:LE:64', entrypoint: '0x1400', is_pie: false, stripped: true, is_dll: false, compile_timestamp: '2024-03-01T00:00:00Z', section_count: 6, libraries: ['ws2_32.dll'] },
  capa: { capabilities: [{ name: 'create_remote_thread', namespace: 'host/process/thread/create', matches: 1, attck: ['T1055'] }], attack: [{ id: 'T1055', tactic: 'defense-evasion', technique: 'Process Injection' }], mbc: [] },
  floss: { strings: { decoded: ['AAA'], stack: [], tight: ['BBB'], static: ['CCC'] }, total: 3, truncated: true },
  fuzzy_hashes: { ssdeep: '3:AXGBicFlg', tlsh: 'T1abc', imphash: '0'.repeat(32) },
  types: [{ name: 'conn', kind: 'class', size: 32, fields: [{ name: 'fd', type: 'int', offset: 0, size: 4 }] }],
  ai_triage: { summary: 'C2 beacon', model: 'qwen2.5-coder:14b', confidence: 'high', family_guess: 'Generic Downloader', behaviors: ['beacon'] },
} satisfies GhidraRunWire

// `ioc_correlation` is written by detail.rs BESIDE the label, not inside it.
const emptyKinds = { floss_only: [], sandbox_static_only: [], confirmed_at_runtime: [] }
const ghidraDetail = { ghidra: ghidraWire, ioc_correlation: { has_sandbox_run: true, has_floss_data: true, is_empty: false, ips: { floss_only: ['198.51.100.4'], sandbox_static_only: [], confirmed_at_runtime: ['198.51.100.4'] }, domains: emptyKinds, urls: emptyKinds, unc_paths: emptyKinds } } satisfies GhidraRunDetailWire

const githubWire = {
  sha256: '2'.repeat(64),
  requested_at: '2026-10-01T11:00:00Z',
  started_at: '2026-10-01T11:00:01Z',
  completed_at: '2026-10-01T11:06:00Z',
  exit_status: 'ok',
  commit: 'a1b2c3d',
  run_url: 'https://github.test/org/repo/actions/runs/99',
  sample_path: 'samples/payload.bin',
  family: 'Generic Downloader',
  verdict: { malicious: 3, suspicious: 1, total: 12, level: 'high' },
  scanners: [
    { source: 'clamav', ok: true, positives: 2, total: 1, suspicious: false, permalink: 'https://scan.test/1', error: '' },
    { source: 'yara', ok: true, positives: 1, total: 1, suspicious: true, permalink: '', error: '' },
    { source: 'vt', ok: false, positives: 0, total: 0, suspicious: false, permalink: '', error: 'rate limited' },
  ],
  yara_auto_rules: ['loader_gen'],
  report_pdf: 'reports/payload.pdf',
  view_url: 'https://raw.githubusercontent.test/org/repo/main/reports/payload.pdf',
  requested_by: 'xore',
} satisfies GithubAnalysisWire

describe('evidence adapters', () => {
  it('maps GET /payloads, with and without the source census', () => {
    const withAggs = capturedPayloads({ total: 1, rows: [inventory], source_buckets: [{ key: 'cowrie', doc_count: 7 }] })
    expect(withAggs.payloads[0]).toEqual({ hash: 'a'.repeat(64), sources: ['cowrie', 'suricata'], kind: 'PE32', platform: 'windows', mime: 'application/x-dosexec', sizeBytes: 18_432, copies: 2, dynamic: true, preview: 'MZ\x90\x00', capturedAt: '2026-10-01T09:12:44Z' })
    expect(withAggs.sources).toEqual([{ id: 'cowrie', label: 'cowrie', count: 7 }])
    // Without ?aggs=sources there are no buckets, so the page has no census.
    expect(capturedPayloads({ total: 1, rows: [inventory] }).sources).toEqual([])
  })

  it('maps GET /payloads/{hash}, classifying bare IOC strings by shape', () => {
    const analysis = payloadAnalysis({ ...detail, hash: 'b'.repeat(64), analysis: staticDoc }, {} as never, 82)
    expect(analysis.iocs).toEqual([
      { id: 'ioc-0', kind: 'ip', value: '198.51.100.4' },
      { id: 'ioc-1', kind: 'domain', value: 'cnc.example.test' },
      { id: 'ioc-2', kind: 'path', value: '/tmp/.x' },
      { id: 'ioc-3', kind: 'url', value: 'http://cnc.example.test/b' },
    ])
    expect(analysis.hashes).toEqual({ md5: 'd'.repeat(32), sha1: 'e'.repeat(40), sha256: 'c'.repeat(64), ssdeep: '', tlsh: '' })
    expect(analysis.classification).toBe('Windows PE')
    expect(analysis.packingLikelihood).toBe(80)
    expect(analysis.decoded).toEqual([{ encoding: 'ASCII[128..196]', value: 'TVqQAAMAAAAEAAAA' }])
  })

  it('maps GET /payloads/{hash} with no analysis document at all', () => {
    const analysis = payloadAnalysis({ ...detail, hash: 'b'.repeat(64), hex_preview: ['00000000  4d 5a  |MZ|'] }, {} as never, 0)
    expect(analysis).toMatchObject({ fileType: '', packingLikelihood: 5, yara: [], iocs: [], strings: [], decoded: [], sections: [], ghidra: false })
    expect('classification' in analysis).toBe(false)
    // ssdeep/tlsh and sections have no field on this index (gap).
    expect(analysis.hashes.ssdeep).toBe('')
    expect(analysis.preview).toBe('00000000  4d 5a  |MZ|')
  })

  it('maps GET /sandbox/{job} and /store/sandbox-runs, keeping the risk verdict', () => {
    const run = sandboxRun(sandboxDetail)
    expect(sandboxVerdict(78)).toBe('malicious')
    expect(run).toMatchObject({ job: 'sbx-8812', hash: 'f'.repeat(64), at: '2026-10-01T09:04:31Z', verdict: 'malicious', risk: 78, durationSeconds: 266 })
    expect(run.changedPaths).toEqual(['/etc/cron.d/kworker', '/tmp/.x'])
    expect(run.syscalls).toEqual([{ id: 'socket', label: 'socket', count: 12 }, { id: 'execve', label: 'execve', count: 3 }])
    expect(run.route.name).toBe('linux-qemu')
    // logs/exports/network are empty: the worker writes raw text, not these fields.
    expect(run.logs.domainState).toBe('')
    expect(run.exported).toEqual([])
  })

  it('reads a Windows sandbox run off the same row type', () => {
    expect(sandboxRun({ sandbox: { ...sandboxWire, platform: 'windows-kvm' } }).route.name).toBe('windows-kvm')
  })

  it('maps GET /sandbox/golden-image-status, absent when unconfigured', () => {
    expect(goldenImageStatus({ configured: false })).toBeUndefined()
    expect(goldenImageStatus({ configured: true, path: '/var/dockge/sandbox/golden-images/win11-analysis.qcow2', built_at: '2026-09-01T00:00:00Z', age_days: 42, checksum_written: true, checksum_verified: false, stale_monthly: true, stale_iso_eval: false, checked_at: '2026-10-12T09:00:00Z' })).toEqual({ builtAt: '2026-09-01T00:00:00Z', ageDays: 42, checksumWritten: true, checksumVerified: false, staleMonthly: true, staleIsoEval: false, checkedAt: '2026-10-12T09:00:00Z' })
  })

  it('reports a missing golden image as the writer wrote it', () => {
    expect(goldenImageStatus({ configured: true, error: 'golden image not found', path: '/var/dockge/sandbox/golden-images/win11-analysis.qcow2' })).toMatchObject({ builtAt: '', ageDays: 0, error: 'golden image not found' })
  })

  it('maps GET /ghidra/{sha}, narrowing a free-form type kind to the page three', () => {
    const [analysis] = ghidraRunPage({ total: 1, rows: [ghidraDetail] }).runs
    expect(analysis.run.exitStatus).toBe('ok')
    expect(analysis.functionsTotal).toBe(2)
    expect(analysis.functions[0]).toMatchObject({ name: 'main', calls: 1, callers: [], callees: ['connect'] })
    expect(analysis.lief).toMatchObject({ format: 'PE', architecture: 'x86:LE:64', sectionCount: 6, libraries: ['ws2_32.dll'] })
    expect(analysis.capa[0]).toEqual({ capability: 'create_remote_thread', namespace: 'host/process/thread/create', matches: 1, attck: 'T1055' })
    expect(analysis.floss.totals).toEqual({ decoded: 1, stack: 0, tight: 1, static: 1 })
    expect(analysis.types).toEqual([{ name: 'conn', kind: 'typedef', size: 32, fields: [{ name: 'fd', type: 'int', offset: 0, size: 4 }] }])
    // cryptoConstants has no algorithm name on the wire.
    expect(analysis.aiTriage.confidence).toBe('high')
  })

  it('maps GET /ghidra-callgraph/{sha} as-is, truncated flag included', () => {
    const wire = { nodes: [{ id: '0x1400', label: 'main', kind: 'function' as const }], edges: [{ source: '0x1400', target: '0x1500' }], truncated: true }
    expect(ghidraCallGraph(wire)).toEqual(wire)
  })

  it('maps GET /revdeck and /store/revdeck, taking the subject sha from the row', () => {
    const revdeck: RevDeckRunWire = { status: 'complete', answer: 'It beaconed.', steps: [{ tool: 'decompile', input: 'main', output: '…' }], citations: { valid: ['a', 'b'], invalid: ['c'] }, workflow: 'revdeck-v1' }
    const [run] = revDeckRuns({ total: 1, rows: [{ _doc_id: 'rd-1', revdeck, sha256: '9'.repeat(64) }] })
    expect(run).toMatchObject({ sha: '9'.repeat(64), status: 'completed', verdict: '2 of 3 citations valid', summary: 'It beaconed.', workflow: 'revdeck-v1', transcript: [] })
  })

  it('maps GET /cape and /store/cape, dropping rows the importer gave no summary', () => {
    const doc = { sha256: '3'.repeat(64), requested_at: '2026-10-01T11:50:00Z', started_at: '2026-10-01T11:50:01Z', completed_at: '2026-10-01T12:00:00Z', exit_status: 'ok', cape_status: 'reported', score: 9.1, task_id: 8812, signatures: [{ name: 'anti_vm', severity: 3, description: 'CPUID check' }], report_summary: { malscore: 9.1, malstatus: 'Malicious', total_calls: 412, summary_keys: ['behavior', 'network'], payloads: ['dump-1'], debug_errors: [], processes: [{ process_id: 1200, process_name: 'powershell.exe', parent_id: 812, module_path: 'C:\\tmp\\p.exe', first_seen: '2026-10-01T11:55:12Z', call_count: 14 }] } } satisfies CapeRunWire
    const runs = capeRuns({ total: 2, rows: [{ _doc_id: 'a', cape: doc }, { _doc_id: 'b' }] })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ sha: '3'.repeat(64), status: 'reported', malscore: 9.1, malstatus: 'Malicious', taskId: 8812, capeStatus: 'reported', totalCalls: 412, sections: ['behavior', 'network'], dumps: ['dump-1'] })
    expect(runs[0].processes).toEqual([{ pid: 1200, name: 'powershell.exe', commandLine: 'C:\\tmp\\p.exe' }])
  })

  it('keeps a null task and status for a failed submission instead of printing task 0', () => {
    const failed = { sha256: '5'.repeat(64), requested_at: '2026-10-01T11:50:00Z', started_at: '2026-10-01T11:50:01Z', completed_at: '2026-10-01T11:50:02Z', exit_status: 'error', task_id: null, cape_status: null, error: 'cape submit refused', signatures: [] } satisfies CapeRunWire
    const [run] = capeRuns({ total: 1, rows: [{ _doc_id: 'f', cape: failed }] })
    expect(run).toMatchObject({ sha: '5'.repeat(64), status: 'failed_analysis', taskId: null, capeStatus: null })
  })

  it('maps report_summary.package onto the run, and leaves it off when the report has none', () => {
    const base = { sha256: '3'.repeat(64), requested_at: '2026-10-01T11:50:00Z', started_at: '2026-10-01T11:50:01Z', completed_at: '2026-10-01T12:00:00Z', exit_status: 'ok', cape_status: 'reported', task_id: 8812, signatures: [] }
    const [withPackage, withoutPackage] = capeRuns({
      total: 2,
      rows: [
        { _doc_id: 'a', cape: { ...base, report_summary: { package: 'dll', malscore: 4 } } satisfies CapeRunWire },
        { _doc_id: 'b', cape: { ...base, sha256: '4'.repeat(64), report_summary: { malscore: 4 } } satisfies CapeRunWire },
      ],
    })
    expect(withPackage.package).toBe('dll')
    expect(withoutPackage).not.toHaveProperty('package')
  })

  it('maps GET /github-analysis/{sha}, reading one scanner failure as undetected', () => {
    const run = githubAnalysis(githubWire)
    expect(run.status).toBe('published')
    expect(run).toMatchObject({ sha: '2'.repeat(64), detections: 3, engines: 12, risk: 'high', family: 'Generic Downloader', yaraRules: ['loader_gen'], repoPath: 'samples/payload.bin', requestedBy: 'xore', reportPdf: 'reports/payload.pdf' })
    expect(run.results).toEqual([
      { engine: 'clamav', verdict: 'malicious', permalink: 'https://scan.test/1' },
      { engine: 'yara', verdict: 'suspicious', label: 'Suspicious' },
      { engine: 'vt', verdict: 'undetected' },
    ])
  })

  it('reads a store row, whose only loss is the requester and the view url', () => {
    // `report_pdf` is a writer field the store rows do carry, so a store row
    // still reads as published; only detail.rs adds requested_by/view_url.
    const { requested_by: _requestedBy, view_url: _viewUrl, ...storeRow } = githubWire
    const run = githubAnalysis(storeRow)
    expect(run.status).toBe('published')
    expect(run.requestedBy).toBe('unknown')
    expect(run.commit).toEqual({ sha: 'a1b2c3d', url: '' })
  })

  it('reads a row with no rendered report as a dry run', () => {
    expect(githubAnalysis({ ...githubWire, report_pdf: null }).status).toBe('dry_run')
  })

  it('maps GET /artifacts/{kind}/{key}', () => {
    expect(artifactRows({ rows: [{ filename: 'call-graph.svg', kind: 'call graph', content_type: 'image/svg+xml', size_bytes: 2048, imported_at: '2026-10-01T10:12:00Z' }] })).toEqual([{ filename: 'call-graph.svg', kind: 'call graph', contentType: 'image/svg+xml', sizeBytes: 2048, importedAt: '2026-10-01T10:12:00Z' }])
  })

  it('maps GET /workbench/analyzers, renaming the wire ids onto the page set', () => {
    const catalog = analyzerCatalog({
      classification: { code: 'pe32', label: 'Windows PE', platform: 'windows', category: 'binary', analysis_path: 'windows-sandbox', dynamic: true },
      analyzers: [
        { id: 'deterministic', display_name: 'Static', description: 'Hashes and rules', gpu_consuming: false, accepted_kinds: ['PE32'], availability: 'configured', required_role: 'viewer', detonates: false, confirmation: 'none', externally_publishing: false, requires_opt_in: false, applicable: true, default_options: { timeout_seconds: 300, max_queue_age_seconds: 3600, retry_limit: 0 }, option_schema: optionSchema },
        { id: 'windows-sandbox', display_name: 'Windows sandbox', description: 'Detonates on KVM', gpu_consuming: false, accepted_kinds: ['PE32'], availability: 'unconfigured', reason: 'no snapshot', required_role: 'admin', detonates: true, confirmation: 'detonate', externally_publishing: false, requires_opt_in: false, applicable: false, reason_unavailable: '', default_options: { timeout_seconds: 600, max_queue_age_seconds: 7200, retry_limit: 1 }, option_schema: optionSchema },
      ],
    } as never)
    expect(catalog.classification.category).toBe('executable')
    expect(catalog.analyzers[0]).toMatchObject({ id: 'static', label: 'Static', gpu: false, availability: 'available', requiredRole: 'viewer', localOnly: true })
    expect(catalog.analyzers[1]).toMatchObject({ id: 'sandbox', availability: 'unavailable', availabilityNote: 'no snapshot', requiredRole: 'admin', detonates: true, confirmation: 'detonate', applicable: false })
  })

  it('maps each analyzer default_options and option_schema onto the page shape', () => {
    const catalog = analyzerCatalog({
      classification: { code: 'elf', label: 'ELF', platform: 'linux', category: 'binary', analysis_path: 'linux-sandbox', dynamic: true },
      analyzers: [{ id: 'linux-sandbox', display_name: 'Linux sandbox', description: 'Detonates on QEMU', gpu_consuming: false, accepted_kinds: ['ELF'], availability: 'configured', required_role: 'admin', detonates: true, confirmation: 'detonate', externally_publishing: false, requires_opt_in: false, applicable: true, default_options: { timeout_seconds: 600, max_queue_age_seconds: 7200, retry_limit: 2 }, option_schema: optionSchema }],
    } as never)
    expect(catalog.analyzers[0].defaultOptions).toEqual({ timeoutSeconds: 600, maxQueueAgeSeconds: 7200, retryLimit: 2 })
    expect(catalog.analyzers[0].optionSchema).toEqual({ timeoutMinSeconds: 30, timeoutMaxSeconds: 3600, queueAgeMinSeconds: 60, queueAgeMaxSeconds: 86400, retryLimitMax: 3 })
  })

  it('maps GET /workbench/runs/{id}', () => {
    const child = { analyzer_id: 'deterministic', display_name: 'Static', state: 'succeeded', summary: '12 rules', created_at: '2026-10-01T13:00:00Z', updated_at: '2026-10-01T13:00:04Z', attempts: 1, retryable: false, cancelable: false }
    const run = workbenchRun({ id: 'wr-77', payload_sha256: '4'.repeat(64), payload_kind: 'PE32', owner: 'xore', recipe_name: 'full sweep', state: 'succeeded', created_at: '2026-10-01T13:00:00Z', updated_at: '2026-10-01T13:00:04Z', children: [child, { ...child, analyzer_id: 'ghidra', display_name: 'Ghidra', state: 'running', summary: 'decompiling' }] } as never)
    expect(run).toMatchObject({ id: 'wr-77', hash: '4'.repeat(64), payloadKind: 'PE32', owner: 'xore', label: 'full sweep', state: 'succeeded' })
    expect(run.children.map((c) => [c.analyzerId, c.label, c.state, c.summary])).toEqual([['static', 'Static', 'succeeded', '12 rules'], ['ghidra', 'Ghidra', 'running', 'decompiling']])
  })

  it('builds the POST /workbench/runs body, mapping page ids back to wire ids', () => {
    const body = createWorkbenchRunBody('5'.repeat(64), ['static', 'sandbox'], { static: { timeoutSeconds: 120, maxQueueAgeSeconds: 900, retryLimit: 1 }, sandbox: { timeoutSeconds: 600, maxQueueAgeSeconds: 3600, retryLimit: 0 } }, { id: 'rc-1', name: 'full sweep', revision: 3 })
    expect(body.payload_sha256).toBe('5'.repeat(64))
    expect(body.recipe_id).toBe('rc-1')
    expect(body.analyzers).toEqual([
      { analyzer_id: 'deterministic', options: { timeout_seconds: 120, max_queue_age_seconds: 900, retry_limit: 1 } },
      { analyzer_id: 'linux-sandbox', options: { timeout_seconds: 600, max_queue_age_seconds: 3600, retry_limit: 0 } },
    ])
  })

  it('refuses to build a run body for an analyzer with no options', () => {
    expect(() => createWorkbenchRunBody('5'.repeat(64), ['static'], {})).toThrow('No options set for analyzer static')
  })

  it('maps GET /gpu-queue and /ml-health', () => {
    expect(gpuJobs([{ job_id: 'gj-1', job_type: 'decompile', ref: '6'.repeat(64), model: 'qwen2.5-coder:14b', estimated_vram_mib: 18_000, status: 'running', requested_at: '2026-10-01T14:00:00Z', started_at: '2026-10-01T14:00:02Z', finished_at: '', abort_requested: false, error: '', attempts: 1, result: null }])).toEqual([{ id: 'gj-1', analyzer: 'workbench', hash: '6'.repeat(64), file: '6'.repeat(64), at: '2026-10-01T14:00:00Z', summary: 'decompile · qwen2.5-coder:14b', detail: { jobId: 'gj-1', jobType: 'decompile', status: 'running' } }])
    expect(modelHealths([{ model: 'anomaly', timestamp: '2026-10-01T15:00:00Z', accepted: true, reason: 'stable', anomaly_rate_new: 0.031, anomaly_rate_previous: 0.028, train_samples: 91_204 }])).toEqual([{ model: 'anomaly', timestamp: '2026-10-01T15:00:00Z', accepted: true, reason: 'stable', anomalyRateNew: 0.031, anomalyRatePrevious: 0.028, trainSamples: 91_204 }])
  })

  it('maps GET /store/yara, skipping a row the scanner errored on', () => {
    const rows = yaraRuns({ total: 2, rows: [{ _doc_id: 'a', yara: { sha256: '7'.repeat(64), scanned_at: '2026-10-01T16:00:00Z', matches: ['loader_gen', 'c2_beacon'] } }, { _doc_id: 'b', yara: { sha256: '8'.repeat(64), matches: [], error: 'scan failed' } }] })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ analyzer: 'yara', hash: '7'.repeat(64), file: '777777777777', summary: '2 rules matched', matches: ['loader_gen', 'c2_beacon'] })
    expect(rows[1]).toMatchObject({ summary: '0 rules matched', detail: { error: 'scan failed' } })
  })

  it('maps a sandbox detail row carrying the importer doc id', () => {
    const detailWire: SandboxRunDetailWire = { ...sandboxDetail, _doc_id: 'sbx:8812' }
    expect(sandboxRun(detailWire).job).toBe('sbx-8812')
  })
})