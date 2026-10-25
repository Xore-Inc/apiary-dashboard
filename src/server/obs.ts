// What this tier counts, for /metrics (src/routes/metrics.ts), in the
// canonical BFF's Prometheus series and names: requests served and their
// wall time, load shed by an admission gate, named sign-in outcomes, and
// the event loop's p99 delay. Named events also go out as one JSON line
// each to stdout by default, or DASHBOARD_BFF_LOG_FILE when configured
// (Filebeat tails it), capped at 25 MiB plus one rotated `.1` generation.
// Backend-call and payload-cache series join
// when the server functions call the real backend (#6).
import { appendFile, rename, stat, unlink } from 'node:fs/promises'
import { monitorEventLoopDelay } from 'node:perf_hooks'

const MAX_SINK_BYTES = 25 * 1024 * 1024

// Label values come from our own call sites, never from request bytes.
const counters = new Map<string, number>()
const inc = (name: string) => counters.set(name, (counters.get(name) ?? 0) + 1)
let totalDurationMs = 0

const lag = monitorEventLoopDelay({ resolution: 20 })
lag.enable()

/** p99 event-loop delay over the rolling window, in ms. */
export const eventLoopLagMs = () => lag.percentile(99) / 1e6

export function recordRequest(durationMs: number): void {
  inc('bff_requests_total')
  totalDurationMs += durationMs
}

export function recordShed(reason: 'queue-full' | 'event-loop-lag'): void {
  inc(`bff_sheds_total{reason="${reason}"}`)
}

export function recordNamedEvent(name: string, fields: Record<string, unknown> = {}): void {
  const safe = /^[\w.-]{1,64}$/.test(name) ? name : 'unnamed_event'
  inc(`bff_named_events_total{name="${safe}"}`)
  // One write at a time: two events crossing the cap together would
  // otherwise both rotate, and the second would delete the first's `.1`.
  sinkTail = sinkTail.then(() => writeLine(safe, fields))
}

let sinkTail: Promise<void> = Promise.resolve()

/** Every named-event line queued so far, written (tests). */
export const flushNamedEvents = () => sinkTail

async function writeLine(name: string, fields: Record<string, unknown>): Promise<void> {
  const file = process.env.DASHBOARD_BFF_LOG_FILE
  const line = { '@timestamp': new Date().toISOString(), 'event.category': 'dashboard_app', service: 'dashboard-bff', level: name.endsWith('failed') ? 'error' : 'info', 'event.action': name, ...fields }
  if (!file) {
    console.log(JSON.stringify(line))
    return
  }
  try {
    if (((await stat(file).catch(() => null))?.size ?? 0) >= MAX_SINK_BYTES) {
      await unlink(`${file}.1`).catch(() => {})
      await rename(file, `${file}.1`)
    }
    await appendFile(file, `${JSON.stringify(line)}\n`)
  } catch {
    /* sink unavailable: the counter above still carries the event */
  }
}

/** The Prometheus text exposition. */
export function renderMetrics(): string {
  const family = (prefix: string) =>
    [...counters]
      .filter(([name]) => name.startsWith(`${prefix}{`))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, value]) => `${name} ${String(value)}`)
  return [
    '# HELP bff_requests_total HTTP requests served by this tier.',
    '# TYPE bff_requests_total counter',
    `bff_requests_total ${String(counters.get('bff_requests_total') ?? 0)}`,
    '# HELP bff_request_duration_seconds_sum Sum of served-request wall time.',
    '# TYPE bff_request_duration_seconds_sum counter',
    '# UNIT bff_request_duration_seconds seconds',
    `bff_request_duration_seconds_sum ${(totalDurationMs / 1000).toFixed(6)}`,
    '# HELP bff_sheds_total Load shed by the admission limiter.',
    '# TYPE bff_sheds_total counter',
    ...family('bff_sheds_total'),
    '# HELP bff_named_events_total Named application events (sign-in outcomes).',
    '# TYPE bff_named_events_total counter',
    ...family('bff_named_events_total'),
    '# HELP bff_event_loop_lag_p99_seconds p99 event-loop delay.',
    '# TYPE bff_event_loop_lag_p99_seconds gauge',
    '# UNIT bff_event_loop_lag_p99_seconds seconds',
    `bff_event_loop_lag_p99_seconds ${(eventLoopLagMs() / 1000).toFixed(6)}`,
    '',
  ].join('\n')
}
