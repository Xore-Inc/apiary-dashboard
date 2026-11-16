// The download slice on the real backend (#83): the file routes reach the
// APIARY Rust tier through `getRaw` (src/data/api.ts). The backend's answers
// are literal responses from a stubbed fetch.
//
// The regression this file exists for: a wired route rendering an EMPTY FILE
// when the backend cannot serve it. A zero-byte export reads as "no events
// matched", which for a full-scope export is a lie an operator cannot detect
// — so every backend failure asserts a status, and the empty assertions here
// are about bodies the endpoints really send.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { artifactFile, blackholeExport, canarytokenFile, exportFile, payloadFile, rawReport, recordingFile, reportPdf, serveDownload } from './downloads'
import type { Caller } from './backend'
import type { Builder } from './downloads'

/** Serves one raw body per path prefix and records the URLs asked for. The
 * longest matching prefix wins, so `/api/v1/config` and a route beneath it
 * both resolve whichever the caller meant. Binary by default: these endpoints
 * serve files, and a fixture answering JSON would test the wrong reader. */
function stub(responses: Record<string, () => Response>) {
  const calls: string[] = []
  const prefixes = Object.entries(responses).sort(([a], [b]) => b.length - a.length)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const path = new URL(url).pathname
      const entry = prefixes.find(([prefix]) => path.startsWith(prefix))
      if (!entry) throw new TypeError(`no fixture for ${path}`)
      return entry[1]()
    }),
  )
  return calls
}

const bytes = (body: string, type = 'application/octet-stream', status = 200) => () => new Response(body, { status, headers: { 'content-type': type } })

/** A body of real bytes. A JS string would be UTF-8 RE-ENCODED by Response, so
 * the one-byte test vector below would arrive as two bytes. */
const rawBytes = (body: Uint8Array, type = 'application/octet-stream') => () => new Response(body as BodyInit, { headers: { 'content-type': type } })

/** The config the live export cap reads: `behavior.max_export_rows`, as
 * config.rs:804 writes it. */
const config = (maxExportRows: number) => bytes(JSON.stringify({ revision: 41, payload: { behavior: { max_export_rows: maxExportRows } } }), 'application/json')

const CSV = 'timestamp,sensor\n2026-10-04T20:41:03Z,cowrie\n2026-10-04T20:41:04Z,cowrie\n'

/** Runs one download the way a route file runs it: through `serveDownload`,
 * unguarded (`session: false`), as the trusted internal caller. */
const serve = (url: string, build: Builder): Promise<Response> => serveDownload(new Request(url), build, { session: false })

/** Runs one builder directly, with the caller under test. */
const asUser = (build: Builder, user: Caller): Promise<Response> => build(new URLSearchParams(), { user })

const operator = { name: 'Operator', email: 'operator@example.test', roles: ['admin'] }

beforeEach(() => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
})

describe('the file routes reach the backend when it is configured', () => {
  it('serves an artifact from artifacts.rs::download', async () => {
    const calls = stub({ '/api/v1/artifacts/ghidra/': bytes('/* decompiled */\n', 'text/x-c') })
    const response = await serve('http://dashboard.test/api/artifact/ghidra/abc123/decompiled.c', artifactFile('ghidra', 'abc123', 'decompiled.c'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('/* decompiled */\n')
    expect(response.headers.get('content-type')).toBe('text/x-c')
    // This tier's own filename, not a header off the wire: `getRaw` drops the
    // upstream disposition, so an unsanitized one can never reach a browser.
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="decompiled.c"')
    expect(new URL(calls[0]).pathname).toBe('/api/v1/artifacts/ghidra/abc123/decompiled.c')
  })

  it('serves a recording from replay.rs, under its own format', async () => {
    const shasum = 'ab12cd34'.repeat(4)
    const calls = stub({ '/api/v1/recordings/': bytes('version 2\n', 'application/x-asciicast+json') })
    const response = await serve(`http://dashboard.test/api/recording/${shasum}/cast`, recordingFile(shasum, 'cast'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-asciicast+json')
    expect(new URL(calls[0]).pathname).toBe(`/api/v1/recordings/${shasum}/cast`)
  })

  it('serves a payload from payload_detail.rs::raw, as octet-stream', async () => {
    const hash = 'a'.repeat(64)
    const calls = stub({ '/api/v1/payloads/': bytes('MZ\x90\x00malware', 'application/octet-stream') })
    const response = await asUser(payloadFile(hash), operator)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new URL(calls[0]).pathname).toBe(`/api/v1/payloads/${hash}/raw`)
  })

  it('serves every allowlisted export from exports.rs under its own name', async () => {
    for (const name of ['events.csv', 'commands.csv', 'ips.csv', 'campaigns.csv', 'clusters.csv']) {
      const calls = stub({ '/api/v1/config': config(5000), '/api/v1/export/': bytes(CSV, 'text/csv') })
      const response = await serve(`http://dashboard.test/api/export/${name}`, exportFile(name))
      expect(response.status, name).toBe(200)
      expect(new URL(calls[0]).pathname, name).toBe(`/api/v1/export/${name}`)
    }
  })

  it('serves history.json as the envelope the backend sends', async () => {
    // exports.rs:518 answers `result.to_string()` — the raw Elasticsearch
    // envelope, not a shaped row list. Truncating it as CSV would be
    // nonsense, so this one is handed over byte for byte.
    const calls = stub({ '/api/v1/export/history.json': bytes('{"hits":{"total":{"value":1}}}', 'application/json') })
    const response = await serve('http://dashboard.test/api/export/history.json?q=wget', exportFile('history.json'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hits: { total: { value: 1 } } })
    expect(new URL(calls[0]).searchParams.get('q')).toBe('wget')
  })

  it('sends the service token as a header on a download, never in a URL', async () => {
    const calls = stub({ '/api/v1/artifacts/': bytes('x', 'text/plain') })
    await serve('http://dashboard.test/api/artifact/ghidra/abc123/decompiled.c', artifactFile('ghidra', 'abc123', 'decompiled.c'))
    expect(calls[0]).not.toContain('test-token')
    expect(vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers).toMatchObject({ 'x-service-token': 'test-token' })
  })
})

describe('a name or an id the backend does not know is an honest error', () => {
  it('404s an unknown export name without calling anything', async () => {
    const calls = stub({})
    const response = await serve('http://dashboard.test/api/export/secrets.csv', exportFile('secrets.csv'))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('unknown export')
    expect(calls).toEqual([])
  })

  it('502s an allowlisted export the backend refuses, never an empty file', async () => {
    // Every EXPORTS key is a route the backend registers (lib.rs:531-536),
    // so a 404 there is the backend refusing: a 502, never an empty file
    // an operator would read as "nothing matched".
    stub({ '/api/v1/export/events.csv': bytes('not found', 'text/plain', 404) })
    const response = await serve('http://dashboard.test/api/export/events.csv', exportFile('events.csv'))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('export unavailable')
  })

  it('404s an artifact the backend does not have', async () => {
    stub({ '/api/v1/artifacts/': bytes('no such artifact', 'text/plain', 404) })
    const response = await serve('http://dashboard.test/api/artifact/ghidra/abc123/gone.c', artifactFile('ghidra', 'abc123', 'gone.c'))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('artifact unavailable')
  })

  it('502s an export the backend failed to build, rather than serving a truncated one', async () => {
    stub({ '/api/v1/config': config(5000), '/api/v1/export/events.csv': bytes('elasticsearch unavailable', 'text/plain', 502) })
    expect((await serve('http://dashboard.test/api/export/events.csv', exportFile('events.csv'))).status).toBe(502)
  })
})

describe('the export cap: the tighter of the configured setting and the endpoint own', () => {
  it('truncates a live export to the configured max_export_rows', async () => {
    stub({ '/api/v1/config': config(2), '/api/v1/export/events.csv': bytes(CSV, 'text/csv') })
    const out = await (await serve('http://dashboard.test/api/export/events.csv', exportFile('events.csv'))).text()
    // Header plus two rows: the header always survives, so the file can never
    // be a valid zero-row download.
    expect(out.split('\n').filter(Boolean)).toHaveLength(3)
  })

  it('cuts on a record boundary, never inside a quoted newline', async () => {
    // `csv_body` quotes any field holding a quote, a comma or an LF
    // (exports.rs:53), and attacker-controlled command input carries all
    // three: a naive Nth-newline split would ship a file ending mid-record.
    const body = 'timestamp,sensor,command\nt1,cowrie,"uname -a\nrm -rf /"\nt2,cowrie,id\nt3,cowrie,id\n'
    stub({ '/api/v1/config': config(1), '/api/v1/export/commands.csv': bytes(body, 'text/csv') })
    const out = await (await serve('http://dashboard.test/api/export/commands.csv', exportFile('commands.csv'))).text()
    expect(out).toBe('timestamp,sensor,command\nt1,cowrie,"uname -a\nrm -rf /"\n')
  })

  it('keeps the endpoint own ceiling when it is tighter than the setting', async () => {
    // ips.csv asks aggregates::sources for 1000 (exports.rs:316), so a
    // 5000-row setting cannot widen it.
    const body = `ip,country\n${'198.51.100.1,NL\n'.repeat(1200)}`
    stub({ '/api/v1/config': config(5000), '/api/v1/export/ips.csv': bytes(body, 'text/csv') })
    const out = await (await serve('http://dashboard.test/api/export/ips.csv', exportFile('ips.csv'))).text()
    expect(out.split('\n').filter(Boolean)).toHaveLength(1001)
  })

  it('keeps a zero-row cap from emptying the file', async () => {
    stub({ '/api/v1/config': config(0), '/api/v1/export/events.csv': bytes(CSV, 'text/csv') })
    expect(await (await serve('http://dashboard.test/api/export/events.csv', exportFile('events.csv'))).text()).toBe('timestamp,sensor\n')
  })
})

describe('the payload download stays admin-only', () => {
  const hash = '320cbb5e902f6bc9d8ea8edd7974b7829b1e4f08f477b7e3aadb240c18e9cc37'
  it('refuses a viewer before any call', async () => {
    const calls = stub({})
    const response = await asUser(payloadFile(hash), { name: 'Analyst', email: 'a@example.test', roles: ['viewer'] })
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('administrator role required')
    expect(calls).toEqual([])
  })

  it('refuses a caller with no session before any call', async () => {
    const calls = stub({})
    expect((await asUser(payloadFile(hash), null)).status).toBe(403)
    expect(calls).toEqual([])
  })

  it('lets an admin through to the backend bytes', async () => {
    stub({ '/api/v1/payloads/': rawBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])) })
    const response = await asUser(payloadFile(hash), operator)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))
  })

  it('refuses a malformed hash before any call', async () => {
    const calls = stub({})
    const response = await asUser(payloadFile('not-a-hash'), operator)
    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })
})

describe('the infrastructure routes', () => {
  it('/healthz answers 200 with no session and no backend', async () => {
    // Unauthenticated by design — the upstream `GET /healthz` (lib.rs:281) is
    // public for the same reason (`public_router()`, lib.rs:699) — and it
    // answers whether THIS process is up. It deliberately does not proxy the
    // backend's probe: the same question about the same process is answered
    // here without a socket.
    const calls = stub({})
    delete process.env.BACKEND_URL
    const { Route } = await import('../routes/healthz')
    // The generated route's handler type is a union over every handler
    // shape the router accepts; this one takes no context and answers a
    // Response, and the runtime object is what is under test here.
    const get = (Route.options as unknown as { server: { handlers: { GET: () => Response } } }).server.handlers.GET
    const response = get()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
    expect(calls).toEqual([])
  })

  it('the blackhole body is handed over unchanged from ip_block.rs::export', async () => {
    // The handler sorts and joins the legacy body byte for byte and says so
    // (ip_block.rs:132), so re-deriving it here from an unsorted list is
    // exactly the way a firewall puller silently drops a rule.
    const body = '198.51.100.7\n203.0.113.4\n'
    const calls = stub({ '/api/v1/ip-block-export': bytes(body, 'text/plain; charset=utf-8') })
    const response = await serve('http://dashboard.test/export/portbridge-manual-blackhole.txt', blackholeExport())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(body)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/ip-block-export')
  })

  it('502s the blackhole list rather than emptying it on an outage', async () => {
    stub({ '/api/v1/ip-block-export': bytes('manual blackhole export unavailable', 'text/plain', 502) })
    const response = await serve('http://dashboard.test/export/portbridge-manual-blackhole.txt', blackholeExport())
    expect(response.status).toBe(502)
    // A 200 with an empty body here would tell the WireGuard puller the
    // blocklist is empty, and it would clear every rule.
    expect((await response.text()).length).toBeGreaterThan(0)
  })

  it('serves an empty blackhole list as an empty 200, which is a real answer', async () => {
    stub({ '/api/v1/ip-block-export': bytes('', 'text/plain') })
    const response = await serve('http://dashboard.test/export/portbridge-manual-blackhole.txt', blackholeExport())
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })
})

describe('the reports, canarytokens and raw reports', () => {
  it('serves a generated report PDF inline from reports.rs::pdf', async () => {
    const calls = stub({ '/api/v1/reports/': bytes('%PDF-1.7', 'application/pdf') })
    const response = await serve('http://dashboard.test/api/report/rpt-8256dc8894/pdf', reportPdf('rpt-8256dc8894'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('inline')
    expect(new URL(calls[0]).pathname).toBe('/api/v1/reports/rpt-8256dc8894/pdf')
  })

  it('404s a generated report the backend does not have, rather than rendering one', async () => {
    stub({ '/api/v1/reports/': bytes('no such report', 'text/plain', 404) })
    const response = await serve('http://dashboard.test/api/report/rpt-unknown/pdf', reportPdf('rpt-unknown'))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('report unavailable')
  })

  it('refuses a payload report with no backend endpoint instead of rendering one', async () => {
    // `rpt-payload-<sha256>-<n>` names a report the reporter builds on
    // demand; reports.rs reads stored `pdf_base64` only. Asking for it would
    // be asking a route about a document that does not exist.
    const hash = 'a'.repeat(64)
    const calls = stub({})
    const response = await serve(`http://dashboard.test/api/report/rpt-payload-${hash}-1/pdf`, reportPdf(`rpt-payload-${hash}-1`))
    expect(response.status).toBe(502)
    expect(await response.text()).toBe('report not available on live backend')
    expect(calls).toEqual([])
  })

  it('serves a CAPE raw report from detail.rs::cape_raw', async () => {
    const sha = 'b'.repeat(64)
    const calls = stub({ '/api/v1/cape/': bytes('{"cape":{"score":9}}', 'application/json') })
    const response = await serve(`http://dashboard.test/api/raw-report/cape/${sha}`, rawReport('cape', sha))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cape: { score: 9 } })
    expect(new URL(calls[0]).pathname).toBe(`/api/v1/cape/${sha}/raw`)
  })

  it('serves a GitHub analysis raw report from detail.rs::github_analysis', async () => {
    const sha = 'c'.repeat(64)
    const calls = stub({ '/api/v1/github-analysis/': bytes('{"verdict":"malicious"}', 'application/json') })
    const response = await serve(`http://dashboard.test/api/raw-report/github-analysis/${sha}`, rawReport('github-analysis', sha))
    expect(response.status).toBe(200)
    expect(new URL(calls[0]).pathname).toBe(`/api/v1/github-analysis/${sha}`)
  })

  it('404s an unknown raw-report kind without calling anything', async () => {
    const calls = stub({})
    const response = await serve(`http://dashboard.test/api/raw-report/nope/${'d'.repeat(64)}`, rawReport('nope', 'd'.repeat(64)))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('unknown report kind')
    expect(calls).toEqual([])
  })

  it('serves a canarytoken artifact from canarytokens.rs::download', async () => {
    const calls = stub({ '/api/v1/canarytokens/': bytes('%PDF-1.7', 'application/pdf') })
    const response = await serve('http://dashboard.test/api/canarytoken/canarytoken-abc123/download', canarytokenFile('canarytoken-abc123'))
    expect(response.status).toBe(200)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/canarytokens/canarytoken-abc123/download')
  })
})
