// GET /api/live — the live event stream, as Server-Sent Events: one `data:`
// line per new event (JSON), an `event: health` when source health changes,
// and a comment every 15 s so proxies keep the connection. Fed by the mock
// backend's generator when the page is in a `?mock=` scenario, and proxied
// off the Rust tier's own /api/v1/live when this process has a BACKEND_URL
// and the request carries no scenario.
//
// THE GATE (#82). `streams.admit()` sits directly above the branch, so it
// covers BOTH arms: the mock generator and the upstream fetch. That is the
// point of moving it here — an SSE connection holds its slot for as long as
// the browser stays on the page, so a proxy in front of the real stream
// with no gate is an unbounded fan-in on the backend, and shedding would
// only ever have applied to the mock it replaces. One gate, one counter: a
// shed on either arm is counted the same way on /metrics
// (`bff_sheds_total{reason}`). The slot is held for the life of the stream
// and released exactly once — on close, on client disconnect, and on an
// upstream that ends first.
//
// No `AbortSignal.timeout` on the upstream fetch: the stream is long-lived by
// design, so the only signal is the request's own abort, which is what stops
// the upstream connection when the operator navigates away.
import { createFileRoute } from '@tanstack/react-router'
import { isScenario } from '#/data/scenarios'
import { admissionGate, envInt } from '#/server/admission'
import { resolveUser } from '#/server/identity'
import { mockScenariosAllowed } from '#/server/policy'
import { asApiError } from '#/data/errors'
import { isLiveBackend, liveRow, openLiveStream } from '#/data/api'
import type { EventRow } from '#/data/contracts/events'

const OUTAGE: Record<string, { status: number; headers?: Record<string, string> }> = {
  unavailable: { status: 502 },
  overloaded: { status: 503, headers: { 'retry-after': '30' } },
  expired: { status: 401 },
}

// Concurrent streams this server holds open; past it a new one is shed
// (503, Retry-After: 1) and EventSource reconnects. Canonical's default.
const streams = admissionGate(envInt('LIVE_MAX_STREAMS', 500))

const SSE = { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' }

export const Route = createFileRoute('/api/live')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Nothing below may escape as an unhandled rejection: h3 turns one
        // into a 500 with an AbortError cause, which is what a browser that
        // navigated away mid-open produced on 2026-10-31 (and, through
        // Cloudflare, an ERR_QUIC_PROTOCOL_ERROR on the stream).
        try {
          return await openLive(request)
        } catch {
          if (request.signal.aborted) return new Response(null, { status: 499 })
          return new Response('stream unavailable', { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })
        }
      },
    },
  },
})

async function openLive(request: Request): Promise<Response> {
  // A direct handler: it checks the session itself.
  if (!(await resolveUser(request))) return new Response('unauthorized', { status: 401 })
  const mock = new URL(request.url).searchParams.get('mock')
  const mockScenario = mockScenariosAllowed() && isScenario(mock) ? mock : undefined
  const scenario = mockScenario ?? 'normal'
  const outage = mockScenario ? (OUTAGE[mockScenario] as (typeof OUTAGE)[string] | undefined) : undefined
  if (outage) return new Response(`live stream: ${mockScenario}`, { status: outage.status, headers: outage.headers })
  // The gate, in front of both arms. See the note above.
  const release = streams.admit()
  if (release instanceof Response) return release

  // No allowed development scenario, and a backend configured: the
  // Rust tier's own stream.
  if (isLiveBackend() && !mockScenario) {
    try {
      const upstream = await openLiveStream(request.signal)
      return new Response(relay(upstream.body!, release), { headers: SSE })
    } catch (error) {
      release()
      // The tier refused or never answered. Canonical answers 502 for
      // the same failure (its api/live.ts `limitedStreamProxy` option),
      // and EventSource gives up on a non-200 — the honest outcome: the
      // browser says the feed is not connected rather than sitting on a
      // stream that will never produce.
      const api = asApiError(error)
      return new Response(api ? `${api.endpoint}: ${api.kind}` : 'stream unavailable', { status: api?.status ?? 502, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  }

  // The mock tier is loaded only for the arm that serves it.
  const { listen } = await import('#/data/mock/liveFeed')
  // The client may have left while the module loaded: the abort
  // listener below is not attached yet, so release the slot here.
  if (request.signal.aborted) {
    release()
    return new Response(null, { status: 499 })
  }
  const encoder = new TextEncoder()
  let stop = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          stop()
        }
      }
      send('retry: 3000\n: open\n\n')
      let sent = 0
      const unlisten = listen({
        event: (event) => {
          if (scenario === 'empty' || scenario === 'loading') return
          // A slow backend: one event in five.
          if (scenario === 'slow' && sent++ % 5 !== 0) return
          send(`data: ${JSON.stringify(event)}\n\n`)
        },
        health: () => send('event: health\ndata: {}\n\n'),
      })
      const ping = setInterval(() => send(': ping\n\n'), 15_000)
      stop = () => {
        clearInterval(ping)
        unlisten()
        release()
      }
      request.signal.addEventListener('abort', () => {
        stop()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      stop()
    },
  })
  return new Response(body, { headers: SSE })
}

/** The upstream body relayed to the browser, holding the gate's slot until
 * the stream ends however it ends.
 *
 * Nothing is buffered and nothing is re-scheduled: a frame is handed on as
 * soon as it arrives, and the upstream connection is cancelled when the
 * browser goes away, so this tier never holds more than the one frame in
 * flight. `release` is idempotent (admission.ts) and runs on all three
 * exits — upstream EOF, a read that failed, and client cancel — because a
 * slot leaked on any one of them would shrink the fleet's real stream
 * capacity a little on every stream. */
function relay(upstream: ReadableStream<Uint8Array>, release: () => void): ReadableStream<Uint8Array> {
  const reader = upstream.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffered = ''
  // Set by cancel(): the browser left, so nothing may be enqueued or closed
  // afterwards (doing so throws, and a throw out of pull is a 500 upstream).
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (cancelled) return
        if (done) {
          release()
          // Whatever the upstream left unterminated (a frame cut by a close),
          // passed on as it stands rather than dropped.
          if (buffered) controller.enqueue(encoder.encode(buffered))
          controller.close()
          return
        }
        // Frames are complete on a blank line, so a frame split across two
        // reads is held until its terminator arrives. Everything else —
        // retry, keep-alive comments, the health event — rides through in
        // whatever chunk it came in.
        buffered += decoder.decode(value, { stream: true })
        const frames = buffered.split('\n\n')
        buffered = frames.pop() ?? ''
        // Nothing to send when the chunk ended mid-frame: enqueuing an empty
        // chunk here would be a zero-byte read the client pays for on every
        // split frame, and axum splits a large row across chunks routinely.
        if (frames.length) controller.enqueue(encoder.encode(frames.map(translated).join('\n\n') + '\n\n'))
      } catch {
        // The upstream failed mid-stream. Closing is the honest end: the
        // browser's EventSource reconnects and re-syncs from /api/v1/events.
        release()
        if (cancelled) return
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelled = true
      release()
      void reader.cancel().catch(() => {})
    },
  })
}

/** One upstream frame, in the framing this tier's browser client reads.
 *
 * Two things change, and both are required rather than tidying:
 *
 * - `event: event` is dropped. The Rust tier names its frame (live.rs:146
 *   `.event("event")`), and a NAMED event does not fire `onmessage`, which
 *   is the only listener src/data/liveStream.ts registers. Forwarding the
 *   name would leave the browser receiving a live stream it silently never
 *   reads — the same failure as serving the wrong chart, one layer down.
 *   The unnamed default event is what the mock arm already sends.
 * - `data:` is mapped through the same `pageEvent` the JSON path applies,
 *   because upstream sends an `events.rs` `row_from_hit` document and every
 *   consumer of a live event here holds a `HoneypotEvent`
 *   (EventNotifications reads `severity`/`summary`/`srcIp`, which the wire
 *   row does not carry under those names). Relaying raw rows would hand
 *   those pages `undefined` fields instead of a connection.
 *
 * Comments, `retry:`, and any other named event (`health` from the mock arm)
 * are passed through untouched — there is nothing to map on a comment, and
 * `health` is this tier's own event name, not the Rust tier's. */
function translated(frame: string): string {
  if (!frame.startsWith('event: event')) return frame
  const data = frame.match(/^data: (.*)$/m)
  if (!data) return frame.replace(/^event: event\n?/m, '')
  // A row the wire changed under us is passed through unmapped rather than
  // dropped: the page treats a live event as a trigger to refetch, so one
  // odd frame must not silently end the stream.
  let payload = data[1]
  try {
    payload = JSON.stringify(liveRow(JSON.parse(data[1]) as EventRow))
  } catch {
    /* not a row this mapper reads */
  }
  return `data: ${payload}`
}
