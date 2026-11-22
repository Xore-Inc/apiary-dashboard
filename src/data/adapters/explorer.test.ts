// Events & sessions slice adapters: one realistic wire fixture per endpoint,
// mapped to the page types the explorer, commands, history, event, session,
// recordings and search pages already render. Fixtures are typed against
// ../contracts so a field the backend renamed fails the compiler, not a
// page in production.
import { describe, expect, it } from 'vitest'
import type { EventRow } from '../contracts/events'
import type { EventPageWire, FilterValuesWire, ReplayWire, RecordingWire, RecordingsPageWire, SearchResultWire, SessionDetailWire } from '../contracts/explorer'
import type { EventFilters } from '../types'
import {
  commandsQuery,
  eventDetail,
  eventRecord,
  eventRelations,
  eventRows,
  eventsPage,
  eventsQuery,
  eventsQueryWindowed,
  filterFacets,
  filterValues,
  recording,
  recordingRows,
  recordingSourceIpQuery,
  replay,
  replayDetail,
  searchGroups,
  sessionDetail,
} from './explorer'

const pivots = {
  persona: '', site: '', asset: '', fingerprint: 'curl/8.5.0', fingerprint_kind: 'User-Agent',
  command: 'uname -a', user: 'root', pass: 'toor', path: '', shasum: '',
  asn: 'AS64496', org: 'Example Transit', provider: 'hosting', alert: '',
  category: '', payload_class: '', tty_replay: '', ics_severity: '',
}

const row: EventRow = {
  src_ip_claimed: '',
  id: 'ev_9f2c1a',
  time: '2026-10-04T20:41:03Z',
  sensor: 'cowrie',
  src_ip: '203.0.113.42',
  country: 'NL',
  port: '22',
  proto: 'ssh',
  detail: 'command.input: uname -a',
  session: 'sess-77a1',
  pivots,
  record: { honeypot: { eventid: 'cowrie.command.input', input: 'uname -a', username: 'root' }, network: { protocol: 'ssh' } },
}

const page = { total: 1, offset: 0, rows: [row] }

const values: FilterValuesWire = {
  sensors: ['cowrie', 'suricata'],
  countries: ['NL', 'US'],
  cities: ['Amsterdam'],
  protos: ['ssh', 'http'],
  ports: ['22', '80', 'not-a-port'],
  kinds: ['login', 'command'],
}

const eventPageWire: EventPageWire = {
  id: 'ev_9f2c1a', index: 'honeypot-v2-2026.10.04', time: row.time, sensor: 'cowrie', src_ip: row.src_ip,
  session: 'sess-77a1', community_id: '1:abcDEF0123456789', hashes: ['d41d8cd98f00b204e9800998ecf8427e'],
  record: { honeypot: { eventid: 'cowrie.command.input' } },
  session_events: { key: 'sess-77a1', total: 12, rows: [{ time: row.time, sensor: 'cowrie', src_ip: row.src_ip, detail: row.detail }] },
  flow_events: { key: '', total: 0, rows: [] },
  source_events: { key: '203.0.113.42', total: 340, rows: [] },
  flow_link: null,
}

const sessionWire: SessionDetailWire = {
  id: 'sess-77a1', ip: '203.0.113.42', country: 'NL',
  first: '2026-10-04T20:00:00Z', last: '2026-10-04T20:41:03Z', total: 2,
  sensors: [{ key: 'cowrie', count: 2 }],
  commands: [{ key: 'uname -a', count: 1 }],
  credentials: [{ key: 'root / toor', count: 1 }],
  payloads: [],
  techniques: [{ id: 'T1059.004', name: 'Unix Shell', domain: 'Enterprise', evidence: 'command captured', count: 1, url: 'https://attack.mitre.org/techniques/T1059/004/' }],
  sequences: [{ name: 'ADB botnet-recruitment device fingerprinting', severity: 'high', summary: '…' }],
  events: [row],
}

const recordingWire: RecordingWire = {
  when: '2026-10-04T20:41:03Z', src_ip: '203.0.113.42', country: 'NL',
  session: 'sess-77a1', shasum: 'ab12cd34', size_bytes: 8192, duration_ms: 42_000,
}

const replayWire: ReplayWire = {
  shasum: 'ab12cd34', size_bytes: 8192, imported_at: '2026-10-04T20:42:00Z',
  frames: 118, duration_seconds: 41.5, transcript: 'Linux honeypot 6.1\r\n', ttylog_base64: 'AAAAAA==',
}

const searchWire: SearchResultWire = {
  query: 'uname', redirect: null, total: 2,
  groups: [
    { title: 'Commands', hits: [{ label: 'uname -a', count: 12, url: '/events?cmd=uname%20-a' }], more: 340, more_url: '/history?q=uname' },
    { title: 'Suricata signatures', hits: [{ label: 'ET SCAN Nmap', count: 4, url: '/events' }], more: 0, more_url: '/history?q=uname' },
  ],
}

describe('explorer adapters', () => {
  it('maps GET /events rows through the shared event adapter', () => {
    const out = eventRows(page)
    expect(out.total).toBe(1)
    expect(out.rows[0]).toMatchObject({ id: 'ev_9f2c1a', timestamp: row.time, srcIp: '203.0.113.42', dstPort: 22, protocol: 'ssh', sessionId: 'sess-77a1', command: 'uname -a', username: 'root', provider: 'hosting' })
  })

  it('fills the explorer envelope', () => {
    const out = eventsPage(page)
    expect(out).toMatchObject({ total: 1, offset: 0 })
    expect(out.rows).toHaveLength(1)
  })

  it('reads the offset the response reports, not the one requested', () => {
    // events.rs clamps offset to 10_000 - size, so a request for 9,999 at
    // size 25 comes back as 9,975 and paging must follow the response.
    expect(eventRows({ total: 0, offset: 9975, rows: [] }).offset).toBe(9975)
  })

  it('sends page filters as the params events.rs declares, comma lists narrowed to one value', () => {
    const filters: EventFilters = { ip: '203.0.113.42,198.51.100.4', sensor: 'cowrie', country: 'NL', port: 22, since: '24h' }
    expect(eventsQuery(filters)).toEqual({ offset: 0, ip: '203.0.113.42', sensor: 'cowrie', country: 'NL', port: '22', since: '24h' })
  })

  it('omits an absent filter entirely rather than sending an empty param', () => {
    expect(eventsQuery()).toEqual({ offset: 0 })
    expect(eventsQueryWindowed({}, { offset: 50, limit: 50 })).toEqual({ offset: 50, size: 50 })
  })

  it('pins the commands list to the exact honeypot.event term', () => {
    expect(commandsQuery()).toEqual({ kind: 'command', offset: 0, size: 25 })
    expect(commandsQuery({ offset: 25, limit: 25 })).toEqual({ kind: 'command', offset: 25, size: 25 })
  })

  it('widens the recording attribution window past the endpoint default', () => {
    expect(recordingSourceIpQuery('ab12cd34')).toEqual({ kind: 'cowrie.log.closed', shasum: 'ab12cd34', offset: 0, size: 1, since: '365d' })
  })

  it('maps GET /filter-values, dropping a non-numeric port rather than yielding NaN', () => {
    expect(filterValues(values)).toEqual({ sensors: ['cowrie', 'suricata'], countries: ['NL', 'US'], protos: ['ssh', 'http'], ports: [22, 80] })
    const facets = filterFacets(values)
    expect(facets.sensors).toEqual([{ value: 'cowrie', count: 0 }, { value: 'suricata', count: 0 }])
    expect(facets.kinds).toEqual([{ value: 'login', count: 0 }, { value: 'command', count: 0 }])
  })

  it('maps GET /event/{id} onto the row the caller already holds', () => {
    const reading = { what: '', columns: [], artefacts: [] }
    const detail = eventDetail(eventPageWire, row, reading)
    expect(detail.event.id).toBe('ev_9f2c1a')
    expect(detail.event.fields).toMatchObject({ input: 'uname -a' })
    expect(detail.hashes).toEqual(['d41d8cd98f00b204e9800998ecf8427e'])
    expect(detail.reading).toBe(reading)
  })

  it('leaves the three relation lists empty — the wire rows are samples, not events', () => {
    const relations = eventRelations(eventPageWire)
    expect(relations).toEqual({
      session: { key: 'sess-77a1', total: 12 },
      flow: { key: '', total: 0 },
      source: { key: '203.0.113.42', total: 340 },
      flowLink: null,
    })
    const detail = eventDetail(eventPageWire, row, { what: '', columns: [], artefacts: [] })
    expect([detail.session, detail.connection, detail.source]).toEqual([[], [], []])
    expect(eventRecord(eventPageWire)).toEqual({ honeypot: { eventid: 'cowrie.command.input' } })
  })

  it('maps GET /sessions/{id}, dropping the sequence detections the page has no field for', () => {
    const out = sessionDetail(sessionWire)
    expect(out).toMatchObject({ id: 'sess-77a1', srcIp: '203.0.113.42', country: 'NL', first: sessionWire.first, last: sessionWire.last })
    expect(out.sensors).toEqual([{ id: 'cowrie', label: 'cowrie', count: 2 }])
    expect(out.credentials).toEqual([{ id: 'root / toor', label: 'root / toor', count: 1 }])
    expect(out.techniques).toEqual([{ id: 'T1059.004', name: 'Unix Shell', tactic: 'Enterprise', events: 1 }])
    expect(out.events).toHaveLength(1)
  })

  it('maps a recording row, keying it on the shasum it has no other id for', () => {
    expect(recording(recordingWire)).toEqual({ id: 'ab12cd34', when: recordingWire.when, srcIp: '203.0.113.42', country: 'NL', session: 'sess-77a1', shasum: 'ab12cd34', sizeBytes: 8192, durationMs: 42_000 })
  })

  it('omits an unattributed recording address rather than rendering an empty one', () => {
    const unattributed = recording({ ...recordingWire, src_ip: '', country: '' })
    expect(unattributed.srcIp).toBeUndefined()
    expect(unattributed.country).toBeUndefined()
  })

  it('maps the recordings page and a replay, keeping the frame stream for the player', () => {
    const rows = recordingRows({ total: 1, rows: [recordingWire] } satisfies RecordingsPageWire)
    expect(rows).toHaveLength(1)
    expect(replay(replayWire)).toEqual({ shasum: 'ab12cd34', frames: 118, durationSeconds: 41.5, transcript: replayWire.transcript, ttylog: 'AAAAAA==' })
    expect(replay({ ...replayWire, ttylog_base64: '' })).not.toHaveProperty('ttylog')
    expect(replay(null)).toBeNull()
  })

  it('builds the replay detail without inventing an attacker block', () => {
    const detail = replayDetail(replayWire, [recording(recordingWire)])
    expect(detail?.replay.frames).toBe(118)
    expect(detail?.sessions).toHaveLength(1)
    expect(detail?.attacker).toBeNull()
  })

  it('maps the grouped search envelope, keeping the overflow only when there is one', () => {
    const groups = searchGroups(searchWire)
    expect(groups[0]).toEqual({
      id: 'commands', title: 'Commands', total: 1,
      items: [{ label: 'uname -a', detail: '12', href: '/events?cmd=uname%20-a' }],
      moreHref: '/history?q=uname',
    })
    expect(groups[1].moreHref).toBeUndefined()
  })

  it('maps an empty search result to no groups', () => {
    expect(searchGroups({ query: '', redirect: null, groups: [], total: 0 })).toEqual([])
  })
})