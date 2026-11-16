// The files the dashboard hands over, at the paths production serves them
// from (/api/export, /api/payload, /api/recording, /api/report,
// /api/raw-report, /api/artifact, /api/canarytoken), each fetched from the
// real backend behind the same service token the query layer presents,
// through `getRaw` (src/data/api.ts), for the request's signed-in user.
//
// A captured payload is live malware: it is served as the bytes the backend
// holds, as an attachment, and only to administrators.
import { asApiError } from './errors'
import { resolveUser } from '#/server/identity'
import type { Caller } from './backend'
import type { RawFile } from './api'
import { payloadOfReport } from '#/lib/reportPdf'

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

/** Runs one download for the request's user; a failed backend call answers
 * with its own status, as the proxy in front of it would. */
export async function serveDownload(request: Request, build: Builder, { session = true }: { session?: boolean } = {}): Promise<Response> {
  const search = new URL(request.url).searchParams
  // Direct handlers pass neither the navigation guard nor the function
  // middleware: each checks the session itself, as canonical's do.
  const user = session ? await resolveUser(request) : undefined
  if (session && !user) return text(401, 'unauthorized')
  try {
    return await build(search, { user })
  } catch (error) {
    const api = asApiError(error)
    if (api) return text(api.status, `${api.endpoint}: ${api.kind}`)
    throw error
  }
}

/** One download's builder, given the link's search and the caller. */
export type Builder = (search: URLSearchParams, reach: Reach) => Promise<Response>

/** Who the download is for: the signed-in user, or the trusted internal
 * caller (undefined) for a route that checks its own token. */
type Reach = { user: Caller }

/** The real backend's call seam. Imported dynamically because
 * `src/data/api.ts` is server-only and this module is reached from route
 * files the client bundle also loads. */
const seam = () => import('./api')

/** The real backend's answer for one download. */
async function live(path: string, search: Record<string, string | number | undefined> = {}): Promise<RawFile> {
  return (await seam()).getRaw('serveDownload', path, search)
}

// ---- Exports ---------------------------------------------------------------

const EVENT_FILTERS = ['ip', 'sensor', 'country', 'proto', 'port', 'persona', 'site', 'asset', 'org', 'provider', 'city', 'fingerprint', 'kind', 'since'] as const

/** The most rows each upstream export will ever return, and where that is
 * fixed — `EXPORT_MAX_ROWS` (exports.rs:32) for the four that search an
 * index, and the handler's own hard-coded window for the two that do not:
 * `ips_csv` asks aggregates::sources for 1000 (exports.rs:316) and
 * `history_json` forces 500 (exports.rs:506). Not a guess and not a
 * re-implementation: read off the handlers, which cannot be widened by any
 * parameter we could send.
 *
 * These are CEILINGS, not the row count. An operator who sets
 * `behavior.maxExportRows` lower than one of these is asking for fewer rows
 * than the backend offers, not for a different ceiling, so the export is
 * truncated to `min(both)` in `truncatedCsv`. */
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
 * raw Elasticsearch envelope (`result.to_string()`, exports.rs:518), so it is
 * served as the backend sends it under its own 500-row window. */
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

/** One allowlisted export name's builder. `shape` is what the body needs
 * before it is served: a row cap for the CSV shapes, nothing for
 * `history.json`, whose envelope the backend already bounds.
 *
 * The name is checked against `EXPORTS` first, so an unknown name is a 404
 * before any call: an allowlist that only fails upstream would answer a
 * wrong name with whatever the backend felt like returning. A 404 from the
 * backend is the contract made visible (every key here is a route the
 * backend registers, lib.rs:531-536), so it is a 502 here, never an empty
 * file. */
const EXPORTS: Partial<Record<string, (search: URLSearchParams, shape: () => Promise<(body: Uint8Array) => string>) => Promise<Response>>> = {
  'events.csv': async (search, shape) => {
    const filters: Record<string, string> = {}
    for (const key of EVENT_FILTERS) {
      const value = search.get(key)
      if (value) filters[key] = value
    }
    const upstream = await live('/api/v1/export/events.csv', filters)
    return upstream.found ? file((await shape())(upstream.body), upstream.contentType, 'events.csv') : text(502, 'export unavailable')
  },
  'commands.csv': async (_search, shape) => {
    const upstream = await live('/api/v1/export/commands.csv')
    return upstream.found ? file((await shape())(upstream.body), upstream.contentType, 'commands.csv') : text(502, 'export unavailable')
  },
  'ips.csv': async (_search, shape) => {
    const upstream = await live('/api/v1/export/ips.csv')
    return upstream.found ? file((await shape())(upstream.body), upstream.contentType, 'ips.csv') : text(502, 'export unavailable')
  },
  'campaigns.csv': async (_search, shape) => {
    const upstream = await live('/api/v1/export/campaigns.csv')
    return upstream.found ? file((await shape())(upstream.body), upstream.contentType, 'campaigns.csv') : text(502, 'export unavailable')
  },
  'clusters.csv': async (search, shape) => {
    const upstream = await live('/api/v1/export/clusters.csv', { kind: search.get('kind') ?? undefined })
    return upstream.found ? file((await shape())(upstream.body), upstream.contentType, 'clusters.csv') : text(502, 'export unavailable')
  },
  'history.json': async (search) => {
    const upstream = await live('/api/v1/export/history.json', { q: search.get('q') ?? undefined })
    return upstream.found ? file(upstream.body, upstream.contentType, 'history.json') : text(502, 'export unavailable')
  },
}

/** How many rows an export may carry, as the body shaper for that name: the
 * tighter of this tier's configured cap (the backend's own shell
 * configuration, so an operator's setting is the one that binds) and the
 * endpoint's own ceiling.
 *
 * A cap of zero or below would empty the file, which is the one outcome this
 * path must never produce, so the header line always survives. */
async function exportCap(name: string): Promise<(body: Uint8Array) => string> {
  const configured = await (await seam()).liveShellCap()
  const rows = Math.min(configured, UPSTREAM_EXPORT_ROWS[name] ?? Number.MAX_SAFE_INTEGER)
  return (body) => truncatedCsv(body, rows)
}

export const exportFile = (name: string) => async (search: URLSearchParams) => {
  const builder = EXPORTS[name]
  // The allowlist is a contract: a name that is not on it is a 404 here,
  // before any call.
  if (!builder) return text(404, 'unknown export')
  return builder(search, () => exportCap(name))
}

// ---- Payloads, recordings --------------------------------------------------

export const payloadFile = (hash: string) => async (_search: URLSearchParams, reach: Reach) => {
  // Admin-gated before anything else, on this process's own session read,
  // not a backend call, so the download cannot become a way around it.
  if (!reach.user?.roles.includes('admin')) return text(403, 'administrator role required')
  if (!HASH.test(hash)) return text(400, 'invalid payload id')
  // payload_detail.rs's own `raw` is the bytes, and it sets nosniff and an
  // attachment disposition itself (payload_detail.rs:194) because the sample
  // is live malware.
  const upstream = await live(`/api/v1/payloads/${encodeURIComponent(hash)}/raw`)
  return upstream.found ? file(upstream.body, upstream.contentType, `${hash}.bin`) : text(404, 'payload unavailable')
}

export const recordingFile = (shasum: string, format: string) => async () => {
  if (!HASH.test(shasum)) return text(400, 'invalid recording id')
  if (format !== 'cast' && format !== 'raw') return text(404, 'unknown recording format')
  // replay.rs serves both under one route with the format as the last path
  // segment (replay_cast at :186, replay_raw at :216), and both come back
  // as attachments.
  const upstream = await live(`/api/v1/recordings/${encodeURIComponent(shasum)}/${format}`)
  return upstream.found ? file(upstream.body, upstream.contentType, `${shasum}.${format}`) : text(404, 'recording unavailable')
}

// ---- Reports ---------------------------------------------------------------

export const reportPdf = (id: string) => async () => {
  // reports.rs::pdf serves the stored `pdf_base64` and answers INLINE, so
  // the browser shows the report instead of downloading it (reports.rs:51).
  // A payload report's id (`rpt-payload-<sha256>-…`, `reportPdf.ts`) names a
  // document with no backend endpoint yet: say so rather than build one.
  if (payloadOfReport(id)) return text(502, 'report not available on live backend')
  const upstream = await live(`/api/v1/reports/${encodeURIComponent(id)}/pdf`)
  return upstream.found ? file(upstream.body, upstream.contentType, `${id}.pdf`, 'inline') : text(404, 'report unavailable')
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
 * Both answers are JSON and both are re-served verbatim,
 * which is what the raw-report chip promises; the type comes off the wire,
 * as it does for every other download. */
const RAW_REPORT_UPSTREAM: Partial<Record<string, (sha: string) => string>> = {
  cape: (sha) => `/api/v1/cape/${encodeURIComponent(sha)}/raw`,
  'github-analysis': (sha) => `/api/v1/github-analysis/${encodeURIComponent(sha)}`,
}

export const rawReport = (kind: string, sha: string) => async () => {
  const upstream = RAW_REPORT_UPSTREAM[kind]
  if (!upstream) return text(404, 'unknown report kind')
  const answer = await live(upstream(sha))
  // A refused fetch is the ApiError `serveDownload` maps to its status; a
  // 404 is this route's own "raw report unavailable", never an empty JSON
  // document that would parse as a report with no fields.
  return answer.found ? file(answer.body, answer.contentType, `${kind}-${sha}.json`) : text(404, 'raw report unavailable')
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
export const blackholeExport = () => async () => {
  const upstream = await live('/api/v1/ip-block-export')
  if (!upstream.found) return text(502, 'manual blackhole export unavailable')
  return new Response(upstream.body as BodyInit, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

// ---- Artifacts, canarytokens -----------------------------------------------

export const artifactFile = (kind: string, key: string, filename: string) => async () => {
  // artifacts.rs::download reassembles a chunked artifact and serves it with
  // the stored content_type; a kind outside {ghidra, sandbox} is a 404
  // (artifacts.rs:101), which the { found: false } arm passes through.
  const upstream = await live(`/api/v1/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(key)}/${encodeURIComponent(filename)}`)
  return upstream.found ? file(upstream.body, upstream.contentType, filename) : text(404, 'artifact unavailable')
}

export const canarytokenFile = (id: string) => async () => {
  // canarytokens.rs::download fetches the artifact from the platform itself
  // and serves it with the type that platform mints for the token type
  // (canarytokens.rs:391); a `web_image` has none and is a 400 there
  // (canarytokens.rs:367), which passes through as a 404.
  const upstream = await live(`/api/v1/canarytokens/${encodeURIComponent(id)}/download`)
  return upstream.found ? file(upstream.body, upstream.contentType, `canarytoken-${id.slice(0, 12)}`) : text(404, 'artifact unavailable')
}
