// The entity drill-down reads (#221): the events-derived source and session
// reads, the source identity and network, the identity and campaign pages, the
// blocklist, and the queries no backend route serves yet. Every list failure must throw, never answer [];
// every unavailable query must throw without calling the backend at all.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { liveQuery } from './api'
import type { Backend } from './backend'
import { activeBlockIps, sessionSummaries } from './adapters/sources'
import fixtures from './__fixtures__/entity-reads.json'
import groups from './__fixtures__/entity-groups.json'

type Failure = { status: number }
type Route = unknown | Failure

/** Serves one body per path (longest prefix wins), and records each URL. */
function stub(routes: Record<string, Route>) {
  const calls: string[] = []
  const prefixes = Object.entries(routes).sort(([a], [b]) => b.length - a.length)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const path = new URL(url).pathname
      const match = prefixes.find(([prefix]) => path.startsWith(prefix))
      if (!match) throw new TypeError(`no fixture for ${path}`)
      const value = match[1]
      if (typeof value === 'object' && value !== null && 'status' in value && Object.keys(value).length === 1) {
        return new Response('boom', { status: (value as Failure).status })
      }
      return Response.json(value)
    }),
  )
  return calls
}

const params = (url: string) => Object.fromEntries(new URL(url).searchParams)
/** The live query, typed as the seam function it stands in for. */
const live = <TQuery extends keyof Backend>(name: TQuery): Backend[TQuery] => liveQuery(name, undefined) as Backend[TQuery]
/** The same, by name from a table: its arguments are checked by the table. */
const liveNamed = (name: string) => liveQuery(name, undefined) as (...args: unknown[]) => Promise<unknown>

beforeEach(() => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
})

describe('the events-derived reads', () => {
  it('reads a source\'s events from the events list, windowed by the page range', async () => {
    const calls = stub({ '/api/v1/events': fixtures.eventsIp })
    const events = await live('getSourceEvents')('203.0.113.4', '6h')
    expect(new URL(calls[0]).pathname).toBe('/api/v1/events')
    expect(params(calls[0])).toEqual({ offset: '0', size: '100', ip: '203.0.113.4', since: '6h' })
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ id: fixtures.eventsIp.rows[0].id, srcIp: '203.0.113.4', timestamp: fixtures.eventsIp.rows[0].time })
  })

  it('takes the event type from the row\'s kind (APIARY#3561), splitting a login by the sensor\'s own name', async () => {
    const base = fixtures.eventsIp.rows[0]
    const rows = [
      { ...base, id: 'k1', kind: 'login', record: { honeypot: { eventid: 'cowrie.login.success' } } },
      { ...base, id: 'k2', kind: 'login', record: { honeypot: { event: 'auth_attempt' } } },
      { ...base, id: 'k3', kind: 'download', record: { honeypot: { eventid: 'cowrie.session.file_download' } } },
      { ...base, id: 'k4', kind: 'http', record: { honeypot: {} } },
      { ...base, id: 'k5', record: { honeypot: { eventid: 'cowrie.command.input' } } },
    ]
    stub({ '/api/v1/events': { ...fixtures.eventsIp, rows } })
    const events = await live('getSourceEvents')('203.0.113.4', '24h')
    expect(events.map((e) => e.type)).toEqual(['login.success', 'login.failed', 'file.download', 'http.request', 'command.input'])
  })

  it('maps the page range "all" to a year, and an absent range to the 24-hour default', async () => {
    const calls = stub({ '/api/v1/events': fixtures.eventsIp })
    await live('getSourceEvents')('203.0.113.4', 'all')
    await live('getSourceEvents')('203.0.113.4')
    expect(params(calls[0]).since).toBe('365d')
    expect(params(calls[1]).since).toBe('24h')
  })

  it('builds the source timeline from the same read, one event item per row, newest first', async () => {
    stub({ '/api/v1/events': fixtures.eventsIp })
    const items = await live('getSourceTimeline')('203.0.113.4', '24h')
    expect(items.map((item) => item.kind)).toEqual(['event', 'event'])
    expect(items[0]).toMatchObject({ id: fixtures.eventsIp.rows[0].id, at: fixtures.eventsIp.rows[0].time, href: `/events/${fixtures.eventsIp.rows[0].id}` })
  })

  it('reads one session\'s events by session id, with the 365-day window', async () => {
    const calls = stub({ '/api/v1/events': fixtures.eventsSession })
    const events = await live('getSessionEvents')('ca4616fbf9f0')
    expect(params(calls[0])).toEqual({ offset: '0', size: '100', session: 'ca4616fbf9f0', since: '365d' })
    expect(events.map((e) => e.id)).toEqual(fixtures.eventsSession.rows.map((r) => r.id))
  })

  it('derives the session summaries from the events that carry a session id', async () => {
    stub({ '/api/v1/events': fixtures.eventsSession })
    const events = await live('getSessionEvents')('ca4616fbf9f0')
    const [session] = sessionSummaries(events)
    expect(session).toMatchObject({ id: 'ca4616fbf9f0', events: 3, sensors: ['cowrie'], last: '2026-09-30T19:25:19.795Z' })
    expect(session).not.toHaveProperty('recordingShasum')
  })

  it('reads a source\'s sessions from the server-side aggregation (APIARY#3557), with exact per-kind counts only when the events hold the whole session', async () => {
    const calls = stub({
      '/api/v1/events': fixtures.eventsSession,
      '/api/v1/sources/203.0.113.4/sessions': {
        total: 2,
        rows: [
          { session: 'ca4616fbf9f0', events: 3, first: '2026-09-30T19:25:00.000Z', last: '2026-09-30T19:25:19.795Z' },
          { session: 'older-session', events: 40, first: '2026-09-29T10:00:00.000Z', last: '2026-09-29T10:05:00.000Z' },
        ],
      },
    })
    const sessions = await live('getSourceSessions')('203.0.113.4', '7d')
    const aggregation = calls.find((url) => url.includes('/sessions'))!
    expect(params(aggregation)).toEqual({ range: '7d' })
    expect(sessions.map((s) => s.id)).toEqual(['ca4616fbf9f0', 'older-session'])
    // All three events of the first session are in the rows: exact counts.
    expect(sessions[0]).toMatchObject({ srcIp: '203.0.113.4', events: 3, sensors: ['cowrie'], first: '2026-09-30T19:25:00.000Z' })
    expect(typeof sessions[0].commands).toBe('number')
    // The second is past the event window: it is listed with its real event
    // count, and its per-kind counts are absent rather than a placeholder 0.
    expect(sessions[1]).toMatchObject({ events: 40, sensors: [] })
    expect(sessions[1]).not.toHaveProperty('logins')
    expect(sessions[1]).not.toHaveProperty('commands')
  })

  it('derives a source\'s sessions from its events for the range "all", which the aggregation does not take', async () => {
    const calls = stub({ '/api/v1/events': fixtures.eventsIp })
    expect(await live('getSourceSessions')('203.0.113.4', 'all')).toEqual([])
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/events'])
  })

  it('reads a payload\'s sessions and sources from the delivery aggregation, and its events from the events list', async () => {
    const calls = stub({
      '/api/v1/events': fixtures.eventsIp,
      '/api/v1/payloads/': {
        total: 120,
        events: [{ '@timestamp': '2026-10-01T00:00:00Z' }],
        sessions: [{ session: 's1', events: 7, first: '2026-10-01T00:00:00Z', last: '2026-10-01T00:01:00Z' }],
        sources: [{ key: '203.0.113.4', count: 100 }, { key: '198.51.100.7', count: 20 }],
      },
    })
    const delivery = await live('getPayloadDelivery')('d41d8cd98f00b204e9800998ecf8427e')
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/events', '/api/v1/payloads/d41d8cd98f00b204e9800998ecf8427e/delivery'])
    expect(params(calls.find((url) => url.includes('/events'))!)).toEqual({ offset: '0', size: '100', shasum: 'd41d8cd98f00b204e9800998ecf8427e', since: '365d' })
    expect(delivery.events).toHaveLength(2)
    expect(delivery.sources).toEqual([
      { id: '203.0.113.4', label: '203.0.113.4', count: 100 },
      { id: '198.51.100.7', label: '198.51.100.7', count: 20 },
    ])
    expect(delivery.sessions).toEqual([{ id: 's1', srcIp: '', sensors: [], first: '2026-10-01T00:00:00Z', last: '2026-10-01T00:01:00Z', events: 7 }])
  })

  it('derives a payload\'s delivery from the events when the delivery document 404s', async () => {
    stub({ '/api/v1/events': fixtures.eventsIp, '/api/v1/payloads/': { status: 404 } })
    const delivery = await live('getPayloadDelivery')('d41d8cd98f00b204e9800998ecf8427e')
    expect(delivery.sources).toEqual([{ id: '203.0.113.4', label: '203.0.113.4', count: 2 }])
    expect(delivery.sessions).toEqual([])
  })
})

describe('the single-entity reads', () => {
  it('reads a source\'s attacker identity, typed as the page entity', async () => {
    const calls = stub({ '/api/v1/sources/203.0.113.4/identities': fixtures.identity })
    const identity = await live('getSourceIdentity')('203.0.113.4')
    expect(new URL(calls[0]).pathname).toBe('/api/v1/sources/203.0.113.4/identities')
    expect(identity).toMatchObject({ id: fixtures.identity.id, ips: ['203.0.113.4'], destIps: 1, portsTouched: 1 })
    expect(identity).not.toHaveProperty('dest_ips')
  })

  it('answers null for an address with no identity: the 404 is the answer, not a failure', async () => {
    stub({ '/api/v1/sources/203.0.113.9/identities': { status: 404 } })
    expect(await live('getSourceIdentity')('203.0.113.9')).toBeNull()
  })

  it('reads a source\'s network document (APIARY#3557): the AS number, organization and country', async () => {
    const calls = stub({
      '/api/v1/sources/203.0.113.4/network': { ip: '203.0.113.4', asn: 64496, organization: 'Example Net', provider: 'hosting', country: 'NL', events: 12 },
      '/api/v1/sources': fixtures.sources,
      '/api/v1/campaigns': fixtures.campaignsEmpty,
    })
    const network = await live('getSourceNetwork')('203.0.113.4')
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/campaigns', '/api/v1/sources', '/api/v1/sources/203.0.113.4/network'])
    expect(network).toMatchObject({ cidr: '203.0.113.0/24', asn: 'AS64496', org: 'Example Net', country: 'NL' })
    expect(network!.neighbours.map((n) => n.ip)).toEqual(['203.0.113.5'])
  })

  it('falls back to the ip profile for a source\'s network when the network document 404s', async () => {
    const calls = stub({
      '/api/v1/sources/203.0.113.4/network': { status: 404 },
      '/api/v1/investigate/ip/': fixtures.ipProfile,
      '/api/v1/sources': fixtures.sources,
      '/api/v1/campaigns': fixtures.campaignsEmpty,
    })
    const network = await live('getSourceNetwork')('203.0.113.4')
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/campaigns', '/api/v1/investigate/ip/203.0.113.4', '/api/v1/sources', '/api/v1/sources/203.0.113.4/network'])
    expect(params(calls.find((url) => url.includes('/sources?'))!)).toEqual({ offset: '0', size: '1000' })
    expect(network).toMatchObject({ cidr: '203.0.113.0/24', org: fixtures.ipProfile.asn, country: fixtures.ipProfile.country })
    expect(network!.neighbours.map((n) => n.ip)).toEqual(['203.0.113.5'])
    expect(network).not.toHaveProperty('campaign')
    // The profile's `as_number` (APIARY#3696) names the AS.
    expect(network).toMatchObject({ asn: 'AS8560' })
  })

  it('answers null for a network whose address has no events', async () => {
    stub({ '/api/v1/sources/203.0.113.9/network': { status: 404 }, '/api/v1/investigate/ip/': { status: 404 }, '/api/v1/sources': fixtures.sources, '/api/v1/campaigns': fixtures.campaignsEmpty })
    expect(await live('getSourceNetwork')('203.0.113.9')).toBeNull()
  })

  it('reads an AS from its aggregation (APIARY#3557): organization, members, the AS\'s own events and first/last seen', async () => {
    const calls = stub({
      '/api/v1/investigate/asn/': { asn: 64496, organization: 'Example Net', provider: 'hosting', events: 512, sources_total: 2, first: '2026-09-01T00:00:00Z', last: '2026-10-01T00:00:00Z', sources: [{ key: '203.0.113.4', count: 500 }, { key: '203.0.113.5', count: 12 }] },
      '/api/v1/events': fixtures.eventsIp,
      '/api/v1/sources': fixtures.sources,
    })
    const asn = await live('getAsn')('64496')
    expect(new URL(calls[0]).pathname).toBe('/api/v1/investigate/asn/AS64496')
    expect(params(calls.find((url) => url.includes('/events'))!)).toMatchObject({ asn: '64496', since: '365d' })
    expect(asn).toMatchObject({ asn: 'AS64496', orgs: ['Example Net'] })
    expect(asn!.group.members.map((m) => m.ip).sort()).toEqual(['203.0.113.4', '203.0.113.5'])
    expect(asn!.group).toMatchObject({ totalMatches: 512, first: '2026-09-01T00:00:00Z', last: '2026-10-01T00:00:00Z' })
  })

  it('answers null for an AS with no events, and for an id that is not an AS number, without calling the backend for the latter', async () => {
    const calls = stub({ '/api/v1/investigate/asn/': { status: 404 } })
    expect(await live('getAsn')('AS64511')).toBeNull()
    expect(await live('getAsn')('Example Net')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('reads a session summary from its aggregation', async () => {
    stub({ '/api/v1/investigate/session/': { id: 's1', events: 9, first: '2026-10-01T00:00:00Z', last: '2026-10-01T00:02:00Z', sensors: [{ key: 'cowrie', count: 9 }], commands: [{ key: 'uname -a', count: 2 }], sources: [{ key: '203.0.113.4', count: 9 }] } })
    expect(await live('getSessionSummary')('s1')).toEqual({ id: 's1', srcIp: '203.0.113.4', sensors: ['cowrie'], first: '2026-10-01T00:00:00Z', last: '2026-10-01T00:02:00Z', events: 9 })
  })
})

describe('the identity and campaign pages', () => {
  const [listed, ...unlisted] = groups.memberIps
  const sources = { total_unique: 1, truncated: false, rows: [{ ip: listed, country: 'NL', events: 12, logins: 0, sessions: 0, sensors: ['zeek'], first: '2026-10-01T00:00:00Z', last: '2026-10-09T00:00:00Z' }] }

  it('builds an identity from its document, its events and a profile for every member', async () => {
    const calls = stub({
      '/api/v1/investigate/identity/': groups.identity,
      '/api/v1/events': groups.events,
      '/api/v1/sources': sources,
      '/api/v1/investigate/ip/': fixtures.ipProfile,
    })
    const entity = await live('getIdentity')(groups.identity.id)
    const paths = calls.map((url) => new URL(url).pathname)
    expect(paths[0]).toBe(`/api/v1/investigate/identity/${groups.identity.id}`)
    expect(params(calls.find((url) => url.includes('/events?'))!)).toEqual({ offset: '0', size: '100', ips: groups.memberIps.join(','), since: '365d' })
    expect(paths.filter((path) => path.startsWith('/api/v1/investigate/ip/'))).toHaveLength(unlisted.length)
    expect(entity!.identity).toMatchObject({ id: groups.identity.id, ips: groups.memberIps })
    expect(entity!.group.members).toHaveLength(groups.memberIps.length)
    expect(entity!.group.members[0]).toMatchObject({ ip: listed, country: 'NL', events: 12 })
    expect(entity!.group.totalMatches).toBe(groups.events.total)
    expect(entity!.group.events).toHaveLength(groups.events.rows.length)
    expect(entity!.group.tunnelConnections).toBe(0)
  })

  it('reads at most 50 members of a wider identity and drops a member the backend has no profile for', async () => {
    const wide = { ...groups.identity, ips: Array.from({ length: 80 }, (_, i) => `198.51.100.${i + 1}`) }
    const calls = stub({ '/api/v1/investigate/identity/': wide, '/api/v1/events': groups.events, '/api/v1/sources': sources, '/api/v1/investigate/ip/': { status: 404 } })
    const entity = await live('getIdentity')(groups.identity.id)
    expect(params(calls.find((url) => url.includes('/events?'))!).ips.split(',')).toHaveLength(50)
    expect(entity!.identity.ips).toHaveLength(80)
    expect(entity!.group.members).toEqual([])
  })

  it('answers null for an unknown identity, and throws when the events read fails', async () => {
    stub({ '/api/v1/investigate/identity/': { status: 404 } })
    expect(await live('getIdentity')('missing')).toBeNull()
    stub({ '/api/v1/investigate/identity/': groups.identity, '/api/v1/events': { status: 502 }, '/api/v1/sources': sources })
    await expect(live('getIdentity')(groups.identity.id)).rejects.toBeInstanceOf(ApiError)
  })

  it('builds a campaign from its document and the correlation of its /24', async () => {
    const calls = stub({ '/api/v1/investigate/campaign/': groups.campaign, '/api/v1/investigate/cidr/': groups.cidr })
    const entity = await live('getCampaign')('198.51.100.0/24')
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/investigate/campaign/198.51.100.0%2F24', '/api/v1/investigate/cidr/198.51.100.0%2F24'])
    expect(entity!.campaign).toMatchObject({ cidr: '198.51.100.0/24', score: groups.campaign.score, uniqueIps: groups.campaign.unique_ips })
    expect(entity!.group.members.map((m) => m.ip).sort()).toEqual(['198.51.100.73', '198.51.100.75'])
    expect(entity!.group.totalMatches).toBe(groups.cidr.correlation.total)
  })

  it('gives a campaign whose prefix has no events an empty group, and answers null for an unknown campaign', async () => {
    stub({ '/api/v1/investigate/campaign/': groups.campaign, '/api/v1/investigate/cidr/': { status: 404 } })
    const entity = await live('getCampaign')('198.51.100.0/24')
    expect(entity!.group).toMatchObject({ members: [], events: [], totalMatches: 0 })
    stub({ '/api/v1/investigate/campaign/': { status: 404 } })
    expect(await live('getCampaign')('192.0.2.0/24')).toBeNull()
    stub({ '/api/v1/investigate/campaign/': { status: 502 } })
    await expect(live('getCampaign')('192.0.2.0/24')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('the blocklist', () => {
  it('reads the block list and keeps only the blocks that hold now', async () => {
    const calls = stub({ '/api/v1/investigate/blocked-ips': fixtures.blockedEmpty })
    expect(await live('getBlockedIps')()).toEqual([])
    expect(new URL(calls[0]).pathname).toBe('/api/v1/investigate/blocked-ips')
  })

  it('applies the backend rule: blocked with no expiry or a future one, and nothing lapsed or unblocked', () => {
    const now = Date.parse('2026-10-09T12:00:00Z')
    const wire = {
      total: 4,
      rows: [
        { IP: '203.0.113.1', Blocked: true, BlockedBy: 'ops', BlockedAt: '2026-10-01T00:00:00Z', ExpiresAt: null },
        { IP: '203.0.113.2', Blocked: true, BlockedBy: 'ops', BlockedAt: '2026-10-01T00:00:00Z', ExpiresAt: '2026-10-20T00:00:00Z' },
        { IP: '203.0.113.3', Blocked: true, BlockedBy: 'ops', BlockedAt: '2026-09-01T00:00:00Z', ExpiresAt: '2026-10-01T00:00:00Z' },
        { IP: '203.0.113.4', Blocked: false, ExpiresAt: null },
      ],
    }
    expect(activeBlockIps(wire, now)).toEqual(['203.0.113.1', '203.0.113.2'])
  })
})

describe('a list read that fails throws, and never answers empty', () => {
  it.each([
    ['getSourceEvents', ['203.0.113.4', '24h'], '/api/v1/events'],
    ['getSourceTimeline', ['203.0.113.4', '24h'], '/api/v1/events'],
    ['getSourceSessions', ['203.0.113.4', '24h'], '/api/v1/events'],
    ['getSessionEvents', ['ca4616fbf9f0'], '/api/v1/events'],
    ['getPayloadDelivery', ['d41d8cd98f00b204e9800998ecf8427e'], '/api/v1/events'],
    ['getBlockedIps', [], '/api/v1/investigate/blocked-ips'],
  ] as const)('%s throws on a 404 and on a 502', async (name, args, path) => {
    stub({ [path]: { status: 404 } })
    await expect(liveNamed(name)(...args)).rejects.toMatchObject({ kind: 'unavailable' })
    stub({ [path]: { status: 502 } })
    await expect(liveNamed(name)(...args)).rejects.toBeInstanceOf(ApiError)
  })

  it('throws when the source list behind a network read is missing', async () => {
    stub({ '/api/v1/investigate/ip/': fixtures.ipProfile, '/api/v1/sources': { status: 404 }, '/api/v1/campaigns': fixtures.campaignsEmpty })
    await expect(live('getSourceNetwork')('203.0.113.4')).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('the queries no backend route serves yet', () => {
  const UNAVAILABLE: Array<[string, unknown[], string]> = [
    ['getIoc', ['cve', 'CVE-1999-0001'], 'Xore/APIARY#3554'],
    ['getIocCatalog', [], 'Xore/APIARY#3554'],
    ['getEntityTimeline', ['asn', 'AS64496', 'all'], 'Xore/APIARY#3554'],
    ['getRelated', ['identity', 'c5fd0398517e4871b8fc47e0f4aa0d99'], 'Xore/APIARY#3554'],
    ['getFacets', ['events', {}], 'Xore/APIARY#3524'],
  ]

  it.each(UNAVAILABLE)('%s throws unavailable without calling the backend', async (name, args, gap) => {
    const calls = stub({ '/': fixtures.campaignsEmpty })
    const error = await liveNamed(name)(...args).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'unavailable', endpoint: name })
    expect((error as ApiError).detail).toContain(gap)
    expect(calls).toHaveLength(0)
  })
})
