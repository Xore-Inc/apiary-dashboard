// The files the dashboard hands over, at the paths production serves them
// from (/api/export, /api/payload, /api/recording, /api/report,
// /api/raw-report, /api/artifact, /api/canarytoken). Each is built from the
// same data seam the pages read, through the mock scenario named in `?mock=`,
// so an outage, an empty backend or the viewer role reach the downloads too.
//
// A captured payload is live malware in production; here it is a small text
// file saying so. Nothing that downloads from the mock is executable.
//
// #83: a builder asks `live()` first. With BACKEND_URL set and no allowed
// development scenario, the answer comes from the real backend behind the
// same service token the query layer presents, through `getRaw`
// (src/data/api.ts). An unconfigured backend or an allowed development
// scenario still answers from the mock.
import { asApiError } from './errors'
import { backend } from './backend'
import { resolveUser } from '#/server/identity'
import { mockScenariosAllowed } from '#/server/policy'
import type { Backend, Caller } from './backend'
import { isScenario } from './scenarios'
import type { MockScenario } from './scenarios'
import type * as Api from './api'
import type { RawFile } from './api'
import type { EventFilters, ReportDefinition } from './types'
import { toCsv } from '#/lib/export'
import { formatNumber } from '#/lib/format'
import { buildPdf } from '#/lib/pdf'
import { payloadOfReport } from '#/lib/reportPdf'
import type { PdfLine } from '#/lib/pdf'

const HASH = /^[0-9a-fA-F]{32,64}$/

type Body = string | Uint8Array

function file(body: Body, type: string, filename: string, disposition: 'attachment' | 'inline' = 'attachment'): Response {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': type,
      'content-disposition': `${disposition}; filename="${filename.replace(/["\\\r\n]/g, '_')}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  })
}

const text = (status: number, message: string) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

/** Runs one download under the scenario the link carries; a failed backend
 * call answers with its own status, as the proxy in front of it would. */
export async function serveDownload(request: Request, build: Builder, { session = true }: { session?: boolean } = {}): Promise<Response> {
  const search = new URL(request.url).searchParams
  const mock = search.get('mock')
  const allowMock = mockScenariosAllowed()
  const scenario = allowMock && isScenario(mock) ? mock : undefined
  if (!allowMock) search.delete('mock')
  // Direct handlers pass neither the navigation guard nor the function
  // middleware: each checks the session itself, as canonical's do.
  const user = session ? await resolveUser(request) : undefined
  if (session && !user) return text(401, 'unauthorized')
  // The mock backend in the scenario the link carries, for this request's
  // user (the unguarded ones answer as the trusted internal caller).
  const q = backend(scenario ?? 'normal', user)
  try {
    return await build(search, q, { mock: scenario, user })
  } catch (error) {
    const api = asApiError(error)
    if (api) return text(api.status, `${api.endpoint}: ${api.kind}`)
    throw error
  }
}

/** One download's builder: the scenario and the caller beside the mock
 * backend, so a builder can reach the real backend for the same request the
 * mock would have answered. */
export type Builder = (search: URLSearchParams, q: Backend, reach: Reach) => Promise<Response>

/** Where one builder's bytes come from. */
type Reach = { mock: MockScenario | undefined; user: Caller }

/** The real backend's call seam, or null when this request answers from the
 * mock.
 *
 * Null in exactly the cases the query layer's `runForRequest` uses the mock:
 * an allowed development scenario, or no BACKEND_URL.
 * It is asked per call rather than read at module load, so `?mock=` decides
 * here where the request is and never in shared module state. Imported
 * dynamically because `src/data/api.ts` is server-only and this module is
 * reached from route files the client bundle also loads. */
async function seam(reach: Reach): Promise<typeof Api | null> {
  if (reach.mock) return null
  const api = await import('./api')
  return api.isLiveBackend() ? api : null
}

/** The real backend's answer for one download, or null when the mock should
 * answer instead. */
async function live(reach: Reach, path: string, search: Record<string, string | number | undefined> = {}): Promise<RawFile | null> {
  const api = await seam(reach)
  return api ? api.getRaw('serveDownload', path, search) : null
}

// ---- Exports ---------------------------------------------------------------

const EVENT_FILTERS = ['ip', 'sensor', 'country', 'proto', 'port', 'persona', 'site', 'asset', 'org', 'provider', 'city', 'fingerprint', 'kind', 'since'] as const

async function cap<T>(q: Backend, rows: T[]): Promise<T[]> {
  const { behavior } = await q.getShellConfig()
  return rows.slice(0, behavior.maxExportRows)
}

/** The most rows each upstream export will ever return, and where that is
 * fixed — `EXPORT_MAX_ROWS` (exports.rs:32) for the four that search an
 * index, and the handler's own hard-coded window for the two that do not:
 * `ips_csv` asks aggregates::sources for 1000 (exports.rs:316) and
 * `history_json` forces 500 (exports.rs:506). Not a guess and not a
 * re-implementation: read off the handlers, which cannot be widened by any
 * parameter we could send.
 *
 * These are CEILINGS, not the row count. `behavior.maxExportRows` still
 * binds on the mock, and an operator who sets it lower than one of these is
 * asking for fewer rows than the backend offers, not for a different
 * ceiling — so the live path truncates to `min(both)` in `truncatedCsv`. */
const UPSTREAM_EXPORT_ROWS: Record<string, number> = {
  'events.csv': 10_000,
  'commands.csv': 10_000,
  'ips.csv': 1_000,
  'campaigns.csv': 10_000,
  'clusters.csv': 10_000,
  'history.json': 500,
}

/** The live export's body, truncated to the tighter of the two caps.
 *
 * A record is not a line: `csv_body` quotes any field holding a quote, a
 * comma, a CR or an LF (exports.rs:53), and honeypot text carries all four —
 * a command input can be `printf 'a\nb'`. So the split tracks quoting
 * instead of cutting at the Nth newline, which is what would otherwise ship
 * a file ending mid-record.
 *
 * #83: only the CSV shapes go through here. `history.json` upstream is the
 * raw Elasticsearch envelope (`result.to_string()`, exports.rs:518), not the
 * shaped row list the mock renders, so it is served as the backend sends it
 * under its own 500-row window. */
function truncatedCsv(body: Uint8Array, rows: number): string {
  const csv = new TextDecoder().decode(body)
  if (!csv) return csv
  let lineStart = 0
  let quoted = false
  let records = 0
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (c === '"') quoted = !quoted
    else if (c === '\n' && !quoted) {
      records += 1
      // The header is record 1 and is never spent, so a cap of N rows ends
      // after record N+1. A cap of zero therefore keeps the header alone,
      // which is what makes a legitimately empty file distinguishable from
      // a failed one.
      if (records > rows + 1) return csv.slice(0, lineStart)
      lineStart = i + 1
    }
  }
  return csv
}

/** One export: the backend's bytes when it has them, the mock's CSV when it
 * does not. The name is checked against `EXPORTS` first, so an unknown name
 * is a 404 before any call — an allowlist that only fails upstream would
 * answer a wrong name with whatever the backend felt like returning. */
/** One allowlisted export name's builder. `shape` is what the live body
 * needs before it is served — a row cap for the CSV shapes, nothing for
 * `history.json`, whose envelope the backend already bounds.
 *
 * A live 404 is the CONTRACT made visible, not a fallback: every key here is
 * a route the backend registers (lib.rs:531-536), so a 404 is the backend
 * refusing, and answering from the mock's fixtures instead would hand an
 * operator a CSV full of honeypot.example.test rows and call it real. So
 * `null` from `live()` means "mock answers" and `found: false` means "502". */
const EXPORTS: Partial<Record<string, (search: URLSearchParams, q: Backend, reach: Reach, shape: () => Promise<(body: Uint8Array) => string>) => Promise<Response>>> = {
  'events.csv': async (search, q, reach, shape) => {
    const filters: EventFilters = {}
    for (const key of EVENT_FILTERS) {
      const value = search.get(key)
      if (value) filters[key] = value
    }
    const upstream = await live(reach, '/api/v1/export/events.csv', { ...filters })
    if (upstream?.found) return file((await shape())(upstream.body), upstream.contentType, 'events.csv')
    if (upstream) return text(502, 'export unavailable')
    const { rows } = await q.getEvents(filters)
    return file(toCsv(await cap(q, rows), ['timestamp', 'sensor', 'persona', 'asset', 'srcIp', 'country', 'city', 'org', 'provider', 'protocol', 'dstPort', 'type', 'severity', 'summary', 'fingerprint', 'communityId', 'sessionId']), 'text/csv', 'events.csv')
  },
  'commands.csv': async (_search, q, reach, shape) => {
    const upstream = await live(reach, '/api/v1/export/commands.csv')
    if (upstream?.found) return file((await shape())(upstream.body), upstream.contentType, 'commands.csv')
    if (upstream) return text(502, 'export unavailable')
    return file(toCsv(await cap(q, (await q.getCommands()).rows), ['timestamp', 'sensor', 'srcIp', 'command', 'sessionId']), 'text/csv', 'commands.csv')
  },
  'ips.csv': async (_search, q, reach, shape) => {
    const upstream = await live(reach, '/api/v1/export/ips.csv')
    if (upstream?.found) return file((await shape())(upstream.body), upstream.contentType, 'ips.csv')
    if (upstream) return text(502, 'export unavailable')
    return file(toCsv(await cap(q, (await q.getSourceProfiles()).sources), ['ip', 'country', 'org', 'events', 'logins', 'sessions', 'sensors', 'first', 'last']), 'text/csv', 'ips.csv')
  },
  'campaigns.csv': async (_search, q, reach, shape) => {
    const upstream = await live(reach, '/api/v1/export/campaigns.csv')
    if (upstream?.found) return file((await shape())(upstream.body), upstream.contentType, 'campaigns.csv')
    if (upstream) return text(502, 'export unavailable')
    return file(toCsv(await cap(q, (await q.getNetworkCampaigns()).campaigns), ['cidr', 'score', 'events', 'uniqueIps', 'sensors', 'ports', 'creds', 'payloads', 'alerts', 'first', 'last']), 'text/csv', 'campaigns.csv')
  },
  'clusters.csv': async (search, q, reach, shape) => {
    const upstream = await live(reach, '/api/v1/export/clusters.csv', { kind: search.get('kind') ?? undefined })
    if (upstream?.found) return file((await shape())(upstream.body), upstream.contentType, 'clusters.csv')
    if (upstream) return text(502, 'export unavailable')
    return file(toCsv(await cap(q, await q.getInfraClusters()), ['kind', 'value', 'sources', 'events', 'sensors']), 'text/csv', 'clusters.csv')
  },
  'history.json': async (search, q, reach) => {
    const upstream = await live(reach, '/api/v1/export/history.json', { q: search.get('q') ?? undefined })
    if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, 'history.json') : text(502, 'export unavailable')
    return file(`${JSON.stringify(await cap(q, (await q.searchHistory(search.get('q') ?? '')).rows), null, 2)}\n`, 'application/json', 'history.json')
  },
}

/** How many rows a live export may carry, as the body shaper for that name:
 * the tighter of this tier's configured cap and the endpoint's own ceiling.
 * Reads the LIVE shell config when the backend answers it, so an operator's
 * setting is the one that binds — falling back to the mock's cap here would
 * cap a real export by a number read out of the fixture data.
 *
 * A cap of zero or below would empty the file, which is the one outcome this
 * path must never produce, so the header line always survives. */
async function liveCap(reach: Reach, q: Backend, name: string): Promise<(body: Uint8Array) => string> {
  const api = await seam(reach)
  const configured = api ? await api.liveShellCap() : (await q.getShellConfig()).behavior.maxExportRows
  const rows = Math.min(configured, UPSTREAM_EXPORT_ROWS[name] ?? Number.MAX_SAFE_INTEGER)
  return (body) => truncatedCsv(body, rows)
}

export const exportFile = (name: string) => async (search: URLSearchParams, q: Backend, reach: Reach) => {
  const builder = EXPORTS[name]
  // The allowlist is a contract: a name that is not on it is a 404 here,
  // before any call. An allowlist that only failed upstream would answer a
  // wrong name with whatever the backend chose to return.
  if (!builder) return text(404, 'unknown export')
  return builder(search, q, reach, () => liveCap(reach, q, name))
}

// ---- Payloads, recordings --------------------------------------------------

export const payloadFile = (hash: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  // Admin-gated before anything else, on the mock's own session read, which
  // is this process's real session store — not a backend call. It gates a
  // live malware download exactly as it gates the mock's stand-in, so the
  // #83 wiring cannot become a way around it.
  const user = await q.getSessionUser()
  if (!user?.roles.includes('admin')) return text(403, 'administrator role required')
  if (!HASH.test(hash)) return text(400, 'invalid payload id')
  // payload_detail.rs's own `raw` is the bytes, and it sets nosniff and an
  // attachment disposition itself (payload_detail.rs:194) because the sample
  // is live malware.
  const upstream = await live(reach, `/api/v1/payloads/${encodeURIComponent(hash)}/raw`)
  if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, `${hash}.bin`) : text(404, 'payload unavailable')
  const analysis = await q.getPayloadAnalysis(hash)
  if (!analysis) return text(404, 'payload unavailable')
  const note = [
    'APIARY mock payload',
    `sha256: ${analysis.payload.hash}`,
    `type:   ${analysis.fileType}`,
    '',
    'This file stands in for the captured sample. In production this download',
    'is the raw bytes as captured: live malware, served as application/octet-stream,',
    'and only to administrators.',
    '',
  ].join('\n')
  return file(note, 'application/octet-stream', `${analysis.payload.hash}.bin`)
}

export const recordingFile = (shasum: string, format: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  if (!HASH.test(shasum)) return text(400, 'invalid recording id')
  if (format !== 'cast' && format !== 'raw') return text(404, 'unknown recording format')
  // replay.rs serves both under one route with the format as the last path
  // segment (replay_cast at :186, replay_raw at :216), and both come back
  // as attachments.
  const upstream = await live(reach, `/api/v1/recordings/${encodeURIComponent(shasum)}/${format}`)
  if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, `${shasum}.${format}`) : text(404, 'recording unavailable')
  const replay = await q.getReplay(shasum)
  if (!replay) return text(404, 'recording unavailable')
  if (format === 'raw') return file(replay.transcript, 'application/octet-stream', `${shasum}.raw`)
  // asciicast v2: a header line, then one [time, "o", text] line per write.
  const lines = replay.transcript.split('\n')
  const step = replay.durationSeconds / Math.max(1, lines.length)
  const cast = [
    JSON.stringify({ version: 2, width: 120, height: 32, title: `APIARY recording ${shasum.slice(0, 12)}` }),
    ...lines.map((line, i) => JSON.stringify([Number((i * step).toFixed(3)), 'o', `${line}\r\n`])),
  ].join('\n')
  return file(`${cast}\n`, 'application/x-asciicast+json', `${shasum}.cast`)
}

// ---- Reports ---------------------------------------------------------------

/** A payload's own report: what the sample is, and what each analysis found. */
async function payloadReportPdf(q: Backend, hash: string): Promise<Response> {
  const a = await q.getPayloadAnalysis(hash)
  if (!a) return text(404, 'report unavailable')
  const p = a.payload
  const title = `Payload report ${p.hash.slice(0, 12)}`
  const lines: PdfLine[] = [
    { text: 'TLP:AMBER', size: 9, bold: true },
    { text: title, size: 22, bold: true, gap: 8 },
    { text: `${a.fileType} - ${p.platform}`, size: 10 },
    { text: `Verdict: ${p.verdict ? `${p.verdict.label}${p.verdict.family ? ` (${p.verdict.family})` : ''}` : 'none yet'} - static risk ${a.staticRisk}/100`, size: 11, gap: 6 },
    { text: 'Hashes', size: 14, bold: true, gap: 12 },
    ...Object.entries(a.hashes).map(([k, v]) => ({ text: `${k}  |  ${v}`, size: 9 })),
    { text: 'Capture', size: 14, bold: true, gap: 12 },
    { text: `First captured ${p.capturedAt.slice(0, 16).replace('T', ' ')} UTC, ${formatNumber(p.copies)} copies, ${formatNumber(p.sizeBytes)} bytes, from ${p.sources.join(', ')}`, size: 9 },
    { text: 'YARA', size: 14, bold: true, gap: 12 },
    ...(a.yara.length ? a.yara.map((rule) => ({ text: rule, size: 9 })) : [{ text: 'No rule matched.', size: 9 }]),
    { text: 'Indicators', size: 14, bold: true, gap: 12 },
    ...(a.iocs.length ? a.iocs.slice(0, 30).map((ioc) => ({ text: `${ioc.kind}  |  ${ioc.value}`, size: 9 })) : [{ text: 'None extracted.', size: 9 }]),
    { text: 'Analyses', size: 14, bold: true, gap: 12 },
    { text: `Sandbox: ${a.sandbox ? `${a.sandbox.verdict}, risk ${a.sandbox.risk}` : 'not detonated'}`, size: 9 },
    { text: `Ghidra: ${a.ghidra ? 'decompiled' : 'not decompiled'}`, size: 9 },
    { text: `GitHub: ${a.github ? `${a.github.status}, ${a.github.detections}/${a.github.engines} engines` : 'not published'}`, size: 9 },
    { text: 'Mock document: the real payload report adds the analyses in full.', size: 8, gap: 16 },
  ]
  return file(buildPdf(lines, title), 'application/pdf', `${title}.pdf`, 'inline')
}

export const reportPdf = (id: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  // reports.rs::pdf serves the stored `pdf_base64` and answers INLINE, so
  // the browser shows the report instead of downloading it (reports.rs:51).
  // A payload report's id (`rpt-payload-<sha256>-…`, `reportPdf.ts`) names a
  // document with no live endpoint. Production must say so rather than build
  // one from fixtures.
  const payload = payloadOfReport(id)
  if (payload) return (await seam(reach)) ? text(502, 'report not available on live backend') : payloadReportPdf(q, payload)
  const upstream = await live(reach, `/api/v1/reports/${encodeURIComponent(id)}/pdf`)
  if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, `${id}.pdf`, 'inline') : text(404, 'report unavailable')
  const data = await q.getReports()
  const report = data.generated.find((g) => g.id === id)
  if (!report) return text(404, 'report unavailable')
  const template = data.templates.find((t) => t.id === report.template)
  const saved = data.definitions.find((d) => d.id === report.definitionId)
  // A one-off report kept no definition: it covered its template's sections.
  const definition: ReportDefinition = saved ?? {
    id: report.id,
    name: report.title,
    template: report.template,
    theme: 'light',
    elements: template?.elements ?? [],
    appendixLimit: 120,
    scope: { window: '24h', ip: [], sensor: [], port: [], signature: [] },
    branding: { title: report.title, author: 'APIARY', headerLeft: '', headerRight: '', footerLeft: '', classification: 'TLP:AMBER' },
    schedule: null,
    created: report.createdAt,
  }
  const preview = await q.previewReport(definition)
  const lines: PdfLine[] = [
    { text: definition.branding.classification, size: 9, bold: true },
    { text: report.title, size: 22, bold: true, gap: 8 },
    { text: `${template?.name ?? report.template} - generated ${report.createdAt.slice(0, 16).replace('T', ' ')} UTC`, size: 10 },
  ]
  // No preview (an artifact template): the document then has no counts.
  if (preview) {
    lines.push({ text: `Covers ${preview.period.from.slice(0, 10)} to ${preview.period.to.slice(0, 10)}`, size: 10 })
    lines.push({ text: `${formatNumber(preview.events)} events from ${formatNumber(preview.sources)} sources on ${formatNumber(preview.sensors)} sensors, ${formatNumber(preview.sessions)} sessions`, size: 11, gap: 10 })
  }
  for (const section of preview?.sections ?? []) {
    lines.push({ text: section.label, size: 14, bold: true, gap: 12 })
    lines.push({ text: `${section.columns[0]}  |  ${section.columns[1]}`, size: 9, bold: true })
    for (const [a, b] of section.sample) lines.push({ text: `${a}  |  ${b}`, size: 9 })
    if (section.rows > section.sample.length) lines.push({ text: `... and ${section.rows - section.sample.length} more rows`, size: 9 })
  }
  lines.push({ text: 'Mock document: the real report renders every row, with charts, in the chosen theme.', size: 8, gap: 16 })
  return file(buildPdf(lines, report.title), 'application/pdf', `${report.title}.pdf`, 'inline')
}

/** Where each kind's raw report lives upstream, as a path.
 *
 * The dashboard's own path is `/api/raw-report/{kind}/{sha}` and there is NO
 * upstream route of that name — the brief recorded that, and it is right.
 * But both kinds it fronts DO have a real endpoint behind them, and the
 * canonical BFF already maps the same pair (frontend-next/src/routes/api/
 * raw-report.$kind.$sha.ts:22): `cape` to `/api/v1/cape/{sha}/raw`
 * (detail.rs:325) and `github-analysis` to `/api/v1/github-analysis/{sha}`
 * (detail.rs:356). So this wires the same two, behind the dashboard's own
 * kind allowlist, which is unchanged.
 *
 * #83's brief said to leave this on the mock because no upstream endpoint
 * was found. The search missed the two because they are not named after the
 * dashboard's route. Both answers are JSON and both are re-served verbatim,
 * which is what the raw-report chip promises; the type comes off the wire,
 * as it does for every other download. */
const RAW_REPORT_UPSTREAM: Partial<Record<string, (sha: string) => string>> = {
  cape: (sha) => `/api/v1/cape/${encodeURIComponent(sha)}/raw`,
  'github-analysis': (sha) => `/api/v1/github-analysis/${encodeURIComponent(sha)}`,
}

export const rawReport = (kind: string, sha: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  const upstream = RAW_REPORT_UPSTREAM[kind]
  if (upstream) {
    const answer = await live(reach, upstream(sha))
    // A refused fetch is the ApiError `serveDownload` maps to its status; a
    // 404 is this route's own "raw report unavailable", never an empty JSON
    // document that would parse as a report with no fields.
    if (answer) return answer.found ? file(answer.body, answer.contentType, `${kind}-${sha}.json`) : text(404, 'raw report unavailable')
  }
  const report = kind === 'cape' ? await q.getCapeRun(sha) : kind === 'github-analysis' ? await q.getGithubAnalysis(sha) : undefined
  if (report === undefined) return text(404, 'unknown report kind')
  if (!report) return text(404, 'raw report unavailable')
  return file(`${JSON.stringify(report, null, 2)}\n`, 'application/json', `${kind}-${sha}.json`)
}

// ---- The firewall's blocklist ------------------------------------------------

/** The manual blackhole list the VPS firewall pulls every five minutes: one
 * address per line, sorted, a trailing newline, empty when none. Byte for
 * byte what production serves; an outage answers 5xx so the puller keeps
 * its rules instead of clearing them.
 *
 * #83: the bytes come from `GET /api/v1/ip-block-export`, served by the same
 * sort-and-join this writes, and both say so (ip_block.rs:132: "byte-
 * compatible with the legacy /export/portbridge-manual-blackhole.txt body";
 * the canonical BFF proxies this exact path — frontend-next/src/routes/
 * export.portbridge-manual-blackhole[.]txt.ts:14). So the body is handed
 * over UNCHANGED, not re-sorted here: re-deriving it from a list we did not
 * sort identically is how a puller silently drops a rule. A failure is a
 * 502, never an empty 200. */
export const blackholeExport = () => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  const upstream = await live(reach, '/api/v1/ip-block-export')
  if (upstream) {
    if (!upstream.found) return text(502, 'manual blackhole export unavailable')
    return new Response(upstream.body as BodyInit, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
  }
  const ips = [...(await q.getBlockedIps())].sort()
  return new Response(ips.length ? `${ips.join('\n')}\n` : '', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

// ---- Artifacts, canarytokens -----------------------------------------------

export const artifactFile = (kind: string, key: string, filename: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  // artifacts.rs::download reassembles a chunked artifact and serves it with
  // the stored content_type; a kind outside {ghidra, sandbox} is a 404
  // (artifacts.rs:101), which the { found: false } arm passes through.
  const upstream = await live(reach, `/api/v1/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(key)}/${encodeURIComponent(filename)}`)
  if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, filename) : text(404, 'artifact unavailable')
  const artifact = await q.getArtifactFile(kind, key, filename)
  if (!artifact) return text(404, 'artifact unavailable')
  return file(artifact.body, artifact.contentType, artifact.filename)
}

// What each kind hands over to plant: small stand-ins for the real formats,
// pointing only at the mock platform (example.test).
const CANARY_FILES: Record<string, (memo: string, url: string, hostname: string) => { body: Body; type: string; extension: string }> = {
  adobe_pdf: (memo, url) => ({ body: buildPdf([{ text: memo, size: 16, bold: true }, { text: `Canarytoken document: opening it calls ${url}.`, size: 10 }], memo), type: 'application/pdf', extension: 'pdf' }),
  ms_word: (memo, url) => ({
    // An RTF opens in Word the way the real .docx does; the beacon is a field.
    body: `{\\rtf1\\ansi{\\fonttbl{\\f0 Calibri;}}\\f0\\fs24 ${memo}\\par{\\field{\\*\\fldinst INCLUDEPICTURE "${url}" \\\\d}}\\par}\n`,
    type: 'application/rtf',
    extension: 'rtf',
  }),
  ms_excel: (memo, url) => ({ body: `${memo}\nQuarter,Budget\nQ1,120000\nQ2,135000\n\n# opening the real workbook calls ${url}\n`, type: 'text/csv', extension: 'csv' }),
  windows_dir: (memo, _url, hostname) => ({ body: `; ${memo}\r\n[.ShellClassInfo]\r\nIconResource=\\\\%USERNAME%.%COMPUTERNAME%.%USERDOMAIN%.INI.${hostname}\\resource.dll\r\n`, type: 'text/plain', extension: 'desktop.ini' }),
  qr_code: (memo, url) => ({
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="260" viewBox="0 0 240 260"><rect width="240" height="260" fill="#fff"/><rect x="20" y="20" width="200" height="200" fill="none" stroke="#000" stroke-width="8"/><text x="120" y="125" font-family="sans-serif" font-size="12" text-anchor="middle">QR stand-in</text><text x="120" y="245" font-family="sans-serif" font-size="9" text-anchor="middle">${memo.replace(/[<&>]/g, '')} · ${url.replace(/[<&>]/g, '')}</text></svg>`,
    type: 'image/svg+xml',
    extension: 'svg',
  }),
}

export const canarytokenFile = (id: string) => async (_search: URLSearchParams, q: Backend, reach: Reach) => {
  // canarytokens.rs::download fetches the artifact from the platform itself
  // and serves it with the type that platform mints for the token type
  // (canarytokens.rs:391); a `web_image` has none and is a 400 there
  // (canarytokens.rs:367), which passes through as the 404 the mock gives.
  const upstream = await live(reach, `/api/v1/canarytokens/${encodeURIComponent(id)}/download`)
  if (upstream) return upstream.found ? file(upstream.body, upstream.contentType, `canarytoken-${id.slice(0, 12)}`) : text(404, 'artifact unavailable')
  const token = (await q.getCanarytokens()).tokens.find((t) => t.id === id)
  const build = token?.artifact ? CANARY_FILES[token.type] : undefined
  if (!token?.artifact || !build) return text(404, 'artifact unavailable')
  const made = build(token.memo, token.url, token.hostname)
  return file(made.body, made.type, `${token.artifact}.${made.extension}`)
}
