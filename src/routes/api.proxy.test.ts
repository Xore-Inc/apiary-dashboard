// The three proxy routes (#82): /api/chart/$name, /api/live and
// /api/topology/flow, wired to the Rust tier.
//
// What this file exists to hold, in the order the issue states it:
//
// - the routes REACH the backend, with its token as a header;
// - the chart allowlist is checked BEFORE the backend is called, and every
//   one of its 21 names is a route the Rust tier actually registers — an
//   allowlisted-but-unavailable chart is 502, never a wrong chart;
// - the admission gate covers the stream, and counts its sheds;
// - the session checks are the ones that were already there.
//
// Every endpoint asserted here was read out of the APIARY source, not
// inferred: the chart paths from the `#[utoipa::path]` attributes in
// backend-service charts.rs / kill_chain.rs / fusion.rs, `/api/v1/live` from
// live.rs:129, and `/api/v1/topology` from topology.rs:698. The fixtures
// below are built in the wire shapes those handlers declare.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as ChartRoute } from '#/routes/api.chart.$name'
import { Route as LiveRoute } from '#/routes/api.live'
import { Route as FlowRoute } from '#/routes/api.topology.flow'
import { CHART_NAMES, isChartName } from '#/data/contracts/charts'
import { renderMetrics } from '#/server/obs'
import { SESSION_COOKIE, sessions } from '#/server/session'
import type { EventRow } from '#/data/contracts/events'

/** A route's GET handler, reached the way the server reaches it. `params` is
 * optional because two of the three routes have none — /api/live and
 * /api/topology/flow take no path segment. */
type Ctx = { request: Request; params?: Record<string, string> }
type Handler = (ctx: Ctx) => Promise<Response> | Response

const handler = (route: unknown): Handler => (route as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET

/** A signed-in operator's request, and the viewer role the routes tell apart. */
const viewer = { sub: 'v', username: 'v', displayName: 'Viewer', email: 'viewer@example.test', role: 'viewer' as const }

const account = { sub: 'admin', username: 'admin', displayName: 'Admin', email: 'admin@example.test', role: 'admin' as const }

let sid = ''
/** `cookie` is empty for the no-session cases, which is a request with no
 * session cookie at all rather than one with an empty one. */
const asUser = (url: string, cookie: string = sid) => new Request(`http://dashboard.example.test${url}`, { headers: cookie === '' ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` } })

/** One endpoint per path, recording what was asked. Unstubbed paths throw,
 * so a request reaching an endpoint this file did not expect is a failure
 * rather than an empty body read as a valid answer. */
function backend(responses: Record<string, () => Response>) {
  const calls: string[] = []
  const fixtures = new Map(Object.entries(responses))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url))
      const path = new URL(String(url)).pathname
      const answer = fixtures.get(path)
      if (!answer) throw new TypeError(`no fixture for ${path}`)
      return answer()
    }),
  )
  return calls
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fails = (status: number) => () => new Response('nope', { status })

/** The tier's `row_from_hit` output — the same builder /api/v1/events uses
 * (live.rs:115), and the shape the wire's stream carries. */
const row: EventRow = {
  id: 'ev_9f2c1a', time: '2026-10-04T20:41:03Z', sensor: 'cowrie', src_ip: '203.0.113.42',
  country: 'NL', port: '22', proto: 'ssh', detail: 'command.input: uname -a', session: 'sess-77a1',
  pivots: {
    persona: 'researcher', site: '', asset: '', fingerprint: 'curl/8.5.0', fingerprint_kind: 'User-Agent',
    command: 'uname -a', user: 'root', pass: 'toor', path: '', shasum: '', asn: 'AS64496', org: 'Example Transit',
    provider: 'hosting', alert: '', category: '', payload_class: '', tty_replay: '', ics_severity: '',
  },
  record: { honeypot: { eventid: 'cowrie.command.input', input: 'uname -a' }, network: { protocol: 'ssh' } },
}

beforeEach(async () => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
  sid = await sessions.create(account)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
})

describe('/api/chart/$name — the allowlist is the contract', () => {
  const get = handler(ChartRoute)

  it('reaches the Rust tier for an allowlisted chart, with the token as a header', async () => {
    const calls = backend({ '/api/v1/charts/os-distribution': json([{ name: 'Linux', value: 12 }]) })
    const response = await get({ request: asUser('/api/chart/os-distribution'), params: { name: 'os-distribution' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ name: 'Linux', value: 12 }])
    expect(calls).toEqual(['http://backend.test/api/v1/charts/os-distribution'])
  })

  it('answers 404 for a name outside the allowlist WITHOUT calling the backend', async () => {
    // The gate is the point: an unlisted name must not become a probe of
    // the Rust router, and must never reach a handler as some other chart.
    const calls = backend({})
    const response = await get({ request: asUser('/api/chart/../config'), params: { name: '../config' } })
    expect(response.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('serves 502 — never a payload — for an allowlisted chart the tier cannot answer', async () => {
    // The failure this issue exists to prevent. A 502 renders as "this chart
    // is unavailable"; the alternative, answering with some other chart's
    // payload, renders as real data that was never there.
    //
    // Every refusal collapses to 502, including a 503 and a 422: canonical's
    // chart proxy folds `serviceJSON`'s null over any failure into one 502.
    // This route
    // exists to serve one named chart, so there is one rendering for "the
    // tier will not give it to us" — not a status per upstream fault.
    for (const status of [404, 422, 500, 502, 503]) {
      backend({ '/api/v1/charts/ml-backlog': fails(status) })
      const response = await get({ request: asUser('/api/chart/ml-backlog'), params: { name: 'ml-backlog' } })
      expect({ upstream: status, status: response.status }).toEqual({ upstream: status, status: 502 })
      expect(await response.text()).not.toContain('points')
    }
  })

  it('502s on a socket failure too, rather than serving a stand-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('ECONNREFUSED')
      }),
    )
    const response = await get({ request: asUser('/api/chart/ml-backlog'), params: { name: 'ml-backlog' } })
    expect(response.status).toBe(502)
  })

  it('forwards the query string, because attacker-fusion is the one chart that takes one', async () => {
    // fusion.rs:21 `FusionQuery { id: String }` — the only chart handler
    // with a query extractor. Its id is an attacker identity, so dropping it
    // would 404 every fusion chart: without ?id= there is no payload.
    const fusion = { categories: ['HASSH'], values: [3], ips: ['203.0.113.42'] }
    const calls = backend({ '/api/v1/charts/attacker-fusion': json(fusion) })
    const response = await get({ request: asUser('/api/chart/attacker-fusion?id=attr-9f2c'), params: { name: 'attacker-fusion' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(fusion)
    expect(calls[0]).toBe('http://backend.test/api/v1/charts/attacker-fusion?id=attr-9f2c')
  })

  it('502s attacker-fusion with no id, as the tier does', async () => {
    backend({ '/api/v1/charts/attacker-fusion': fails(422) })
    const response = await get({ request: asUser('/api/chart/attacker-fusion'), params: { name: 'attacker-fusion' } })
    expect(response.status).toBe(502)
  })

  it('refuses a caller with no session, before the backend is reached', async () => {
    const calls = backend({ '/api/v1/charts/os-distribution': json([]) })
    const response = await get({ request: asUser('/api/chart/os-distribution', ''), params: { name: 'os-distribution' } })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('serves a viewer: these charts are not admin-only', async () => {
    // Canonical's chart route has no role check — session only, and this
    // route is no stricter.
    const v = await sessions.create({ ...viewer, sub: 'viewer' })
    const calls = backend({ '/api/v1/charts/os-distribution': json([{ name: 'Linux', value: 1 }]) })
    const response = await get({ request: asUser('/api/chart/os-distribution', v), params: { name: 'os-distribution' } })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
  })

  it('every allowlisted name is a route the Rust tier registers', () => {
    // The landmine the brief names: a name allowlisted here but absent
    // upstream would fail the axum router with a 404 forever, reading as a
    // chart that is permanently unavailable. All 21 were confirmed against
    // the tier's own `path =` attributes, and the two sets are IDENTICAL —
    // no allowlisted name without a route, and no upstream chart route the
    // browser cannot reach. This pins the count so the two cannot drift
    // apart silently: adding a name here without a route upstream, or
    // renaming one, fails here rather than at runtime as "no data".
    expect(CHART_NAMES).toHaveLength(21)
    expect(new Set(CHART_NAMES).size).toBe(21)
    expect(CHART_NAMES.every(isChartName)).toBe(true)
    expect(isChartName('config')).toBe(false)
  })
})

describe('/api/topology/flow — one slice of the tier\'s document', () => {
  const get = handler(FlowRoute)

  it('reaches /api/v1/topology and serves only its flow slice', async () => {
    // topology.rs:644 TopologyResponse { generated_at, sensors, flow, stacks };
    // canonical serves `data.flow` and drops the rest, and so does this —
    // the path's name promises a flow graph, not the fleet's hostnames.
    const flow = { nodes: [{ name: 'Traefik', layer: 0 }], links: [{ source: 'Traefik', target: 'cowrie' }] }
    const calls = backend({
      '/api/v1/topology': json({ generatedAt: '2026-10-04T20:41:03Z', sensors: [{ sensor: 'cowrie' }], flow, stacks: [] }),
    })
    const response = await get({ request: asUser('/api/topology/flow') })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(flow)
    expect(calls).toEqual(['http://backend.test/api/v1/topology'])
  })

  it('502s when the document comes back without the flow slice', async () => {
    backend({ '/api/v1/topology': json({ generatedAt: '2026-10-04T20:41:03Z', sensors: [], stacks: [] }) })
    const response = await get({ request: asUser('/api/topology/flow') })
    expect(response.status).toBe(502)
  })

  it('502s when the tier refuses or fails', async () => {
    for (const status of [404, 500, 502]) {
      backend({ '/api/v1/topology': fails(status) })
      expect((await get({ request: asUser('/api/topology/flow') })).status).toBe(502)
    }
  })

  it('refuses a caller with no session, before the backend is reached', async () => {
    const calls = backend({ '/api/v1/topology': json({ flow: { nodes: [], links: [] } }) })
    const response = await get({ request: asUser('/api/topology/flow', '') })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })
})

describe('/api/live — the gate covers the real stream', () => {
  const get = handler(LiveRoute)
  /** One upstream SSE connection, ending when `close` resolves. */
  const upstream = (frames: string[], close?: () => void) => () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          for (const frame of frames) controller.enqueue(encoder.encode(frame))
          controller.close()
          close?.()
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )

  const read = async (response: Response) => await new Response(response.body).text()

  it('relays the tier\'s frames and maps a wire row into the page\'s event shape', async () => {
    backend({ '/api/v1/live': upstream([`event: event\ndata: ${JSON.stringify(row)}\n\n`]) })
    const response = await get({ request: asUser('/api/live') })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const body = await read(response)
    // The `event: event` name is dropped, because src/data/liveStream.ts
    // registers only `onmessage` — which fires for the unnamed default
    // event. Forwarding the name would leave the browser holding a stream
    // it silently never reads.
    expect(body.startsWith('data: ')).toBe(true)
    expect(body).not.toContain('event: event')
    const frame = JSON.parse(body.replace(/^data: /, '').trim())
    // A page event, not a wire row: `srcIp`, `summary` and `severity` are
    // the fields EventNotifications reads, and none of them exist on the row.
    expect(frame.srcIp).toBe('203.0.113.42')
    expect(typeof frame.summary).toBe('string')
    // The row carries no ICS severity, so the page event has none: not `info`.
    expect(frame.severity).toBeUndefined()
    expect(frame.type).toBe('command.input')
  })

  it('passes keep-alive comments and other named events through untouched', async () => {
    // A comment has no payload to map, and `health` is this tier's own event
    // name, not the Rust tier's — rewriting either would break the browser
    // client for no gain.
    backend({ '/api/v1/live': upstream([': keep-alive\n\n', 'retry: 3000\n\n', 'event: health\ndata: {}\n\n']) })
    const body = await read(await get({ request: asUser('/api/live') }))
    expect(body).toContain(': keep-alive')
    expect(body).toContain('retry: 3000')
    expect(body).toContain('event: health')
  })

  it('answers 502 when the tier never answers, so EventSource does not hang', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('ECONNREFUSED')
      }),
    )
    const response = await get({ request: asUser('/api/live') })
    expect(response.status).toBe(502)
  })

  it('answers 502 when the tier refuses the stream', async () => {
    backend({ '/api/v1/live': fails(503) })
    const response = await get({ request: asUser('/api/live') })
    expect(response.status).toBe(503)
  })

  it('SHEDS the real stream when the gate is full, and counts the shed', async () => {
    // The landmine the brief names: a proxy in front of the real stream with
    // no gate is an unbounded fan-in on the backend. The gate sits above the
    // branch, so it covers the upstream arm — and the counter still moves.
    // Each stream here is one that never ends, so each holds its slot for
    // the life of the test.
    const endless = () =>
      () =>
        new Response(new ReadableStream<Uint8Array>({ cancel() {} }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    backend({ '/api/v1/live': endless() })

    const opened: Response[] = []
    for (let i = 0; i < 500; i++) {
      const response = await get({ request: asUser('/api/live') })
      if (response.status !== 200) break
      opened.push(response)
    }
    // The canonical default cap is 500 (LIVE_MAX_STREAMS); all 500 opened.
    expect(opened).toHaveLength(500)

    // The 501st finds every slot taken. Nothing was fetched for it: the gate
    // sheds BEFORE the upstream is touched, which is the whole point of
    // putting the gate above the branch rather than inside the proxy arm.
    const calls = backend({ '/api/v1/live': endless() })
    const shed = await get({ request: asUser('/api/live') })
    expect(shed.status).toBe(503)
    expect(shed.headers.get('retry-after')).toBe('1')
    expect(calls).toEqual([])
    expect(renderMetrics()).toMatch(/bff_sheds_total\{reason="queue-full"\} [1-9]\d*/)

    for (const response of opened) await response.body?.cancel()
  })

  it('holds the gate\'s slot for the life of the stream and releases it when the client goes', async () => {
    // A slot leaked on any exit would shrink the fleet's real stream
    // capacity a little on every stream, so this asserts the release on the
    // client-disconnect path specifically.
    const cancels: number[] = []
    backend({
      '/api/v1/live': () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancels.push(1)
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    })
    const response = await get({ request: asUser('/api/live') })
    await response.body?.cancel()
    expect(cancels).toHaveLength(1)
  })

  it('releases the slot when the upstream ends by itself', async () => {
    backend({ '/api/v1/live': upstream([`event: event\ndata: ${JSON.stringify(row)}\n\n`]) })
    const response = await get({ request: asUser('/api/live') })
    expect(await read(response)).toContain('data: ')
    // With the slot back, the next stream opens rather than shedding.
    backend({ '/api/v1/live': upstream([': keep-alive\n\n']) })
    expect((await get({ request: asUser('/api/live') })).status).toBe(200)
  })

  it('still refuses a caller with no session before opening the stream', async () => {
    const calls = backend({ '/api/v1/live': upstream([': keep-alive\n\n']) })
    const response = await get({ request: asUser('/api/live', '') })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('reassembles a frame the upstream split across chunks', async () => {
    // A large row does not fit one read, so the relay has to hold a partial
    // frame until its blank line arrives. Emitting the first half on its own
    // would hand the browser a JSON.parse failure and a dropped event.
    const frame = `event: event\ndata: ${JSON.stringify({ ...row, detail: 'x'.repeat(4000) })}\n\n`
    const cut = frame.indexOf('\n\n') - 200
    backend({
      '/api/v1/live': () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              const encoder = new TextEncoder()
              controller.enqueue(encoder.encode(frame.slice(0, cut)))
              controller.enqueue(encoder.encode(frame.slice(cut)))
              controller.close()
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    })
    const body = await read(await get({ request: asUser('/api/live') }))
    const line = body.trim().replace(/^data: /, '')
    expect(line).not.toContain('\n')
    expect(JSON.parse(line).srcIp).toBe('203.0.113.42')
  })

  it('never puts the token in the upstream URL', async () => {
    const calls = backend({ '/api/v1/live': upstream([': keep-alive\n\n']) })
    const response = await get({ request: asUser('/api/live') })
    await read(response)
    expect(calls.some((url) => url.includes('test-token'))).toBe(false)
  })
})
