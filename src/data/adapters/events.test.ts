import { describe, expect, it } from 'vitest'
import { toHoneypotEvent } from './events'
import type { EventRow } from '../contracts/events'

// APIARY#3561: the row carries src_port, city, severity, kind and techniques,
// each only when present. A backend older than that sends none of them.

const pivots: EventRow['pivots'] = {
  persona: '', site: '', asset: '', fingerprint: '', fingerprint_kind: '', command: '', user: '', pass: '', path: '', shasum: '',
  asn: '', org: '', provider: '', alert: '', category: '', payload_class: '', tty_replay: '', ics_severity: '',
}

const row = (over: Partial<EventRow> = {}): EventRow => ({
  id: 'e1', time: '2026-10-09T15:40:00Z', sensor: 'suricata', src_ip: '203.0.113.4', country: 'DE', port: '443', proto: 'tls', detail: 'ET SCAN', session: '',
  pivots, record: {}, ...over,
})

describe('toHoneypotEvent', () => {
  it('carries the APIARY#3561 fields when the row has them', () => {
    const event = toHoneypotEvent(row({ src_port: 51234, city: 'Berlin', severity: 'medium', kind: 'alert', techniques: ['T1190', ''] }))
    expect(event).toMatchObject({ srcPort: 51234, city: 'Berlin', severity: 'medium', techniques: ['T1190'] })
  })

  it('leaves them absent on an older row, never a placeholder', () => {
    const event = toHoneypotEvent(row())
    expect(event).not.toHaveProperty('srcPort')
    expect(event.city).toBeUndefined()
    expect(event.severity).toBeUndefined()
    expect(event.techniques).toEqual([])
  })

  it('reads a zero source port as absent', () => {
    expect(toHoneypotEvent(row({ src_port: 0 }))).not.toHaveProperty('srcPort')
  })

  it('falls back to the DNP3 rating when the row carries no severity of its own', () => {
    expect(toHoneypotEvent(row({ pivots: { ...pivots, ics_severity: 'critical' } })).severity).toBe('critical')
  })
})
