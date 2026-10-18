import { describe, expect, it } from 'vitest'
import { sourceHref } from './AgentCampaign'

const event = { eventId: 'ev_1', sourceIndex: 'honeypot-v2-2026.10.14', timestamp: '2026-10-14T09:00:00Z', matchedRules: [] }
const query = (href: string) => new URLSearchParams(href.split('?')[1]).get('q')

describe('sourceHref', () => {
  it('pins both the event id and its index', () => {
    expect(query(sourceHref(event))).toBe('_id:"ev_1" AND _index:"honeypot-v2-2026.10.14"')
  })

  it('falls back to the id alone for an event stored before the index was recorded', () => {
    expect(query(sourceHref({ ...event, sourceIndex: '' }))).toBe('_id:"ev_1"')
  })
})
