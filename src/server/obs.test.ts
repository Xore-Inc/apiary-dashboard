import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { admissionGate } from './admission'
import { flushNamedEvents, recordNamedEvent, recordRequest, renderMetrics } from './obs'

afterEach(() => {
  delete process.env.DASHBOARD_BFF_LOG_FILE
})

describe('metrics', () => {
  it('counts requests, sheds and named events in Prometheus text', () => {
    recordRequest(1500)
    recordNamedEvent('auth_callback_completed')
    recordNamedEvent('bad name"}')
    const gate = admissionGate(1)
    const release = gate.admit()
    expect(release).toBeTypeOf('function')
    const shed = gate.admit()
    expect(shed).toBeInstanceOf(Response)
    expect((shed as Response).status).toBe(503)
    expect((shed as Response).headers.get('retry-after')).toBe('1')
    ;(release as () => void)()
    ;(release as () => void)()
    expect(gate.admit()).toBeTypeOf('function')
    expect(gate.admit()).toBeInstanceOf(Response)

    const text = renderMetrics()
    expect(text).toMatch(/^bff_requests_total [1-9]/m)
    expect(text).toMatch(/^bff_request_duration_seconds_sum \d+\.\d{6}$/m)
    expect(text).toMatch(/^bff_sheds_total\{reason="queue-full"\} 2$/m)
    expect(text).toMatch(/^bff_named_events_total\{name="auth_callback_completed"\} 1$/m)
    expect(text).toMatch(/^bff_named_events_total\{name="unnamed_event"\} 1$/m)
    expect(text).toMatch(/^bff_event_loop_lag_p99_seconds \d/m)
  })

  it('writes named events as JSON lines and rotates past the cap', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'obs-')), 'bff.jsonl')
    process.env.DASHBOARD_BFF_LOG_FILE = file
    recordNamedEvent('auth_callback_failed', { reason: 'x' })
    await flushNamedEvents()
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ 'event.action': 'auth_callback_failed', level: 'error', reason: 'x' })

    await writeFile(file, Buffer.alloc(25 * 1024 * 1024))
    recordNamedEvent('auth_callback_completed')
    await flushNamedEvents()
    expect((await stat(`${file}.1`)).size).toBe(25 * 1024 * 1024)
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ 'event.action': 'auth_callback_completed', level: 'info' })
  })

  it('writes structured events to stdout without a host log mount', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      recordNamedEvent('auth_callback_completed', { reason: 'ok' })
      await flushNamedEvents()
      expect(JSON.parse(log.mock.lastCall?.[0] as string)).toMatchObject({ 'event.action': 'auth_callback_completed', reason: 'ok' })
    } finally {
      log.mockRestore()
    }
  })
})
