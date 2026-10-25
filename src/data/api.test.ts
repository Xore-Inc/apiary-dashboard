// The real backend behind the events & sessions slice (#75): the request
// builders, the response handling against a fixture per endpoint, and the
// states a failed fetch must produce.
//
// The regression this file exists for: a failed fetch rendering as an EMPTY
// LIST rather than an error. An events page with no rows reads as a quiet
// fleet, and an operator cannot tell that from a backend that is down — so
// every failure path here asserts an ApiError, and the empty assertions are
// about a body the backend really sends, never about a failed call.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { isLiveBackend, liveQuery, liveQueryNames } from './api'
import { commandsQuery, eventsQuery, recordingSourceIpQuery } from './adapters/explorer'
import type { EventPageWire, FilterValuesWire, RecordingsPageWire, ReplayWire, SearchResultWire, SessionDetailWire } from './contracts/explorer'
import type { EventRow } from './contracts/events'
import type { CorrelationWire, IpProfileWire, SourcesPageWire } from './contracts/sources'
import type { Backend } from './backend'
import { rememberActor } from '#/server/actorAssertion'

/** One wire row, as events.rs's `row_from_hit` builds it. */
/** Reports writes run the read-only guard first, so `calls` is offset by the
 * `/api/v1/config` read every mutation makes before it writes. */
const WRITE_AT = 1
const pivots = {
  persona: '', site: '', asset: '', fingerprint: 'curl/8.5.0', fingerprint_kind: 'User-Agent',
  command: 'uname -a', user: 'root', pass: 'toor', path: '', shasum: '',
  asn: 'AS64496', org: 'Example Transit', provider: 'hosting', alert: '', category: '',
  payload_class: '', tty_replay: '', ics_severity: '',
}

const row: EventRow = {
  src_ip_claimed: '', id: 'ev_9f2c1a', time: '2026-10-04T20:41:03Z', sensor: 'cowrie',
  src_ip: '203.0.113.42', country: 'NL', port: '22', proto: 'ssh',
  detail: 'command.input: uname -a', session: 'sess-77a1', pivots,
  record: { honeypot: { eventid: 'cowrie.command.input', input: 'uname -a' }, network: { protocol: 'ssh' } },
}

const page = { total: 1, offset: 0, rows: [row], fingerprint_ips: null }
const values: FilterValuesWire = { sensors: ['cowrie'], countries: ['NL'], cities: ['Amsterdam'], protos: ['ssh'], ports: ['22'], kinds: ['command'] }
const sessionWire: SessionDetailWire = {
  id: 'sess-77a1', ip: '203.0.113.42', country: 'NL', first: '2026-10-04T20:00:00Z', last: '2026-10-04T20:41:03Z',
  total: 1, sensors: [{ key: 'cowrie', count: 1 }], commands: [{ key: 'uname -a', count: 1 }], credentials: [], payloads: [],
  techniques: [], sequences: [], events: [row],
}
const eventPageWire: EventPageWire = {
  id: 'ev_9f2c1a', index: 'honeypot-v2-2026.10.04', time: row.time, sensor: 'cowrie', src_ip: row.src_ip,
  session: 'sess-77a1', community_id: '1:abc', hashes: ['d41d8cd98f00b204e9800998ecf8427e'], record: row.record,
  session_events: { key: 'sess-77a1', total: 12, rows: [] }, flow_events: { key: '', total: 0, rows: [] },
  source_events: { key: '203.0.113.42', total: 340, rows: [] }, flow_link: null,
}
const recordingPage: RecordingsPageWire = {
  total: 1,
  rows: [{ when: row.time, src_ip: row.src_ip, country: 'NL', session: 'sess-77a1', shasum: 'ab12cd34', size_bytes: 8192, duration_ms: 42_000 }],
}
const replayWire: ReplayWire = {
  shasum: 'ab12cd34', size_bytes: 8192, imported_at: row.time, frames: 118, duration_seconds: 41.5,
  transcript: 'Linux honeypot 6.1\r\n', ttylog_base64: 'AAAAAA==',
}
const searchWire: SearchResultWire = {
  query: 'uname', redirect: null, total: 1,
  groups: [{ title: 'Commands', hits: [{ label: 'uname -a', count: 12, url: '/events?cmd=uname%20-a' }], more: 340, more_url: '/history?q=uname' }],
}

/** Serves one body per path, and records the URLs it was asked for. The
 * longest matching prefix wins, so a fixture set does not have to be written
 * in path order — `/api/v1/config` and `/api/v1/config/history` are both
 * real, and which one answers must not depend on object key order. */
function stub(responses: Record<string, unknown | (() => never)>) {
  const calls: string[] = []
  const prefixes = Object.entries(responses).sort(([a], [b]) => b.length - a.length)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const parsed = new URL(url)
      // A windowed store read (`q`) can be given its own fixture under `<path>#q`.
      const target = parsed.searchParams.has('q') ? `${parsed.pathname}#q` : parsed.pathname
      const body = prefixes.find(([prefix]) => target.startsWith(prefix))
      if (!body) throw new TypeError(`no fixture for ${target}`)
      const value = body[1]
      if (typeof value === 'function') return value()
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}

const fail = (status: number, body = 'boom', headers: Record<string, string> = {}) => () =>
  new Response(body, { status, headers })

/** The live query, with BACKEND_URL set as the opt-in, typed as the seam
 * function it stands in for — so a signature drift in queries.impl.ts fails
 * the compiler here rather than at the page. */
const live = <TQuery extends keyof Backend>(name: TQuery): Backend[TQuery] => {
  process.env.BACKEND_URL = 'http://backend.test'
  return liveQuery(name, undefined) as Backend[TQuery]
}

beforeEach(() => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
})

describe('which queries the real backend answers', () => {
  it('names only the wired slices, leaving the rest to the mock', () => {
    expect(liveQueryNames().sort()).toEqual(
      [
        // events & sessions (#75)
        'getCommands',
        'getEventDetail',
        'getEvents',
        'getRecordings',
        'getReplayDetail',
        'getSessionDetail',
        'getSessionEvents',
        'searchAll',
        'searchHistory',
        // settings, preferences and shell (#81)
        'getMail',
        'getPreferences',
        'getProblemReports',
        'getSettings',
        'getShellConfig',
        'getSessionUser',
        'rollbackConfig',
        'runServiceAction',
        'saveConfigSection',
        'savePreferences',
        'setProblemStatus',
        'submitProblemReport',
        'validateConfig',
        // evidence & analysis (#78)
        'abortGpuJob',
        'getAnalysisResults',
        'getAnalyzerCatalog',
        'getArtifacts',
        'getArtifactFile',
        'getCapeRun',
        'getCapeRuns',
        'getGithubAnalyses',
        'getGithubAnalysis',
        'getGhidraAnalysis',
        'getPayloadAnalysis',
        'getPayloads',
        'getRevDeckRun',
        'getRevDeckRuns',
        'getSandboxLiveStatus',
        'getSandboxRun',
        'queuePayloadAction',
        'setRunChild',
        'startAnalysisRun',
        // sources & correlation (#76)
        'getAttackers',
        'getAsn',
        'getBlockedIps',
        'getCampaign',
        'getCluster',
        'getEntityTimeline',
        'getFacets',
        'getIdentity',
        'getIdentityFusion',
        'getInfraClusters',
        'getIoc',
        'getIocCatalog',
        'getIpProfile',
        'getKillChain',
        'getNetwork',
        'getNetworkCampaigns',
        'getPayloadDelivery',
        'getRelated',
        'getSourceEvents',
        'getSourceIdentity',
        'getSourceNetwork',
        'getSourceProfiles',
        'getSourceSessions',
        'getSourceTimeline',
        'resolveHash',
        'setIpBlocked',
        // operations (#77)
        'acknowledgeAllAlerts',
        'getAlertDetail',
        'getAlerts',
        'getDeadLetters',
        'getOpenAlertCount',
        'getSensorCatalog',
        'getSensorDetail',
        'getSourceHealth',
        'getTopology',
        'purgeDeadLetters',
        'setAlertsAcknowledged',
        // tools (#80)
        'createCanarytoken',
        'getCanarytokens',
        'getCredentials',
        'linkCredentialToken',
        'provisionCredential',
        'rotateCredential',
        // reports (#79)
        'deleteGeneratedReport',
        'deleteReportDefinition',
        'generatePayloadReport',
        'generateReport',
        'generateReportFrom',
        'getReports',
        'previewReport',
        'saveReportDefinition',
        // monitor (#74)
        'acknowledgeAllAnomalies',
        'acknowledgeAnomalies',
        'getAgentCampaign',
        'getAgentCampaigns',
        'getAuthEvents',
        'getLlmAnalysis',
        'getLlmAnalyses',
        'getAnomaly',
        'getMlAnomalies',
        'getOverview',
        'getOverviewViews',
        'semanticSearch',
        'setAnomalyDisposition',
      ].sort(),
    )
  })

  it('answers nothing without BACKEND_URL — the mock stays the default', () => {
    delete process.env.BACKEND_URL
    expect(isLiveBackend()).toBe(false)
    expect(liveQuery('getEvents', undefined)).toBeUndefined()
    process.env.BACKEND_URL = '   '
    expect(isLiveBackend()).toBe(false)
  })

  it('answers savePreferences live: the write diffs the stored document', () => {
    expect(liveQuery('savePreferences', undefined)).toBeTypeOf('function')
  })

  it('applies the same authorization decision the mock does', async () => {
    stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    const viewer = { id: 'u', name: 'A', email: 'a@example.test', roles: ['viewer' as const] }
    expect(await liveQuery('getEvents', viewer)!({})).toMatchObject({ total: 1 })
    // Nobody signed in is refused the same way the mock refuses them, before
    // any fetch — the live path is not a way around the guard.
    await expect(liveQuery('getEvents', null)!({})).rejects.toThrow(ApiError)
  })
})

describe('the requests it builds', () => {
  it('sends every page filter as the param events.rs declares', async () => {
    const calls = stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    await live('getEvents')({ ip: '203.0.113.42', sensor: 'cowrie', country: 'NL', since: '24h', offset: 0, limit: 25 })
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/api/v1/events')
    expect(Object.fromEntries(url.searchParams)).toEqual({ offset: '0', size: '25', ip: '203.0.113.42', sensor: 'cowrie', country: 'NL', since: '24h' })
  })

  it('asks the endpoint default page size when the caller sets no limit', async () => {
    // events.rs defaults `size` to 25 and clamps it to 100; an absent limit
    // is not an unbounded page.
    const calls = stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    await live('getEvents')({})
    expect(new URL(calls[0]).searchParams.has('size')).toBe(false)
  })

  it('narrows a comma list to its first value, and drops the params the API has no field for', async () => {
    // `ips` is the wire's only multi-valued address parameter and no page
    // filter holds it, so `?ip=a,b` narrows to `a` — a documented loss the
    // adapter records, not a silent mangling.
    const calls = stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    await live('getEvents')({ ip: '203.0.113.42,198.51.100.4' })
    const params = new URL(calls[0]).searchParams
    expect(params.get('ip')).toBe('203.0.113.42')
    expect(params.has('ips')).toBe(false)
    // A filter the page can set that events.rs does not declare must not go
    // on the wire at all: an undeclared param is silently ignored there, so
    // sending one narrows nothing and reads as "the filter is ignored".
    expect(eventsQuery({ provider: 'hosting' }).provider).toBe('hosting')
    expect(Object.keys(eventsQuery({}))).toEqual(['offset'])
  })

  it('pages with the offset the response reports, not the one requested', async () => {
    stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    // events.rs clamps offset to 10_000 - size.
    const out = await live('getEvents')({ offset: 9999, limit: 25 })
    expect(out.offset).toBe(0)
    const clamped = await (async () => {
      stub({ '/api/v1/events': { ...page, offset: 9975 }, '/api/v1/filter-values': values })
      return live('getEvents')({ offset: 9999, limit: 25 })
    })()
    expect(clamped.offset).toBe(9975)
  })

  it('pins the commands list to the exact honeypot.event term, as the backend own CSV export does', async () => {
    // Verified against exports.rs commands_csv, which pins q.kind = "command"
    // and renders "the same events?kind=command scope commands.tsx renders".
    const calls = stub({ '/api/v1/events': page })
    await live('getCommands')({ offset: 25, limit: 25 })
    expect(Object.fromEntries(new URL(calls[0]).searchParams)).toEqual({ kind: 'command', offset: '25', size: '25' })
    expect(commandsQuery()).toEqual({ kind: 'command', offset: 0, size: 25 })
  })

  it('widens the recording attribution window past the endpoint 10-day default', async () => {
    // since_to_range accepts only non-empty, <=8 chars, all ASCII
    // alphanumeric. '365d' is four, so it survives; '1h30m' would not.
    expect(recordingSourceIpQuery('ab12cd34').since).toBe('365d')
    const calls = stub({ '/api/v1/events': page })
    await live('searchHistory')('uname', { offset: 0, limit: 50 })
    expect(Object.fromEntries(new URL(calls[0]).searchParams)).toEqual({ offset: '0', size: '50', q: 'uname', since: '90d' })
  })

  it('sends the service token as a header, never in the URL', async () => {
    const calls = stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    await live('getEvents')({})
    expect(calls[0]).not.toContain('test-token')
    const fetchMock = vi.mocked(globalThis.fetch)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-service-token': 'test-token' })
  })
})

describe('the responses it maps', () => {
  it('maps the explorer page, filling only what the row cannot carry', async () => {
    stub({ '/api/v1/events': page, '/api/v1/filter-values': values })
    const out = await live('getEvents')({})
    expect(out).toMatchObject({ total: 1, values: { sensors: ['cowrie'], countries: ['NL'], ports: [22] } })
    expect(out.rows[0]).toMatchObject({ id: 'ev_9f2c1a', srcIp: '203.0.113.42', dstPort: 22, command: 'uname -a' })
    // The gap fields the seam fills. The row carries no severity, source
    // port or city, so those are absent: never a placeholder.
    expect(out.rows[0]).toMatchObject({ type: 'command.input', eventName: 'cowrie.command.input', techniques: [] })
    expect(out.rows[0].severity).toBeUndefined()
    expect(out.rows[0].srcPort).toBeUndefined()
    expect(out.rows[0].city).toBeUndefined()
    expect(out.rows[0].organization).toBeUndefined()
  })

  it('maps ics_severity to severity, and leaves severity absent on every other row', async () => {
    for (const ics of ['critical', 'high'] as const) {
      stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, ics_severity: ics } }] }, '/api/v1/filter-values': values })
      expect((await live('getEvents')({})).rows[0]).toMatchObject({ severity: ics, icsSeverity: ics })
    }
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, ics_severity: '' } }] }, '/api/v1/filter-values': values })
    expect((await live('getEvents')({})).rows[0].severity).toBeUndefined()
  })

  it('leaves provider and network enrichment absent when the row does not carry them', async () => {
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, provider: '', asn: '', org: '' } }] }, '/api/v1/filter-values': values })
    const [event] = (await live('getEvents')({})).rows
    expect(event).toMatchObject({ country: 'NL', srcIp: '203.0.113.42' })
    expect(event.provider).toBeUndefined()
    expect(event.asn).toBeUndefined()
    expect(event.org).toBeUndefined()
    // A class the page does not know is absent too, not rounded to `network`.
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, provider: 'martian' } }] }, '/api/v1/filter-values': values })
    expect((await live('getEvents')({})).rows[0].provider).toBeUndefined()
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, provider: 'hosting' } }] }, '/api/v1/filter-values': values })
    expect((await live('getEvents')({})).rows[0].provider).toBe('hosting')
  })

  it('classifies the kind off the sensor own event name, and an IDS alert off the signature', async () => {
    const kinds: Record<string, string> = {
      'cowrie.login.failed': 'login.failed',
      'cowrie.login.success': 'login.success',
      'cowrie.command.input': 'command.input',
      'cowrie.file.download': 'file.download',
      connect: 'connection',
    }
    for (const [eventid, type] of Object.entries(kinds)) {
      stub({ '/api/v1/events': { ...page, rows: [{ ...row, record: { honeypot: { eventid } } }] }, '/api/v1/filter-values': values })
      const out = await live('getEvents')({})
      expect(out.rows[0].type, eventid).toBe(type)
    }
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, pivots: { ...pivots, alert: 'ET SCAN Nmap' } }] }, '/api/v1/filter-values': values })
    expect((await live('getEvents')({})).rows[0].type).toBe('ids.alert')
    // An unrecognised sensor event falls to `connection`, the one kind every
    // honeypot row is certain of, rather than a protocol the row does not show.
    stub({ '/api/v1/events': { ...page, rows: [{ ...row, record: { honeypot: { event: 'icmp_echo_reply' } } }] }, '/api/v1/filter-values': values })
    expect((await live('getEvents')({})).rows[0].type).toBe('connection')
  })

  it('maps the detail endpoint onto its own fields, without inventing the row it does not serve', async () => {
    stub({ '/api/v1/event/': eventPageWire })
    const out = await live('getEventDetail')('ev_9f2c1a')
    expect(out).toMatchObject({ hashes: ['d41d8cd98f00b204e9800998ecf8427e'], recordingShasum: undefined })
    expect(out!.event).toMatchObject({ id: 'ev_9f2c1a', sensor: 'cowrie', srcIp: '203.0.113.42', dstPort: 0 })
    expect(out!.event.summary).toBeUndefined()
    expect(out!.reading).toMatchObject({ what: expect.any(String) })
    // The relation lists stay empty: the wire rows are four-field samples.
    expect([out!.session, out!.connection, out!.source]).toEqual([[], [], []])
  })

  it('maps the session bundle, dropping the sequences the page has no field for', async () => {
    stub({ '/api/v1/sessions/': sessionWire })
    const out = await live('getSessionDetail')('sess-77a1')
    expect(out).toMatchObject({ id: 'sess-77a1', srcIp: '203.0.113.42', country: 'NL' })
    expect(out!.sensors).toEqual([{ id: 'cowrie', label: 'cowrie', count: 1 }])
    expect(out!.events[0]).toMatchObject({ eventName: 'cowrie.command.input' })
    expect(out!.events[0].severity).toBeUndefined()
  })

  it('maps the recordings list and the replay, filtered to the one shasum', async () => {
    stub({ '/api/v1/recordings/': replayWire, '/api/v1/recordings': recordingPage })
    const out = await live('getReplayDetail')('ab12cd34')
    expect(out).toMatchObject({ replay: { shasum: 'ab12cd34', frames: 118 }, sessions: [{ shasum: 'ab12cd34' }], attacker: null })
  })

  it('maps the grouped search, keeping the overflow link', async () => {
    stub({ '/api/v1/search': searchWire })
    expect(await live('searchAll')('uname')).toEqual([
      { id: 'commands', title: 'Commands', total: 1, items: [{ label: 'uname -a', detail: '12', href: '/events?cmd=uname%20-a' }], moreHref: '/history?q=uname' },
    ])
  })

  it('answers an empty history query without a call, and an empty search envelope with no groups', async () => {
    const calls = stub({ '/api/v1/search': { query: 'x', redirect: null, groups: [], total: 0 } })
    expect(await live('searchAll')('   ')).toEqual([])
    expect(calls).toHaveLength(0)
    expect(await live('searchAll')('x')).toEqual([])
  })

  it('treats a 404 as the page own not-found, not as a failure', async () => {
    // The shasum 404s the replay AND leaves the companion recordings list to
    // succeed — the recordings list has no 404 to give.
    stub({
      '/api/v1/event/': fail(404, 'no such event'),
      '/api/v1/sessions/': fail(404, 'no such session'),
      '/api/v1/recordings/': fail(404, ''),
      '/api/v1/recordings': recordingPage,
    })
    expect(await live('getEventDetail')('nope')).toBeNull()
    expect(await live('getSessionDetail')('nope')).toBeNull()
    expect(await live('getReplayDetail')('nope')).toBeNull()
  })
})

describe('a degraded body degrades, and a failed call errors', () => {
  it('maps an empty-but-valid envelope to an empty list, which is what it means', async () => {
    stub({ '/api/v1/events': { total: 0, offset: 0, rows: [], fingerprint_ips: null }, '/api/v1/filter-values': { sensors: [], countries: [], cities: [], protos: [], ports: [], kinds: [] } })
    expect(await live('getEvents')({})).toMatchObject({ total: 0, rows: [], values: { sensors: [], ports: [] } })
    stub({ '/api/v1/sessions/': { ...sessionWire, events: [], sensors: [], commands: [], credentials: [], payloads: [] } })
    expect((await live('getSessionDetail')('sess-77a1'))!.events).toEqual([])
    stub({ '/api/v1/recordings': { total: 0, rows: [] } })
    expect(await live('getRecordings')()).toEqual([])
  })

  it('maps a 502 to the state the unavailable scenario already produces', async () => {
    // Every endpoint family, with the companion calls stubbed so the 502
    // under test is the one that reaches the page.
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getEvents', () => live('getEvents')({}), { '/api/v1/events': fail(502), '/api/v1/filter-values': fail(502) }],
      ['getEvents (rows)', () => live('getEvents')({}), { '/api/v1/events': fail(502), '/api/v1/filter-values': values }],
      ['getCommands', () => live('getCommands')({}), { '/api/v1/events': fail(502) }],
      ['searchHistory', () => liveQuery('searchHistory', undefined)!('uname', {}), { '/api/v1/events': fail(502) }],
      ['searchAll', () => live('searchAll')('uname'), { '/api/v1/search': fail(502) }],
      ['getSessionDetail', () => live('getSessionDetail')('s'), { '/api/v1/sessions/': fail(502) }],
      ['getEventDetail', () => live('getEventDetail')('e'), { '/api/v1/event/': fail(502) }],
      ['getRecordings', () => live('getRecordings')(), { '/api/v1/recordings': fail(502) }],
      ['getReplayDetail', () => live('getReplayDetail')('s'), { '/api/v1/recordings': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(fixtures)
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })

  // The regression this whole slice could introduce: a fetch that fails must
  // reach the page as an error state. An events list with no rows reads as
  // "no activity", and an operator cannot tell that from a backend that is
  // down — so every failure below asserts a throw, never an empty list.
  it('throws rather than returning an empty list when the backend is down', async () => {
    stub({
      '/api/v1/events': () => {
        throw new TypeError('fetch failed')
      },
    })
    const out = await live('getEvents')({}).catch((error: unknown) => error)
    expect(out).toBeInstanceOf(ApiError)
    expect((out as ApiError).kind).toBe('unavailable')
    expect((out as ApiError).status).toBe(502)
    expect((out as ApiError).backendUnreachable).toBe(true)
  })

  it('throws rather than returning null when the detail call cannot connect', async () => {
    stub({
      '/api/v1/event/': () => {
        throw new TypeError('fetch failed')
      },
    })
    const out = await live('getEventDetail')('ev_9f2c1a').catch((error: unknown) => error)
    expect(out).toBeInstanceOf(ApiError)
    // Not the null a 404 would produce — an error state, so the page shows
    // its failure and not "no such event".
    expect(out).not.toBeNull()
  })

  it('treats a bad service token as unavailable, not as an expired session', async () => {
    // The tier's 401 means OUR shared secret is wrong — a deployment fault.
    // Mapping it onto `expired` would drive every operator through sign-in
    // again for something only a deployment fix cures.
    stub({ '/api/v1/events': fail(401, 'service token required'), '/api/v1/filter-values': values })
    const error = (await live('getEvents')({}).then(() => null, (e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('unavailable')
    expect(error.status).toBe(502)
    expect(error.message).not.toContain('test-token')
    expect(error.detail).toBe('service token required')
  })

  it('maps each refusal to the kind the pages already tell apart', async () => {
    for (const [status, kind, retryAfter] of [
      [400, 'invalid', undefined],
      [403, 'forbidden', undefined],
      [423, 'locked', undefined],
      [401, 'unavailable', undefined],
      [503, 'overloaded', 30],
      [504, 'unavailable', undefined],
    ] as const) {
      stub({ '/api/v1/events': fail(status, 'refused', retryAfter ? { 'retry-after': String(retryAfter) } : {}), '/api/v1/filter-values': values })
      const error = (await live('getEvents')({}).then(() => null, (e: unknown) => e)) as ApiError
      expect(error.kind, String(status)).toBe(kind)
      if (retryAfter) expect(error.retryAfter).toBe(retryAfter)
    }
  })
})

describe('the seam itself (#185)', () => {
  it('forwards the request id across the hop, and arms a timeout', async () => {
    stub({ '/api/v1/event/': { ...row } })
    await liveQuery('getEventDetail', undefined, 'req-42')!('ev_9f2c1a')
    const init = vi.mocked(globalThis.fetch).mock.calls[0][1]
    expect(init?.headers).toMatchObject({ 'x-request-id': 'req-42' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a timed-out call to unavailable, not an empty answer', async () => {
    stub({
      '/api/v1/event/': () => {
        throw new DOMException('The operation timed out.', 'TimeoutError')
      },
    })
    const error = (await live('getEventDetail')('e').then(() => null, (e: unknown) => e)) as ApiError
    expect(error.kind).toBe('unavailable')
    expect(error.status).toBe(502)
  })

  it('queues past BACKEND_MAX_INFLIGHT and sheds past BACKEND_MAX_QUEUE', async () => {
    // Defaults 25 in flight + 50 waiting: the 76th concurrent call is shed.
    const pending: Array<() => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => pending.push(() => resolve(new Response('null', { status: 404 }))))))
    const calls = Array.from({ length: 76 }, () => live('getEventDetail')('e').then(() => 'ok', (e: unknown) => e))
    const shed = (await calls[75]) as ApiError
    expect(shed).toBeInstanceOf(ApiError)
    expect(shed.kind).toBe('overloaded')
    expect(shed.retryAfter).toBe(1)
    expect(pending).toHaveLength(25)
    // Each finished call hands its slot to the next waiter, until all 75 ran.
    while (pending.length) {
      pending.shift()!()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(await Promise.all(calls.slice(0, 75))).toEqual(Array(75).fill('ok'))
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(75)
  })
})

// ---- the Evidence & analysis slice (#78) -------------------------------------

describe('the mounted base', () => {
  it('routes a spool route to BACKEND_MOUNTED_URL, never the regular base', async () => {
    process.env.BACKEND_MOUNTED_URL = 'http://mounted.test'
    const calls = stub({ '/api/v1/sandbox/sbx-1': { sandbox: { job: 'sbx-1', sha256: 'a'.repeat(64), completed_at: '', exit_status: 'ok', run_status: 'ok', duration_seconds: 1, risk_score: 10, platform: 'linux-x86_64' }, _doc_id: 'sbx:1' } })
    await live('getSandboxRun')('sbx-1')
    expect(calls[0]).toMatch(/^http:\/\/mounted\.test\/api\/v1\/sandbox\//)
    // A sandbox answer off the REGULAR instance comes back empty rather than
    // erroring, which is the whole hazard this routing exists to prevent.
    expect(calls[0]).not.toContain('backend.test')
  })

  it('falls back to BACKEND_URL when the mounted base is unset', async () => {
    delete process.env.BACKEND_MOUNTED_URL
    const calls = stub({ '/api/v1/ghidra/': { ghidra: { sha256: 'b'.repeat(64), requested_at: '', started_at: '', completed_at: '', exit_status: 'ok', functions: [] } } })
    await live('getGhidraAnalysis')('b'.repeat(64))
    expect(calls[0]).toMatch(/^http:\/\/backend\.test\/api\/v1\/ghidra\//)
  })
})

describe('the actor the Rust tier trusts', () => {
  const admin = { name: 'alice', email: 'a@example.test', roles: ['admin'] }

  it('forwards the session user on a mounted mutation, never client input', async () => {
    const calls = stub({ '/api/v1/gpu-queue/gj-1/abort': { ok: true, job_id: 'gj-1', abort_requested: true } })
    expect(await liveQuery('abortGpuJob', admin)!('gj-1')).toBe(true)
    const init = vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['x-actor-username']).toBe('alice')
    expect(headers['x-actor-role']).toBe('admin')
    // The token rides as a header and never in the URL.
    expect(headers['x-service-token']).toBe('test-token')
    expect(calls[0]).not.toContain('test-token')
  })

  it('sends no actor headers when there is no signed-in user', async () => {
    stub({ '/api/v1/gpu-queue/gj-1/abort': { ok: true, job_id: 'gj-1', abort_requested: true } })
    await liveQuery('abortGpuJob', undefined)!('gj-1')
    const init = vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['x-actor-username']).toBeUndefined()
  })

  it('refuses a viewer the same way the mock refuses them, before any fetch', async () => {
    stub({ '/api/v1/gpu-queue/gj-1/abort': { ok: true, job_id: 'gj-1', abort_requested: true } })
    await expect(liveQuery('abortGpuJob', { name: 'V', email: 'v@example.test', roles: ['viewer'] })!('gj-1')).rejects.toThrow(ApiError)
    expect(fetch).not.toHaveBeenCalled()
  })

  // #196: the actor used to be one module-level binding assigned per request,
  // and every write below reads it AFTER guardReadOnly's config read has
  // suspended the request. Two requests in flight therefore read each other's
  // operator. The gate below is what makes the interleave real: the config
  // read answers only once BOTH requests have reached it, so the swap happens
  // inside the await rather than between two of this test's own ticks.
  const alice = rememberActor({ name: 'alice', email: 'a@example.test', roles: ['admin' as const] }, { sub: 'oidc|alice', username: 'alice' })
  const bob = rememberActor({ name: 'bob', email: 'b@example.test', roles: ['admin' as const] }, { sub: 'oidc|bob', username: 'bob' })

  /** A stub whose config read holds every request until two of them have
   * reached it, so the read-after-await is a real interleave rather than an
   * artifact of this test's own awaits. Every other path answers at once and
   * records the actor header it was sent, keyed by path (or by `q`, which is
   * what tells the two purges apart), so each assertion names one request's
   * own argument. */
  function overlappingStub() {
    const actors = new Map<string, string>()
    const createdBy = new Map<string, string>()
    let waiting = 0
    let release: () => void = () => {}
    const bothInFlight = new Promise<void>((resolve) => (release = resolve))
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const parsed = new URL(url)
        const path = parsed.pathname
        if (path === '/api/v1/config') {
          if (++waiting === 2) release()
          await bothInFlight
          return json(configWire)
        }
        const headers = init.headers as Record<string, string>
        const key = path === '/api/v1/store/dead-letters' ? String(parsed.searchParams.get('q')) : path
        actors.set(key, headers['x-actor-username'])
        if (path === '/api/v1/canarytokens') {
          const body = JSON.parse(init.body as string)
          createdBy.set(body.memo, body.created_by)
          return json(tokenRecord)
        }
        if (path === '/api/v1/store/dead-letters') return json({ deleted: 1 })
        return json({ ok: true, abort_requested: true })
      }),
    )
    return { actors, createdBy }
  }

  it('keeps each of two overlapping writes on its own operator', async () => {
    const { actors, createdBy } = overlappingStub()
    await Promise.all([
      liveQuery('setAlertsAcknowledged', alice)!(['yara:aaa'], true),
      liveQuery('setAlertsAcknowledged', bob)!(['yara:bbb'], true),
      // The same read-after-await hole, with the operator in the body rather
      // than a header: on a canarytoken the wrong name is written into
      // `created_by` on the artifact an analyst later attributes an
      // intrusion to.
      liveQuery('createCanarytoken', alice)!({ type: 'ms_word', memo: 'from-alice' }),
      liveQuery('createCanarytoken', bob)!({ type: 'ms_word', memo: 'from-bob' }),
    ])
    expect(Object.fromEntries(actors)).toEqual({ '/api/v1/alerts/yara%3Aaaa/ack': 'alice', '/api/v1/alerts/yara%3Abbb/ack': 'bob' })
    expect(Object.fromEntries(createdBy)).toEqual({ 'from-alice': 'alice', 'from-bob': 'bob' })
  })

  it('keeps the third post-await read, the admin-only purge, on its own operator', async () => {
    const { actors } = overlappingStub()
    await Promise.all([liveQuery('purgeDeadLetters', alice)!('mapper_parsing'), liveQuery('purgeDeadLetters', bob)!('index_out_of_bounds')])
    expect(Object.fromEntries(actors)).toEqual({ mapper_parsing: 'alice', index_out_of_bounds: 'bob' })
  })

  it('leaves the sites that read the actor in the same tick still on theirs', async () => {
    // The five mounted mutations that read before their first await were
    // already correct; the scope has to keep them that way.
    const { actors } = overlappingStub()
    await Promise.all([liveQuery('abortGpuJob', alice)!('gj-a'), liveQuery('abortGpuJob', bob)!('gj-b')])
    expect(Object.fromEntries(actors)).toEqual({ '/api/v1/gpu-queue/gj-a/abort': 'alice', '/api/v1/gpu-queue/gj-b/abort': 'bob' })
  })
})

describe('the Evidence queries against a fixture per endpoint', () => {
  it('maps GET /payloads, sources rollup included', async () => {
    const calls = stub({ '/api/v1/payloads': { total: 1, rows: [{ _doc_id: 'd1', sha256: 'c'.repeat(64), size_bytes: 12, kind: 'PE32', first_seen: '', last_seen: '', sources: ['cowrie'], tags: [] }], source_buckets: [{ key: 'cowrie', doc_count: 1 }] } })
    expect(await live('getPayloads')()).toMatchObject({ sources: [{ id: 'cowrie', label: 'cowrie', count: 1 }] })
    expect(calls[0]).toContain('offset=0')
    // Without aggs=sources the backend answers 200 and simply omits the
    // census, so the rollup would be empty for no visible reason.
    expect(calls[0]).toContain('aggs=sources')
  })

  it('maps GET /payloads/{hash}, a 404 being the page null', async () => {
    stub({ '/api/v1/payloads/deadbeef': fail(404, 'not found') })
    expect(await live('getPayloadAnalysis')('deadbeef')).toBeNull()
  })

  it('maps GET /sandbox/{job} and the double-nested GET /revdeck/{sha}', async () => {
    stub({
      '/api/v1/sandbox/sbx-9': { sandbox: { job: 'sbx-9', sha256: 'd'.repeat(64), completed_at: '2026-10-01T09:00:00Z', exit_status: 'ok', run_status: 'ok', duration_seconds: 5, risk_score: 80, platform: 'windows-kvm', iocs: [] }, _doc_id: 'sbx:9' },
      '/api/v1/revdeck/': { revdeck: { sha256: 'e'.repeat(64), revdeck: { workflow: 'revdeck-v1', status: 'complete', answer: 'It beaconed.', steps: [], citations: { valid: ['a'], invalid: [] } } } },
    })
    expect(await live('getSandboxRun')('sbx-9')).toMatchObject({ job: 'sbx-9', verdict: 'malicious', route: { name: 'windows-kvm' } })
    expect(await live('getRevDeckRun')('e'.repeat(64))).toMatchObject({ sha: 'e'.repeat(64), status: 'completed', summary: 'It beaconed.' })
  })

  it('reads a VNC 404 as "not running", which is what it means', async () => {
    stub({ '/api/v1/sandbox/vnc': fail(404, 'no Windows-sandbox detonation is currently running') })
    expect(await live('getSandboxLiveStatus')()).toEqual({ running: false })
  })

  it('maps the store pages for CAPE, GitHub and RevDeck', async () => {
    stub({
      '/api/v1/store/cape': { total: 0, rows: [] },
      '/api/v1/store/github-analysis': { total: 1, rows: [{ _doc_id: 'g1', github_analysis: { sha256: 'f'.repeat(64), requested_at: '', started_at: '', completed_at: '2026-10-01T12:00:00Z', exit_status: 'ok', commit: 'abc', scanners: [] } }] },
      '/api/v1/store/revdeck': { total: 1, rows: [{ _doc_id: 'r1', sha256: '9'.repeat(64), revdeck: { workflow: 'revdeck-v1', status: 'complete', answer: 'yes', steps: [], citations: { valid: [], invalid: [] } } }] },
    })
    expect(await live('getCapeRuns')()).toEqual([])
    const gh = await live('getGithubAnalyses')()
    expect(gh[0]).toMatchObject({ sha: 'f'.repeat(64), status: 'dry_run', requestedBy: 'unknown' })
    expect((await live('getRevDeckRuns')())[0]).toMatchObject({ sha: '9'.repeat(64) })
  })

  it('maps GET /artifacts/{kind}/{key}, a 404 being the page null', async () => {
    stub({ '/api/v1/artifacts/ghidra/abc': { rows: [{ filename: 'main.c', kind: 'ghidra', content_type: 'text/plain', size_bytes: 12, imported_at: '2026-10-01T00:00:00Z' }] } })
    expect(await live('getArtifacts')('ghidra', 'abc')).toEqual([{ filename: 'main.c', kind: 'ghidra', contentType: 'text/plain', sizeBytes: 12, importedAt: '2026-10-01T00:00:00Z' }])
    stub({ '/api/v1/artifacts/ghidra/none': fail(404, 'not found') })
    expect(await live('getArtifacts')('ghidra', 'none')).toBeNull()
  })

  it('reads the artifact route as bytes, its content-type off the header', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url.includes('/none/')) return new Response('no such artifact', { status: 404 })
        // The route answers the reassembled body directly, not a JSON
        // envelope — parsing it as JSON would be the bug this test pins.
        return new Response(new Uint8Array([0x4d, 0x5a]), { status: 200, headers: { 'content-type': 'application/x-dosexec' } })
      }),
    )
    expect(await live('getArtifactFile')('ghidra', 'abc', 'sample.exe')).toMatchObject({ filename: 'sample.exe', kind: 'ghidra', contentType: 'application/x-dosexec' })
    // One request, not a metadata lookup followed by a download.
    expect(calls).toHaveLength(1)
    expect(await live('getArtifactFile')('ghidra', 'none', 'gone.exe')).toBeNull()
  })

  it('never renders a failed Evidence fetch as an empty list', async () => {
    stub({ '/api/v1/store/cape': fail(502, 'elasticsearch refused') })
    const error = (await live('getCapeRuns')().then(() => null, (e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('unavailable')
  })
})

describe('getAnalysisResults, a composite with no results endpoint of its own', () => {
  const admin = { name: 'alice', email: 'a@example.test', roles: ['admin'] }
  const empty = { total: 0, rows: [] }

  it('fans out to the five endpoints that do exist', async () => {
    const calls = stub({
      '/api/v1/gpu-queue': [{ job_id: 'gj-1', job_type: 'decompile', ref: 'a'.repeat(64), model: 'qwen', estimated_vram_mib: 18_000, status: 'running', requested_at: '2026-10-01T14:00:00Z', started_at: '', finished_at: '', abort_requested: false, error: '', attempts: 1, result: null }],
      '/api/v1/workbench/analyzers': [{ classification: { code: 'c', label: 'Executable', platform: 'PE', category: 'executable', analysis_path: 'x', dynamic: false }, analyzers: [] }],
      '/api/v1/workbench/runs': { runs: [] },
      '/api/v1/workbench/recipes': { recipes: [] },
      '/api/v1/store/yara': empty,
    })
    const data = (await liveQuery('getAnalysisResults', admin)!()) as Awaited<ReturnType<Backend['getAnalysisResults']>>
    expect(data.gpuQueue[0]).toMatchObject({ jobId: 'gj-1', status: 'running', vramMib: 18_000 })
    expect(data.results[0]).toMatchObject({ id: 'gj-1', analyzer: 'workbench' })
    // #3110: identity is the actor header alone. An `owner` query param here
    // would read as if it scoped the list, and it is not deserialized at all.
    expect(calls.some((url) => url.includes('owner='))).toBe(false)
    expect(calls.filter((url) => url.includes('/api/v1/workbench/'))).toHaveLength(3)
  })

  it('routes the workbench half to the mounted base', async () => {
    process.env.BACKEND_MOUNTED_URL = 'http://mounted.test'
    const calls = stub({ '/api/v1/gpu-queue': [], '/api/v1/workbench/analyzers': [], '/api/v1/workbench/runs': { runs: [] }, '/api/v1/workbench/recipes': { recipes: [] }, '/api/v1/store/yara': { total: 0, rows: [] } })
    await liveQuery('getAnalysisResults', admin)!()
    const workbench = calls.filter((url) => url.includes('/api/v1/workbench/'))
    expect(workbench).toHaveLength(3)
    expect(workbench.every((url) => new URL(url).origin === 'http://mounted.test')).toBe(true)
  })
})

describe('the mutations', () => {
  const admin = { name: 'alice', email: 'a@example.test', roles: ['admin'] }

  it('POSTs the workbench run body to the mounted base', async () => {
    process.env.BACKEND_MOUNTED_URL = 'http://mounted.test'
    const calls = stub({ '/api/v1/workbench/runs': { run: { id: 'wr-1', payload_sha256: 'a'.repeat(64), payload_kind: 'PE32', owner: 'alice', state: 'queued', created_at: '', updated_at: '', children: [] }, reused: false } })
    const run = await liveQuery('startAnalysisRun', admin)!({ hash: 'a'.repeat(64), analyzers: ['static'], options: { static: { timeoutSeconds: 300, maxQueueAgeSeconds: 3600, retryLimit: 0 } } })
    expect(run).toMatchObject({ reused: false, run: { id: 'wr-1', hash: 'a'.repeat(64) } })
    expect(calls[0]).toMatch(/^http:\/\/mounted\.test\/api\/v1\/workbench\/runs$/)
    const body = JSON.parse((vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).body as string)
    // The page's 'static' analyzer id goes out as the workbench's own name.
    expect(body.analyzers[0].analyzer_id).toBe('deterministic')
  })

  it('POSTs a child action and reports what the abort route said', async () => {
    const calls = stub({ '/api/v1/workbench/runs/wr-1/children/ghidra/retry': { run: { id: 'wr-1', payload_sha256: 'a'.repeat(64), payload_kind: 'PE32', owner: 'alice', state: 'queued', created_at: '', updated_at: '', children: [] } }, '/api/v1/gpu-queue/gj-1/abort': { ok: true, job_id: 'gj-1', abort_requested: true } })
    expect(await liveQuery('setRunChild', admin)!('wr-1', 'ghidra', 'retry')).toMatchObject({ id: 'wr-1' })
    expect(await liveQuery('abortGpuJob', admin)!('gj-1')).toBe(true)
    expect(calls[0]).toContain('/children/ghidra/retry')
    expect(calls[1]).toContain('/gpu-queue/gj-1/abort')
  })

  it('reports a refused abort as false rather than throwing it away', async () => {
    stub({ '/api/v1/gpu-queue/gj-2/abort': { ok: true, job_id: 'gj-2', abort_requested: false } })
    expect(await liveQuery('abortGpuJob', admin)!('gj-2')).toBe(false)
  })

  it('submits each payload action to its own spool route', async () => {
    const calls = stub({ '/api/v1/sandbox/submit': { queued: true }, '/api/v1/ghidra/submit': { queued: true }, '/api/v1/github-analysis/submit': { queued: true } })
    expect(await liveQuery('queuePayloadAction', admin)!('a'.repeat(64), 'sandbox')).toBe('Sandbox detonation queued')
    expect(await liveQuery('queuePayloadAction', admin)!('a'.repeat(64), 'ghidra')).toMatch(/GPU queue/)
    await liveQuery('queuePayloadAction', admin)!('a'.repeat(64), 'github')
    expect(calls[2]).toContain('/github-analysis/submit')
    // The body field is `hash`, not `sha256`, on all three submit routes.
    for (const call of vi.mocked(fetch).mock.calls.slice(-3)) expect(JSON.parse((call[1] as RequestInit).body as string).hash).toBe('a'.repeat(64))
    // `confirm` is the backend's own required literal, not an assumption.
    expect(JSON.parse((vi.mocked(fetch).mock.calls.at(-1)?.[1] as RequestInit).body as string).confirm).toBe('publish')
  })
})

// ---- the settings slice -------------------------------------------------------

const configWire = { revision: 14, payload: { presentation: { app_name: 'APIARY' }, behavior: { default_time_window: '24h', read_only: false }, honeypot: { alert_cooldown: '15m' } } }
const storageWire = { cluster_status: 'green', index_count: 42, doc_count: 1_000, store_bytes: 2_048 }
const servicesWire = { available: true, services: [{ name: 'hp-tanner', state: 'running', exit_code: null, started_at: '2026-10-04T08:00:00Z', restart_count: 0 }] }
const reportInput = { page: '/settings', expected: 'x', actual: 'y', actionTrail: [], consoleErrors: [], networkFailures: [], apiCalls: [], domSnapshot: '', userAgent: 'UA' }

/** Every document `getSettings` reads, so one fan-out test does not hand-build
 * eight fixtures; the ones under test override their own path. */
const settingsFixtures = (over: Record<string, unknown> = {}) => ({
  '/api/v1/config': configWire,
  '/api/v1/config/history': { entries: [{ revision: 41, time: '2026-10-04T08:00:00Z', actor_subject: 'oidc|1', actor_username: 'operator', action: 'update', fields: ['behavior'] }] },
  '/api/v1/users': { users: [{ subject: 'oidc|1', username: 'operator', role: 'admin', first_seen_at: '2026-06-01T00:00:00Z', last_seen_at: '2026-10-04T08:00:00Z' }] },
  '/api/v1/audit': { events: [{ actor_subject: 'oidc|1', actor_username: 'operator', action: 'config.update', fields: ['behavior'], revision: 41, result: 'success' }] },
  '/api/v1/services': servicesWire,
  '/api/v1/reporter-stats': { available: false, reason: 'no reporter metrics indexed yet' },
  '/api/v1/settings/storage': storageWire,
  '/api/v1/reports/templates': { templates: [{ id: 'executive', name: 'Executive', description: 'One-page brief' }], elements: [] },
  ...over,
})

describe('the settings page, fanned out over its eight documents', () => {
  it('reads the wire ones and leaves preferences at the backend default', async () => {
    const calls = stub(settingsFixtures())
    const out = await live('getSettings')()
    expect(out.config.revision).toBe(14)
    expect(out.config.presentation.appName).toBe('APIARY')
    expect(out.users[0]).toMatchObject({ subject: 'oidc|1', username: 'operator' })
    expect(out.history[0]).toMatchObject({ id: '41', actor: 'operator' })
    expect(out.services[0]).toMatchObject({ name: 'hp-tanner', state: 'running' })
    expect(out.storage).toMatchObject({ clusterStatus: 'green', indexCount: 42 })
    expect(out.reportTemplates).toHaveLength(1)
    // No signed-in operator in this file, so the stored document is the
    // backend's default_preferences. The operator's own document is covered
    // in api.preferences.test.ts.
    expect(out.preferences).toMatchObject({ theme: 'system', rowsPerPage: 50, notifyCanary: false })
    expect(calls.some((url) => url.includes('/api/v1/preferences'))).toBe(false)
  })

  it('fails the whole read when one leg fails, rather than building a panel of defaults', async () => {
    // A `revision: 0` fallback would be a real baseline every later save then
    // conflicts against, blaming an editor who never existed.
    stub(settingsFixtures({ '/api/v1/users': fail(502, 'store down') }))
    await expect(live('getSettings')()).rejects.toThrow(ApiError)
  })

  it('renders a never-written config document as the shell reads it', async () => {
    stub(settingsFixtures({ '/api/v1/config': { revision: 0, payload: {} } }))
    const out = await live('getSettings')()
    expect(out.config.revision).toBe(0)
    expect(out.config.presentation.appName).toBe('')
    expect(out.config.behavior.readOnly).toBe(false)
  })
})

describe('the shell config', () => {
  it('reads the config document, and takes links from the deployment environment', async () => {
    // `links` has no endpoint — canonical builds them from its own process
    // env, so this tier does too rather than inventing a source.
    stub({ '/api/v1/config': configWire })
    process.env.HONEYPOT_DOMAIN = 'hp.example.test'
    process.env.KIBANA_PUBLIC_URL = 'https://kibana.other.test/'
    const out = await live('getShellConfig')()
    expect(out.presentation.appName).toBe('APIARY')
    expect(out.links).toEqual({ kibana: 'https://kibana.other.test/', evebox: 'https://evebox.hp.example.test', arkime: 'https://arkime.hp.example.test' })
    // accountConsole is derived from the OIDC issuer, which this tier does
    // not configure: an absent link is a missing button, never a wrong one.
    expect(out.links.accountConsole).toBeUndefined()
    delete process.env.HONEYPOT_DOMAIN
    delete process.env.KIBANA_PUBLIC_URL
  })

  it('leaves an unconfigured tool out rather than guessing at a URL', async () => {
    stub({ '/api/v1/config': configWire })
    const out = await live('getShellConfig')()
    expect(out.links).toEqual({})
  })
})

describe('the config writes', () => {
  it('validates a section on its own, against the endpoint that persists nothing', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: false, problems: ['behavior.default_time_window is not a window', 'unknown config section "mystery"'] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    // A refusal is a 200 carrying problems — a result, not an error.
    expect(await live('validateConfig')('behavior', { defaultTimeWindow: 'nope' } as never)).toEqual({
      'behavior.default_time_window': 'is not a window',
      'unknown config section "mystery"': 'unknown config section "mystery"',
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({ behavior: expect.objectContaining({ default_time_window: 'nope' }) })
  })

  it('saves a whole section to the route its own name has', async () => {
    const calls = stub({ '/api/v1/config/behavior': { ...configWire, revision: 15 } })
    const out = await live('saveConfigSection')('behavior', { defaultTimeWindow: '7d', rowsPerPageOptions: [50], readOnly: false } as never)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/config/behavior')
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body))
    // The handler REPLACES its block, so every field the page holds must
    // ride — a partial body would drop what it omits. Only what the page
    // carries is sent; a field absent from the page type is absent from the
    // document too, because the page owns the section.
    expect(body).toMatchObject({ default_time_window: '7d', read_only: false, rows_per_page_options: [50] })
    expect(body).not.toHaveProperty('revision')
    expect(out).toEqual({ ok: true, revision: 15 })
  })

  it('sends presentation to its own route, not to the section that 404s', async () => {
    const calls = stub({ '/api/v1/config/presentation': configWire })
    await live('saveConfigSection')('presentation', { appName: 'APIARY', titleFormat: '{ip}' } as never)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/config/presentation')
  })

  it('rolls back by integer revision, and refuses an id that is not one', async () => {
    const calls = stub({ '/api/v1/config/rollback': configWire })
    await live('rollbackConfig')('41')
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body))
    expect(body).toMatchObject({ revision: 41 })
    // The page's id is that same integer rendered, so `rev-41` parses too —
    // the adapter strips the prefix rather than sending a string revision
    // the backend would reject as negative.
    await live('rollbackConfig')('rev-41')
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[1][1]?.body))).toMatchObject({ revision: 41 })
    // Anything that is not a revision is refused here, before the call.
    await expect(live('rollbackConfig')('rev-x')).rejects.toThrow(ApiError)
    expect(calls).toHaveLength(2)
  })
})

describe('read-only mode, which the Rust tier does not enforce', () => {
  it('refuses a write with the same 423 the mock gives', async () => {
    // Nothing in the backend implements read_only — it is a dashboard
    // preference. Without this the guard would exist for the mock tier only:
    // passing its tests and absent in production.
    stub({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } })
    const error = (await live('setProblemStatus')('pr-1', 'triaged').then(() => null, (e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe('locked')
    // One config read, and the guarded write never leaves.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)

    // A container restart is guarded too — nothing exempts it, exactly as
    // the mock treats it. The two exemptions are the writes that turn
    // read-only off, which is why they need the flag readable at all.
    stub({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } }, '/api/v1/services/hp-tanner/restart': { ok: true } })
    await expect(live('runServiceAction')('hp-tanner', 'restart')).rejects.toThrow(ApiError)
  })

  it('still allows turning it off, and ones own preferences and reports', async () => {
    stub({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } }, '/api/v1/config/rollback': configWire, '/api/v1/problem-reports': { id: 'pr-1' } })
    await expect(live('rollbackConfig')('41')).resolves.toBeUndefined()
    expect(await live('submitProblemReport')(reportInput)).toEqual({ id: 'pr-1' })
  })
})

describe('services, mail and problem reports', () => {
  it('asks the services adapter for the action and reports its own refusal', async () => {
    const calls = stub({ '/api/v1/config': configWire, '/api/v1/services/hp-tanner/restart': { ok: true, name: 'hp-tanner', action: 'restart' } })
    await expect(live('runServiceAction')('hp-tanner', 'restart')).resolves.toBeUndefined()
    expect(new URL(calls[calls.length - 1]).pathname).toBe('/api/v1/services/hp-tanner/restart')
    // The handler answers 200 with an ack that can be a refusal; it is not an
    // HTTP error, so it would otherwise reach the page as a success.
    stub({ '/api/v1/config': configWire, '/api/v1/services/hp-tanner/restart': { ok: false, error: 'adapter unreachable' } })
    await expect(live('runServiceAction')('hp-tanner', 'restart')).rejects.toThrow(ApiError)
  })

  it('answers a mail session that captured nothing with null, not an error', async () => {
    stub({ '/api/v1/mail/': fail(404, 'no capture') })
    expect(await live('getMail')('sess-none')).toBeNull()
  })

  it('lists problem reports from the store passthrough, the only endpoint that serves them', async () => {
    // The Rust tier serves only the POST and the PATCH under
    // /api/v1/problem-reports — no GET — so the list comes from the
    // allowlisted generic store, exactly as canonical's page reads it.
    const calls = stub({ '/api/v1/store/problem-reports': { total: 1, rows: [{ id: 'pr-1', submitted_at: '2026-10-04T08:00:00Z', submitted_by: 'oidc|1', page: '/settings', expected: 'x', actual: 'y', action_trail: [], console_errors: [], network_failures: [], api_calls: [], user_agent: 'UA', status: 'open' }] } })
    const out = await live('getProblemReports')()
    expect(Object.fromEntries(new URL(calls[0]).searchParams)).toEqual({ offset: '0', size: '100' })
    expect(out[0]).toMatchObject({ id: 'pr-1', status: 'open' })
  })

  it('folds a status the store cannot hold into one it can', async () => {
    const calls = stub({ '/api/v1/config': configWire, '/api/v1/problem-reports/pr-1': null })
    await live('setProblemStatus')('pr-1', 'fixed')
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[1][1]?.body))).toEqual({ status: 'closed' })
    expect(new URL(calls[calls.length - 1]).pathname).toBe('/api/v1/problem-reports/pr-1')
  })

  it('attributes every write to the session subject, never to a blank actor', async () => {
    // The Rust tier has no session concept: each actor-attributed write takes
    // `actor_subject`/`actor_username` and writes them into the audit log
    // verbatim. `SessionUser` carries no subject, so the seam reads the
    // session record. With no session resolvable the fields are omitted
    // rather than sent empty — `request` drops empty params, so the backend
    // applies its own `#[serde(default)]` and the row is its own doing.
    // Inventing a subject, or passing "unknown", would put a name in a log
    // that reads as a real editor; this asserts it neither happens.
    const calls = stub({ '/api/v1/config': configWire, '/api/v1/config/behavior': configWire })
    await live('saveConfigSection')('behavior', {} as never)
    const url = new URL(calls[calls.length - 1])
    expect(url.pathname).toBe('/api/v1/config/behavior')
    expect(url.searchParams.has('actor_subject')).toBe(false)
    expect(url.searchParams.has('actor_username')).toBe(false)
  })

})

describe('the settings slice fails as an error, never as an empty panel', () => {
  it('maps a 502 on each endpoint to the state the unavailable scenario produces', async () => {
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getSettings', () => live('getSettings')(), settingsFixtures({ '/api/v1/audit': fail(502) })],
      ['getSettings (services)', () => live('getSettings')(), settingsFixtures({ '/api/v1/services': fail(503, 'adapter unconfigured') })],
      ['getShellConfig', () => live('getShellConfig')(), { '/api/v1/config': fail(502) }],
      ['validateConfig', () => live('validateConfig')('behavior', {} as never), { '/api/v1/config/validate': fail(502) }],
      ['saveConfigSection', () => live('saveConfigSection')('honeypot', {} as never), { '/api/v1/config': configWire, '/api/v1/config/honeypot': fail(502) }],
      ['rollbackConfig', () => live('rollbackConfig')('41'), { '/api/v1/config': configWire, '/api/v1/config/rollback': fail(502) }],
      ['runServiceAction', () => live('runServiceAction')('hp-tanner', 'restart'), { '/api/v1/config': configWire, '/api/v1/services/hp-tanner/restart': fail(502) }],
      ['getMail', () => live('getMail')('sess-1'), { '/api/v1/mail/': fail(502) }],
      ['getProblemReports', () => live('getProblemReports')(), { '/api/v1/store/problem-reports': fail(502) }],
      ['submitProblemReport', () => live('submitProblemReport')(reportInput), { '/api/v1/config': configWire, '/api/v1/problem-reports': fail(502) }],
      ['setProblemStatus', () => live('setProblemStatus')('pr-1', 'triaged'), { '/api/v1/config': configWire, '/api/v1/problem-reports/pr-1': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(fixtures)
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })
})
// ---- Operations (#77) ------------------------------------------------------

/** One alert-state document as worker.rs `Notifier::observe` writes it: the
 * eight fields and nothing else — no severity, no acknowledger. */
const alertDoc = (key: string, acknowledged = false) => ({
  Key: key,
  Message: `yara matched on ${key}`,
  Link: '/events?q=uname',
  FirstSeen: '2026-10-04T08:00:00Z',
  LastSeen: '2026-10-04T20:41:03Z',
  LastNotified: null,
  Count: 12,
  Acknowledged: acknowledged,
  _doc_id: key,
})

const alertPageWire = { total: 3, rows: [alertDoc('yara:abc123'), alertDoc('pipeline:dead-letters', true), alertDoc('stale:cowrie')] }

const healthWire = {
  cluster_status: 'green', total_documents: 12_345,
  sensors: [{ sensor: 'cowrie', documents: 900, last_seen: '2026-10-04T20:41:03Z', state: 'ACTIVE' }],
  yara: { enabled: true, last_scan: '2026-10-04T03:00:00Z', rules_sha256: 'ff', samples: 40, matched: 2, errors: 0 },
  runtime: { uptime_seconds: 7200, rss_bytes: 1_048_576, vm_bytes: 2_097_152 },
  ingest: { state: 'healthy', last_ingest: '2026-10-04T20:41:03Z', age_seconds: 12, recent_dead_letters: 3 },
  dead_letters: 91,
  pipeline: { state: 'healthy', acked: 10, failed: 1, dropped: 0, active: 2, decode_failures: 0 },
  webhook: { available: false, reason: 'not configured', state: 'disabled', target: '', messages: 0, consecutive_failures: 0, failure_threshold: 5, last_success: null, last_failure: null, updated_at: '' },
  unattributed_24h: 4,
}

const topologyWire = {
  generated_at: '2026-10-04T20:41:03Z',
  sensors: [
    { sensor: 'cowrie', stack: 'honeypot-cowrie', containers: ['hp-cowrie'], ingress: ['portbridge', 'tunnel-only'], hostnames: [], ports: [{ proto: 'tcp', public: 22, host: 19022, proxy: true }], rawIndex: 'honeypot-v2' },
    { sensor: 'dionaea', stack: 'honeypot-dionaea', containers: ['hp-dionaea'], ingress: ['traefik'], hostnames: ['smtp.example.test'], ports: [], rawIndex: 'unmapped' },
  ],
  flow: { nodes: [{ name: 'VPS Traefik (:443 hostnames)', layer: 0 }, { name: 'cowrie', layer: 1 }], links: [{ source: 'VPS Traefik (:443 hostnames)', target: 'cowrie' }] },
  stacks: [{ stack: 'honeypot-cowrie', containers: [{ name: 'hp-cowrie', adapter_visible: true }] }],
}

const sensorOverviewWire = {
  sensor: 'cowrie', window: 'now-7d', events: 900, unique_sources: 40,
  first_seen: '2026-10-04T08:00:00Z', last_seen: '2026-10-04T20:41:03Z', hourly: [4, 9],
  top_sources: [{ key: '203.0.113.42', count: 7 }], top_countries: [{ key: 'NL', count: 9 }],
  top_lists: [{ label: 'commands', rows: [{ key: 'uname -a', count: 3 }] }],
  measures: [{ label: 'commands', total: 120, max: 9, unit: 'count' }],
}

const operationsFixtures = (over: Record<string, unknown> = {}) => ({
  '/api/v1/alerts': alertPageWire,
  '/api/v1/source-health': healthWire,
  '/api/v1/topology': topologyWire,
  '/api/v1/services': { available: true, services: [{ name: 'hp-cowrie', state: 'running', exit_code: null, started_at: '2026-10-04T08:00:00Z', restart_count: 0 }] },
  '/api/v1/config': configWire,
  '/api/v1/sensors/catalog': { window: 'now-14d', sensors: [{ sensor: 'cowrie', events: 900, last_seen: '2026-10-04T20:41:03Z' }] },
  '/api/v1/sensors/cowrie/overview': sensorOverviewWire,
  '/api/v1/sensors/cowrie/events': { sensor: 'cowrie', total: 1, rows: [{ id: 'ev-1', when: '2026-10-04T20:41:03Z', src_ip: '203.0.113.42', src_port: 51322, dst_port: 19022, fields: { eventid: 'cowrie.command.input', input: 'uname -a' } }] },
  '/api/v1/store/dead-letters': { total: 1, rows: [{ _doc_id: 'dl-1', '@timestamp': '2026-10-04T19:00:00Z', reason: 'mapper_parsing_exception', logset: 'nginx' }] },
  ...over,
})

describe('alerts', () => {
  it('reads the store page the issue documents, one single-member group per document', async () => {
    const calls = stub(operationsFixtures())
    const groups = await live('getAlerts')()
    expect(Object.fromEntries(new URL(calls[0]).searchParams)).toEqual({ offset: '0', size: '100' })
    expect(groups).toHaveLength(3)
    // One document per key, so nothing folds: the page's client-side
    // grouping has nothing left to merge.
    expect(groups.every((g) => g.members.length === 1)).toBe(true)
    expect(groups[0]).toMatchObject({ kind: 'yara', message: 'yara matched on yara:abc123', count: 12, acknowledged: false })
    // The key's own prefix is the only kind the document carries.
    expect(groups.map((g) => g.kind).sort()).toEqual(['pipeline', 'stale', 'yara'])
  })

  it('reads every alert as info: the document has no severity field at all', async () => {
    // Gap #2. worker.rs writes Key/Message/Link/FirstSeen/LastSeen/Count/
    // Acknowledged/LastNotified — there is no severity to read, so nothing
    // is inferred from the key. Every row, and no exception.
    stub(operationsFixtures())
    const groups = await live('getAlerts')()
    expect(groups.map((g) => g.severity)).toEqual(['info', 'info', 'info'])
    expect(groups.every((g) => g.members.every((m) => m.severity === 'info'))).toBe(true)
  })

  it('carries no acknowledger, because the document has nowhere to put one', async () => {
    // Gap #2, second half: `acknowledgedBy` has no source at all upstream.
    stub(operationsFixtures())
    const [group] = await live('getAlerts')()
    expect(group.members[0]).not.toHaveProperty('acknowledgedBy')
  })

  it('counts the open alerts from the same page, for the shell bell', async () => {
    const calls = stub(operationsFixtures())
    expect(await live('getOpenAlertCount')()).toBe(2)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/alerts')
  })

  it('POSTs the ack body the handler requires, once per key', async () => {
    // `ack` has no serde default (stores.rs AckBody), so the direction rides
    // in the body — that is what makes a reopen the same call, flipped.
    const calls = stub(operationsFixtures({ '/api/v1/alerts/yara%3Aabc123/ack': { ok: true, key: 'yara:abc123', ack: true } }))
    await live('setAlertsAcknowledged')(['yara:abc123'], true)
    const call = vi.mocked(globalThis.fetch).mock.calls.at(-1)!
    expect(call[0]).toBe('http://backend.test/api/v1/alerts/yara%3Aabc123/ack')
    expect(call[1]?.method).toBe('POST')
    expect(JSON.parse(String(call[1]?.body))).toEqual({ ack: true })
    // Two calls, not one: `guardReadOnly` spends a config read on every write,
    // because a query named `get*` can still be a write and only the config
    // document says so.
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/config', '/api/v1/alerts/yara%3Aabc123/ack'])
  })

  it('reopens with the same call, flag flipped', async () => {
    stub(operationsFixtures({ '/api/v1/alerts/stale%3Acowrie/ack': { ok: true, key: 'stale:cowrie', ack: false } }))
    await live('setAlertsAcknowledged')(['stale:cowrie'], false)
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls.at(-1)![1]?.body))).toEqual({ ack: false })
  })

  it('acknowledges N keys as N requests — there is no bulk endpoint', async () => {
    // Gap #1. The loop is the contract, not a workaround: stores.rs exposes
    // one POST per key and no scope=all to ask for.
    const calls = stub(operationsFixtures({
      '/api/v1/alerts/yara%3Aabc123/ack': { ok: true, key: 'yara:abc123', ack: true },
      '/api/v1/alerts/stale%3Acowrie/ack': { ok: true, key: 'stale:cowrie', ack: true },
    }))
    expect(await live('acknowledgeAllAlerts')()).toBe(2)
    // One page read plus one POST per OPEN key: the already-acknowledged
    // record is skipped, so the call count follows the open set. The
    // read-only guard is spent once per WRITE CALL, not once per key.
    expect(calls.map((url) => new URL(url).pathname)).toEqual([
      '/api/v1/config',
      '/api/v1/alerts',
      '/api/v1/config',
      '/api/v1/alerts/yara%3Aabc123/ack',
      '/api/v1/alerts/stale%3Acowrie/ack',
    ])
  })

  it('acknowledges nothing when every alert is already acknowledged', async () => {
    const calls = stub(operationsFixtures({ '/api/v1/alerts': { total: 1, rows: [alertDoc('yara:abc123', true)] } }))
    expect(await live('acknowledgeAllAlerts')()).toBe(0)
    // The page read and the two read-only guards; with no open key left there
    // is no POST to spend.
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/config', '/api/v1/alerts', '/api/v1/config'])
  })

  it('finds a group page by key in the same store page the board reads', async () => {
    const calls = stub(operationsFixtures())
    const detail = await live('getAlertDetail')('yara:abc123')
    expect(detail?.group).toMatchObject({ kind: 'yara', members: [{ key: 'yara:abc123' }] })
    expect(new URL(calls[0]).pathname).toBe('/api/v1/alerts')
    // A key the store does not hold is the page's own 404.
    expect(await live('getAlertDetail')('nope')).toBeNull()
  })

  it('picks the evidence pane pivots off the message and the link', async () => {
    stub(operationsFixtures({
      '/api/v1/alerts': { total: 1, rows: [{ ...alertDoc('yara:abc123'), Message: 'malware d41d8cd98f00b204e9800998ecf8427e00000000000000000000000000000000 from 203.0.113.42', Link: '/events?q=198.51.100.7' }] },
    }))
    const detail = await live('getAlertDetail')('yara:abc123')
    expect(detail?.sources.sort()).toEqual(['198.51.100.7', '203.0.113.42'])
    // A 32-hex name is a MD5 of the empty string, not a hash of anything
    // here: the pane pivots on sha256 digests, so only a 64-hex run counts.
    expect(detail?.hashes).toEqual(['d41d8cd98f00b204e9800998ecf8427e00000000000000000000000000000000'])
    expect(detail?.hashes).not.toContain('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('refuses a write while the deployment is read-only', async () => {
    stub(operationsFixtures({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } }))
    await expect(live('setAlertsAcknowledged')(['yara:abc123'], true)).rejects.toThrow(ApiError)
    await expect(live('acknowledgeAllAlerts')()).rejects.toThrow(ApiError)
  })
})

describe('the dead-letter purge, an admin-only destructive write', () => {
  it('DELETEs the same q scope the list searched', async () => {
    // The issue body says `/api/v1/store/dead-letters`, and there is no such
    // literal route: the route IS `/api/v1/store/{name}` (stores.rs L553 /
    // L601) and `name` is the allowlist key `store_config` spells
    // "dead-letters". So the path is the same, and the scope is `q`.
    const calls = stub(operationsFixtures({ '/api/v1/store/dead-letters': { deleted: 7 } }))
    expect(await live('purgeDeadLetters')('mapper_parsing_exception')).toBe(7)
    expect(calls).toHaveLength(2)
    const call = vi.mocked(globalThis.fetch).mock.calls.at(-1)!
    expect(call[1]?.method).toBe('DELETE')
    expect(new URL(String(call[0])).searchParams.get('q')).toBe('mapper_parsing_exception')
  })

  it('purges every retained dead letter when the query box is empty', async () => {
    // The documented "the operator purges exactly the scope they were looking
    // at" contract: an absent q is a match_all, not a no-op.
    const calls = stub(operationsFixtures({ '/api/v1/store/dead-letters': { deleted: 91 } }))
    expect(await live('purgeDeadLetters')('   ')).toBe(91)
    expect(new URL(String(vi.mocked(globalThis.fetch).mock.calls.at(-1)![0])).searchParams.has('q')).toBe(false)
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/config', '/api/v1/store/dead-letters'])
  })

  it('refuses a viewer before any fetch, and a session-less caller too', async () => {
    const calls = stub(operationsFixtures({ '/api/v1/store/dead-letters': { deleted: 7 } }))
    const viewer = { name: 'Analyst', email: 'a@example.test', roles: ['viewer'] }
    await expect(liveQuery('purgeDeadLetters', viewer)!('x')).rejects.toThrow(ApiError)
    await expect(liveQuery('purgeDeadLetters', null)!('x')).rejects.toThrow(ApiError)
    // Nothing reached the backend: the refusal is the seam's, made first.
    expect(calls).toEqual([])
  })

  it('still refuses under read-only', async () => {
    stub(operationsFixtures({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } }))
    await expect(live('purgeDeadLetters')('x')).rejects.toThrow(ApiError)
  })

  it('reads a row that names none of the expected keys without throwing', async () => {
    // Gap #9: the documents are written by Elasticsearch, not this repo, so
    // which keys a row carries is unverified. Every unknown degrades to a
    // blank cell, never to an exception and never to an invented value.
    stub(operationsFixtures({ '/api/v1/store/dead-letters': { total: 1, rows: [{ _doc_id: 'dl-2', '@timestamp': '2026-10-04T19:00:00Z', whatever: 'unmapped' }] } }))
    const rows = await live('getDeadLetters')('')
    expect(rows[0]).toMatchObject({ id: 'dl-2', timestamp: '2026-10-04T19:00:00Z', reason: '', source: '', index: '' })
  })

  it('reads the alternate key spellings the store rows use', async () => {
    stub(operationsFixtures({ '/api/v1/store/dead-letters': { total: 1, rows: [{ _doc_id: 'dl-3', '@timestamp': '2026-10-04T19:00:00Z', error: 'boom', pipeline: 'filebeat' }] } }))
    expect((await live('getDeadLetters')(''))[0]).toMatchObject({ reason: 'boom', source: 'filebeat' })
  })

  it('sends the query box as the store q, verbatim', async () => {
    const calls = stub(operationsFixtures())
    await live('getDeadLetters')('  mapper_parsing  ')
    const search = new URL(calls[0]).searchParams
    expect(search.get('q')).toBe('mapper_parsing')
    expect(Object.fromEntries([...search].filter(([k]) => k !== 'q'))).toEqual({ offset: '0', size: '100' })
  })

  it('leaves index empty: the store adds _doc_id, not an index field', async () => {
    // Gap #8. There is no `_index` on the row to read, so the page's column
    // is blank rather than guessed at from the store name.
    stub(operationsFixtures())
    expect((await live('getDeadLetters')(''))[0].index).toBe('')
  })
})

describe('source health', () => {
  it('maps the whole document, and reads deadLetters as the 24h count its tile claims', async () => {
    // Gap #11: the page's tile says "last 24 h", so it is fed
    // `ingest.recent_dead_letters` (3), NOT the wire's all-time
    // `dead_letters` (91) which is a different number entirely.
    const calls = stub(operationsFixtures())
    const health = await live('getSourceHealth')()
    expect(new URL(calls[0]).pathname).toBe('/api/v1/source-health')
    expect(health).toMatchObject({ clusterStatus: 'green', indexedDocuments: 12_345, deadLetters: 3, unattributed24h: 4 })
    expect(health.feeds).toEqual([{ sensor: 'cowrie', state: 'fresh', documents: 900, lastSeen: '2026-10-04T20:41:03Z' }])
    expect(health.ingest).toMatchObject({ state: 'fresh', recentDeadLetters: 3 })
  })

  it('has no webhook field to carry the delivery health', async () => {
    // Gap #10: the wire's `webhook` is typed and tested in
    // contracts/operations.ts but deliberately not added to the page type
    // (per scope), so it is dropped rather than smuggled onto another field.
    stub(operationsFixtures())
    const health = await live('getSourceHealth')()
    expect(health).not.toHaveProperty('webhook')
  })

  it('reads a cluster status the page cannot colour as yellow, never as green', async () => {
    stub(operationsFixtures({ '/api/v1/source-health': { ...healthWire, cluster_status: 'unreachable' } }))
    expect((await live('getSourceHealth')()).clusterStatus).toBe('yellow')
  })

  it('reads a disabled pipeline as stopped and a 5xx as stopped', async () => {
    stub(operationsFixtures({ '/api/v1/source-health': { ...healthWire, pipeline: { ...healthWire.pipeline, state: 'disabled' } } }))
    expect((await live('getSourceHealth')()).pipeline.state).toBe('stopped')
    stub(operationsFixtures({ '/api/v1/source-health': { ...healthWire, pipeline: { ...healthWire.pipeline, state: '503 Service Unavailable' } } }))
    expect((await live('getSourceHealth')()).pipeline.state).toBe('stopped')
    stub(operationsFixtures({ '/api/v1/source-health': { ...healthWire, pipeline: { ...healthWire.pipeline, state: '404 Not Found' } } }))
    expect((await live('getSourceHealth')()).pipeline.state).toBe('degraded')
  })
})

describe('the fleet topology', () => {
  it('joins the static shape with the feeds and the container states', async () => {
    const calls = stub(operationsFixtures())
    const topo = await live('getTopology')()
    // Three requests: the shape, the feeds and the container states are
    // three documents (topology.rs: "static fleet shape; liveness joins
    // live elsewhere").
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/services', '/api/v1/source-health', '/api/v1/topology'])
    expect(topo.sensors).toEqual([
      { sensor: 'cowrie', ingress: ['portbridge', 'tunnel-only'], hostnames: [], ports: [{ proto: 'tcp', public: 22, host: 19022 }], rawIndex: 'honeypot-v2', feed: 'fresh' },
      { sensor: 'dionaea', ingress: ['traefik'], hostnames: ['smtp.example.test'], ports: [], rawIndex: 'unmapped', feed: 'silent' },
    ])
    expect(topo.stacks).toEqual([{ stack: 'honeypot-cowrie', containers: [{ name: 'hp-cowrie', state: 'running' }] }])
  })

  it('keeps every ingress the wire emits, tunnel-only included (#261)', async () => {
    // The wire's vocabulary is traefik / portbridge / tunnel-only; all three
    // are rendered, so a management-only sensor is not shown with no ingress.
    stub(operationsFixtures())
    expect((await live('getTopology')()).sensors[0].ingress).toEqual(['portbridge', 'tunnel-only'])
  })

  it('turns flow node names into the indices the sankey wants', async () => {
    stub(operationsFixtures())
    const { flow } = await live('getTopology')()
    expect(flow.links).toEqual([{ source: 0, target: 1, value: 1 }])
  })

  it('reads an unavailable services adapter as no live state, not as stopped', async () => {
    stub(operationsFixtures({ '/api/v1/services': { available: false, services: [] } }))
    expect((await live('getTopology')()).stacks[0].containers[0]).toEqual({ name: 'hp-cowrie', state: 'unknown' })
  })

  it('fails loudly rather than showing every container as unknown', async () => {
    // The dangerous wrong answer is a topology that reads "nothing is
    // running" when the backend is merely down.
    for (const path of ['/api/v1/topology', '/api/v1/source-health', '/api/v1/services']) {
      stub(operationsFixtures({ [path]: fail(502) }))
      await expect(live('getTopology')()).rejects.toThrow(ApiError)
    }
  })
})

describe('sensors', () => {
  it('reads the catalog as the one aggregation it is', async () => {
    const calls = stub(operationsFixtures())
    expect(await live('getSensorCatalog')()).toEqual([{ sensor: 'cowrie', events: 900 }])
    expect(new URL(calls[0]).pathname).toBe('/api/v1/sensors/catalog')
  })

  it('builds a detail from the overview bundle and the sensor-event rows', async () => {
    const calls = stub(operationsFixtures())
    const detail = (await live('getSensorDetail')('cowrie'))!
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual([
      '/api/v1/sensors/cowrie/events',
      '/api/v1/sensors/cowrie/overview',
      '/api/v1/source-health',
      '/api/v1/topology',
    ])
    expect(detail).toMatchObject({ uniqueSources: 40, firstSeen: '2026-10-04T08:00:00Z', topSources: [{ label: '203.0.113.42', count: 7 }], topLists: [{ label: 'commands' }] })
    expect(detail.timeline.map((b) => b.total)).toEqual([4, 9])
    expect(detail.measures).toEqual([{ label: 'commands', value: 120, peak: '9 max' }])
    expect(detail.recentEvents).toHaveLength(1)
  })

  it('leaves byType and reading empty: the overview carries neither', async () => {
    // Gap #7. Returned empty, not faked: there is no endpoint that could
    // fill either, and a fabricated leaderboard would be a worse lie than a
    // blank panel.
    stub(operationsFixtures())
    const detail = (await live('getSensorDetail')('cowrie'))!
    expect(detail.byType).toEqual([])
    expect(detail.reading).toEqual({ what: '', columns: [], artefacts: [] })
  })

  it('leaves a live sensor identity blank rather than inventing one', async () => {
    // The catalog is a terms aggregation: it has a name, a count and a
    // last-seen, and no kind, ports, persona or location. The header's
    // "no listener" and blank decoy are the honest rendering of that.
    stub(operationsFixtures())
    const { sensor } = (await live('getSensorDetail')('cowrie'))!
    expect(sensor).toMatchObject({ id: 'cowrie', name: 'cowrie', kind: '', what: '', location: '', status: 'online', eventsLast24h: 900 })
    // The ports ARE real: the topology's exposure is the sensor's listening
    // surface, and the header lists the host leg.
    expect(sensor.ports).toEqual([{ proto: 'tcp', port: 19022 }])
  })

  it('reads the health page own verdict as the sensor status, not an inference', async () => {
    const detail = async (state: string) => {
      stub(operationsFixtures({ '/api/v1/source-health': { ...healthWire, sensors: [{ ...healthWire.sensors[0], state }] } }))
      return (await live('getSensorDetail')('cowrie'))!.sensor.status
    }
    expect(await detail('ACTIVE')).toBe('online')
    expect(await detail('QUIET')).toBe('degraded')
    expect(await detail('STALE')).toBe('degraded')
  })

  it('answers a sensor the backend does not have with null, not an error', async () => {
    stub(operationsFixtures({ '/api/v1/sensors/ghost/overview': fail(404, 'not found'), '/api/v1/sensors/ghost/events': { sensor: 'ghost', total: 0, rows: [] } }))
    // The 404 is the overview's, and the other three legs are asked in the
    // same fan-out — but only the overview decides the answer.
    expect(await live('getSensorDetail')('ghost')).toBeNull()
  })

  it('keeps a sensor-event row as the sensor wrote it, with only the classified fields filled', async () => {
    // These rows are sensors.rs `SensorEvent`, NOT the shared events.rs
    // `EventRow`: no pivots, no country, no session. The eleven gaps are
    // filled at the seam with what is genuinely absent upstream — the kind
    // off the sensor's own event name, everything else absent.
    stub(operationsFixtures())
    const [sensorEvent] = (await live('getSensorDetail')('cowrie'))!.recentEvents
    expect(sensorEvent).toMatchObject({ id: 'ev-1', sensor: 'cowrie', srcIp: '203.0.113.42', srcPort: 51322, dstPort: 19022, type: 'command.input', eventName: 'cowrie.command.input', techniques: [] })
    expect(sensorEvent.fields).toEqual({ eventid: 'cowrie.command.input', input: 'uname -a' })
    // The endpoint says nothing of these, so none of them is invented.
    for (const key of ['severity', 'protocol', 'provider', 'asn', 'org', 'city', 'country', 'sessionId', 'summary'] as const) expect(sensorEvent[key], key).toBeUndefined()
  })
})

describe('the operations slice fails as an error, never as an empty panel', () => {
  it('maps a 502 on each endpoint to the state the unavailable scenario produces', async () => {
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getSensorCatalog', () => live('getSensorCatalog')(), { '/api/v1/sensors/catalog': fail(502) }],
      ['getSensorDetail', () => live('getSensorDetail')('cowrie'), { '/api/v1/sensors/cowrie/overview': fail(502) }],
      ['getSensorDetail (events)', () => live('getSensorDetail')('cowrie'), { '/api/v1/sensors/cowrie/overview': sensorOverviewWire, '/api/v1/sensors/cowrie/events': fail(502), '/api/v1/source-health': healthWire, '/api/v1/topology': topologyWire }],
      ['getAlerts', () => live('getAlerts')(), { '/api/v1/alerts': fail(502) }],
      ['getOpenAlertCount', () => live('getOpenAlertCount')(), { '/api/v1/alerts': fail(502) }],
      ['getAlertDetail', () => live('getAlertDetail')('yara:abc123'), { '/api/v1/alerts': fail(502) }],
      ['getSourceHealth', () => live('getSourceHealth')(), { '/api/v1/source-health': fail(502) }],
      ['getDeadLetters', () => live('getDeadLetters')('x'), { '/api/v1/store/dead-letters': fail(502) }],
      ['purgeDeadLetters', () => live('purgeDeadLetters')('x'), { '/api/v1/config': configWire, '/api/v1/store/dead-letters': fail(502) }],
      ['setAlertsAcknowledged', () => live('setAlertsAcknowledged')(['k'], true), { '/api/v1/config': configWire, '/api/v1/alerts/k/ack': fail(502) }],
      ['acknowledgeAllAlerts', () => live('acknowledgeAllAlerts')(), { '/api/v1/config': configWire, '/api/v1/alerts': { total: 1, rows: [alertDoc('k')] }, '/api/v1/alerts/k/ack': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(operationsFixtures(fixtures))
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })

  it('never renders a failed operations fetch as an empty fleet', async () => {
    stub({
      '/api/v1/sensors/catalog': () => {
        throw new TypeError('fetch failed')
      },
    })
    const out = await live('getSensorCatalog')().catch((error: unknown) => error)
    expect(out).toBeInstanceOf(ApiError)
    expect((out as ApiError).kind).toBe('unavailable')
  })
})

// ---- tools (#80): canarytokens and bait credentials ------------------------

const tokenRecord = { id: 'a1b2c3d4e5f6a7b8c9d0e1f2a', token_type: 'ms_word', memo: 'finance share bait', token_url: 'http://canary.example.test/tags/a1b2/index.html', hostname: 'a1b2.canary.example.test', filename_hint: 'payroll.docx', created_by: 'analyst', created_at: '2026-10-04T09:00:00Z' }
const credentialRecord = { id: 'cred_0011223344556677', target: 'cowrie_honeyfs', path: 'home/admin/.aws/credentials', username: 'deploy', password: 'xK7pQ2mN9rT4vW8yZ3bC', content_template: 'username={{username}}\npassword={{password}}\n', memo: 'aws bait', created_by: 'analyst', created_at: '2026-10-04T08:00:00Z' }
const toolsFixtures = (over: Record<string, unknown> = {}) => ({
  '/api/v1/canarytokens/types': [{ token_type: 'ms_word', label: 'Word document', description: 'A decoy .docx that fires when opened.', requires_upload: false, supports_snippet: true }, { token_type: 'web_image', label: 'Custom web image', description: 'A web bug behind your own image.', requires_upload: true, supports_snippet: false }],
  '/api/v1/canarytokens': { tokens: [tokenRecord] },
  '/api/v1/store/canarytokens': { total: 1, rows: [{ ...tokenRecord, _doc_id: tokenRecord.id }] },
  '/api/v1/events': { total: 1, offset: 0, rows: [{ id: 'ev-f1', time: '2026-10-04T20:41:03Z', sensor: 'canarytokens', src_ip: '203.0.113.42', country: 'NL', detail: 'callback', record: { honeypot: { token_type: 'ms_word', channel: 'http', manage_url: 'https://canary.example.test/manage?token=x', memo: 'file opened' } } }] },
  '/api/v1/credentials': { available: true, credentials: [credentialRecord] },
  '/api/v1/config': configWire,
  ...over,
})

// ---- Reports (#79) ----------------------------------------------------------

/** The catalog, as reports_api.rs `templates` writes it: the four artifact
 * flags and the template's own title/theme/window that the page type has no
 * field for. */
const templatesWire = {
  templates: [
    { id: 'executive', name: 'Executive', description: 'One-page brief', title: 'Executive brief', theme: 'dark', window: '7d', elements: ['summary'], sandbox: false, payload: false, ghidra: false },
    { id: 'payload', name: 'Payload', description: 'One sample', title: 'Payload report', theme: 'dark', window: '30d', elements: ['summary', 'appendix'], sandbox: false, payload: true, ghidra: false },
  ],
  elements: [{ id: 'summary', label: 'Summary', description: 'Headline numbers' }],
}

/** A saved definition as the store holds it. `network` is on the wire scope
 * and has no page counterpart; `updated` has no page field either. */
const definitionWire = {
  id: 'rd_7f3a',
  name: 'Weekly SSH brief',
  template: 'executive',
  theme: 'light',
  branding: { title: 'SSH activity', author: 'SOC', classification: 'TLP:AMBER' },
  scope: { window: '7d', ip: '203.0.113.42', network: '203.0.113.0/24', sensor: 'cowrie' },
  elements: ['summary'],
  appendix_limit: 50,
  schedule: { enabled: true, frequency: 'weekly', hour: 6, minute: 30, weekday: 1, month_day: 1, next_run_at: '2026-10-05T06:30:00Z', failures: 0 },
  created: '2026-09-01T10:00:00Z',
  updated: '2026-09-20T10:00:00Z',
}

const generatedWire = {
  id: 'gr_19c2',
  definition_id: 'rd_7f3a',
  name: 'Weekly SSH brief',
  template: 'executive',
  theme: 'light',
  title: 'SSH activity',
  size_bytes: 184_320,
  created_at: '2026-09-28T06:30:04Z',
  origin: 'schedule',
}

const reportsFixtures = (over: Record<string, unknown> = {}) => ({
  '/api/v1/reports/templates': templatesWire,
  '/api/v1/reports/definitions': { definitions: [definitionWire] },
  '/api/v1/store/generated-reports': { total: 1, rows: [{ ...generatedWire, _doc_id: 'gr_19c2' }] },
  '/api/v1/config': configWire,
  ...over,
})

/** The POST bodies the stub was asked to send, by path. `stub` records URLs
 * only, so a body assertion goes through the recorded request directly. */
const bodiesOf = (): Array<{ path: string; body: unknown }> =>
  (globalThis.fetch as unknown as { mock: { calls: Array<[string, { body: string } | undefined]> } }).mock.calls
    .map(([url, init]) => ({ path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : undefined }))
    // The read-only guard reads /api/v1/config before every write; that GET
    // carries no body and is not what these assertions are about.
    .filter((call) => call.body !== undefined)

describe('the tools slice reads the endpoints the Rust tier actually serves', () => {
  it('builds the canarytokens page from types, the store page and the fired events', async () => {
    const calls = stub(toolsFixtures())
    const out = await live('getCanarytokens')()
    expect(calls.map((url) => `${new URL(url).pathname}${new URL(url).search}`).sort()).toEqual([
      '/api/v1/canarytokens/types',
      // A year of fired tokens: the page shows every trigger it can.
      '/api/v1/events?sensor=canarytokens&size=50&since=365d',
      // The store page, at the handler's own default size — the page does
      // not page the token list, so no bigger one is invented.
      '/api/v1/store/canarytokens?offset=0&size=25',
    ])
    expect(out.types.map((t) => t.type)).toEqual(['ms_word', 'web_image'])
    expect(out.tokens).toEqual([{ id: 'a1b2c3d4e5f6a7b8c9d0e1f2a', type: 'ms_word', memo: 'finance share bait', url: 'http://canary.example.test/tags/a1b2/index.html', hostname: 'a1b2.canary.example.test', createdAt: '2026-10-04T09:00:00Z', createdBy: 'analyst', artifact: 'payroll.docx' }])
    expect(out.triggers).toEqual([{ id: 'ev-f1', tokenId: '', memo: 'file opened', type: 'ms_word', triggeredAt: '2026-10-04T20:41:03Z', srcIp: '203.0.113.42', userAgent: '', location: 'NL', manageUrl: 'https://canary.example.test/manage?token=x' }])
  })

  it('leaves the two event-row gaps empty rather than inventing them', async () => {
    // Gaps #1 and #2. An events.rs row carries no canarytoken id and no user
    // agent, so the adapter leaves both `''`. A guess would put a token id
    // next to a wrong token's trigger.
    stub(toolsFixtures())
    const [trigger] = (await live('getCanarytokens')()).triggers
    expect(trigger.tokenId).toBe('')
    expect(trigger.userAgent).toBe('')
  })

  it('falls back to the row detail when the record carries no honeypot memo', async () => {
    // Gap #3: `record.honeypot.memo` where there is one, `detail` otherwise.
    stub(toolsFixtures({ '/api/v1/events': { total: 1, offset: 0, rows: [{ id: 'ev-f2', time: '2026-10-04T21:00:00Z', sensor: 'canarytokens', src_ip: '198.51.100.7', country: '', detail: 'dns lookup', record: {} }] } }))
    const [trigger] = (await live('getCanarytokens')()).triggers
    expect(trigger.memo).toBe('dns lookup')
  })

  it('mints a token through POST /api/v1/canarytokens, with the actor as created_by', async () => {
    stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    process.env.BACKEND_URL = 'http://backend.test'
    // The OIDC username, not the display name (#256): `created_by` must match
    // the `x-actor-username` and the signed assertion's username claim.
    const analyst = rememberActor({ name: 'Ada Analyst', email: 'a@example.test', roles: ['viewer' as const] }, { sub: 'oidc|7', username: 'ada.analyst' })
    // A freshly minted token carries no filename_hint — the backend stamps
    // the file name onto the STORED record, not the created one (canarytokens.rs:246).
    const token = await (liveQuery('createCanarytoken', analyst) as Backend['createCanarytoken'])({ type: 'ms_word', memo: 'payroll', snippet: 'Q3 adjustments' })
    expect(bodiesOf()).toEqual([{ path: '/api/v1/canarytokens', body: { token_type: 'ms_word', memo: 'payroll', created_by: 'ada.analyst', include_text_snippet: true, text_snippet: 'Q3 adjustments' } }])
    expect(token).toMatchObject({ id: 'a1b2c3d4e5f6a7b8c9d0e1f2a', type: 'ms_word', memo: 'finance share bait' })
  })

  it('sends no snippet and no file fields the dialog left blank', async () => {
    stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    await live('createCanarytoken')({ type: 'ms_word', memo: 'payroll' })
    expect(bodiesOf()[0].body).toEqual({ token_type: 'ms_word', memo: 'payroll', created_by: '' })
  })

  it('leaves created_by blank for a caller with no known username, never the display name', async () => {
    stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    await (liveQuery('createCanarytoken', { name: 'Ada Analyst', email: 'a@example.test', roles: ['viewer' as const] }) as Backend['createCanarytoken'])({ type: 'ms_word', memo: 'payroll' })
    expect(bodiesOf()[0].body).toEqual({ token_type: 'ms_word', memo: 'payroll', created_by: '' })
  })

  it('sends a web image as base64 with its name and content type', async () => {
    stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    const png = btoa('\x89PNG-bytes')
    await live('createCanarytoken')({ type: 'web_image', memo: 'badge', image: { name: 'badge.png', contentType: 'image/png', base64: png } })
    expect(bodiesOf()).toEqual([{ path: '/api/v1/canarytokens', body: { token_type: 'web_image', memo: 'badge', created_by: '', file_base64: png, file_name: 'badge.png', file_content_type: 'image/png' } }])
  })

  // The trust boundary: each of these is refused before the read-only guard
  // or the create call fetches anything, so the stub records no request.
  it.each([
    ['a non-image type', { name: 'run.exe', contentType: 'application/octet-stream', base64: btoa('MZ') }, 'Use a PNG, JPEG or GIF image.'],
    ['malformed base64', { name: 'a.png', contentType: 'image/png', base64: 'not base64!' }, 'The image is not valid base64.'],
    ['an empty file', { name: 'a.png', contentType: 'image/png', base64: '' }, 'The image is empty.'],
    ['a missing file name', { name: '', contentType: 'image/png', base64: btoa('x') }, 'The image needs a file name.'],
  ])('refuses %s before any request', async (_, image, detail) => {
    const calls = stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    const error = await live('createCanarytoken')({ type: 'web_image', memo: 'badge', image }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('invalid')
    expect((error as ApiError).detail).toBe(detail)
    expect(calls).toEqual([])
  })

  it('refuses an image over 8 MiB decoded, and accepts one exactly at the limit', async () => {
    // 'AAAA' decodes to three zero bytes, so 4k characters are 3k bytes.
    const calls = stub(toolsFixtures({ '/api/v1/canarytokens': tokenRecord }))
    const over = 'A'.repeat(4 * 2796203) // 8 MiB + 1 byte
    await expect(live('createCanarytoken')({ type: 'web_image', memo: 'badge', image: { name: 'big.png', contentType: 'image/png', base64: over } })).rejects.toThrow(ApiError)
    expect(calls).toEqual([])
    const atLimit = 'A'.repeat(4 * 2796202) // 8 MiB exactly
    await live('createCanarytoken')({ type: 'web_image', memo: 'badge', image: { name: 'edge.png', contentType: 'image/png', base64: atLimit } })
    expect(bodiesOf()[0].path).toBe('/api/v1/canarytokens')
  })

  it('reads the credentials and the linkable tokens from the two list endpoints', async () => {
    const calls = stub(toolsFixtures())
    const out = await live('getCredentials')()
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/canarytokens', '/api/v1/credentials'])
    expect(out.credentials).toEqual([{ id: 'cred_0011223344556677', target: 'cowrie_honeyfs', path: 'home/admin/.aws/credentials', username: 'deploy', password: 'xK7pQ2mN9rT4vW8yZ3bC', memo: 'aws bait', template: 'username={{username}}\npassword={{password}}\n', createdAt: '2026-10-04T08:00:00Z', createdBy: 'analyst' }])
    expect(out.tokens).toHaveLength(1)
  })

  it('offers only the one target credentials.rs implements', async () => {
    // Gap #5: `create` refuses any target but cowrie_honeyfs with a 400
    // (credentials.rs:157) and there is no listing endpoint, so the picker
    // offers that one rather than the sensor list the mock derives.
    stub(toolsFixtures())
    expect((await live('getCredentials')()).targets).toEqual(['cowrie_honeyfs'])
  })

  it('throws on available:false — an ES outage comes back as a 200', async () => {
    // Gap #7, and the one this slice most exists to get right. credentials.rs
    // answers a dead store with HTTP 200 and an empty list, which the seam
    // hands back as a success. Returning [] renders "no credentials" for an
    // outage, and an operator reads an empty list as "we have none" and
    // never looks for the Elasticsearch fault.
    stub(toolsFixtures({ '/api/v1/credentials': { available: false, error: 'index_not_found_exception', credentials: [] } }))
    const out = await live('getCredentials')().catch((error: unknown) => error)
    expect(out).toBeInstanceOf(ApiError)
    expect((out as ApiError).kind).toBe('unavailable')
    expect((out as ApiError).detail).toBe('index_not_found_exception')
  })

  it('still answers [] for an AVAILABLE store that holds none', async () => {
    // The other side of the same gap: `available: true` with no records is a
    // real empty list, and must not be turned into an error.
    stub(toolsFixtures({ '/api/v1/credentials': { available: true, credentials: [] } }))
    expect((await live('getCredentials')()).credentials).toEqual([])
  })

  it('plants a credential with the actor in the body, where CreateBody reads it', async () => {
    stub(toolsFixtures({ '/api/v1/credentials': credentialRecord }))
    await live('provisionCredential')({ path: 'home/deploy/.aws/credentials', target: 'cowrie_honeyfs', username: 'deploy', password: 'pw', memo: 'aws bait', template: '' })
    // An empty template is left empty so the backend applies its own
    // DEFAULT_CONTENT_TEMPLATE rather than this tier hard-coding a copy.
    expect(bodiesOf()[0]).toEqual({ path: '/api/v1/credentials', body: { path: 'home/deploy/.aws/credentials', username: 'deploy', password: 'pw', memo: 'aws bait', target: 'cowrie_honeyfs', actor_subject: '', actor_username: '' } })
  })

  it('rotates and links through the record-returning POSTs, dropping the record', async () => {
    // Gap #6: both handlers answer the full record and the page's seam
    // returns void, so the new password and the link id are dropped here and
    // the page re-reads the credential — as it does on the mock.
    stub(toolsFixtures({ '/api/v1/credentials/cred_0011223344556677/rotate': { ...credentialRecord, password: 'newSecret' }, '/api/v1/credentials/cred_0011223344556677/link-token': { ...credentialRecord, linked_token_id: 'a1b2' } }))
    expect(await live('rotateCredential')('cred_0011223344556677')).toBeUndefined()
    expect(await live('linkCredentialToken')('cred_0011223344556677', 'a1b2')).toBeUndefined()
    expect(bodiesOf()).toEqual([
      { path: '/api/v1/credentials/cred_0011223344556677/rotate', body: { actor_subject: '', actor_username: '' } },
      { path: '/api/v1/credentials/cred_0011223344556677/link-token', body: { token_id: 'a1b2', actor_subject: '', actor_username: '' } },
    ])
  })

  it('unlinks with an empty token_id, which is how the handler reads it', async () => {
    stub(toolsFixtures({ '/api/v1/credentials/cred_0011223344556677/link-token': credentialRecord }))
    await live('linkCredentialToken')('cred_0011223344556677')
    expect(bodiesOf()[0].body).toEqual({ token_id: '', actor_subject: '', actor_username: '' })
  })

  it('keeps the three credential writes admin-only on the live path', async () => {
    const analyst = { id: 'u', name: 'A', email: 'a@example.test', roles: ['viewer' as const] }
    for (const name of ['provisionCredential', 'rotateCredential', 'linkCredentialToken'] as const) {
      // Refused before any fetch — the seam applies the same decision
      // `backend()` does, so a role is refused identically on either tier.
      const refused = await (liveQuery(name, analyst) as (...a: never[]) => Promise<unknown>)(...(name === 'provisionCredential' ? [{ path: 'p', target: '', username: 'u', password: 'p', memo: 'm', template: '' }] : ['cred-1', undefined]) as never[]).catch((error: unknown) => error)
      expect(refused, name).toBeInstanceOf(ApiError)
      expect((refused as ApiError).kind, name).toBe('forbidden')
    }
  })

  it('honours read-only before minting or planting', async () => {
    stub(toolsFixtures({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } }))
    await expect(live('createCanarytoken')({ type: 'ms_word', memo: 'payroll' })).rejects.toThrow(ApiError)
    await expect(live('provisionCredential')({ path: 'p', target: '', username: 'u', password: 'p', memo: 'm', template: '' })).rejects.toThrow(ApiError)
  })

  it('maps a failed tools fetch to an error, never to an empty panel', async () => {
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getCanarytokens', () => live('getCanarytokens')(), { '/api/v1/canarytokens/types': fail(502) }],
      ['getCredentials', () => live('getCredentials')(), { '/api/v1/credentials': fail(502) }],
      ['createCanarytoken', () => live('createCanarytoken')({ type: 'ms_word', memo: 'm' }), { '/api/v1/canarytokens': fail(502) }],
      ['provisionCredential', () => live('provisionCredential')({ path: 'p', target: '', username: 'u', password: 'p', memo: 'm', template: '' }), { '/api/v1/credentials': fail(502) }],
      ['rotateCredential', () => live('rotateCredential')('cred-1'), { '/api/v1/credentials/cred-1/rotate': fail(502) }],
      ['linkCredentialToken', () => live('linkCredentialToken')('cred-1', 'tok'), { '/api/v1/credentials/cred-1/link-token': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(toolsFixtures(fixtures))
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })
})

const savedDefinition = {
  id: '', name: 'Draft', template: 'executive', theme: 'dark' as const, elements: ['summary'],
  scope: { window: '7d', ip: [], sensor: [], port: [], signature: [] },
  branding: { title: '', author: '', headerLeft: '', headerRight: '', footerLeft: '', classification: '' },
  schedule: null, appendixLimit: 50, created: '',
}

describe('the reports studio reads its three documents', () => {
  it('maps the catalog, the definitions and the generated history into one page', async () => {
    const calls = stub(reportsFixtures())
    const data = await live('getReports')()
    // `size` is the generic store handler's own cap (stores.rs store_page).
    expect(new URL(calls[2]).searchParams.get('size')).toBe('100')
    expect(data.templates[0]).toEqual({ id: 'executive', name: 'Executive', description: 'One-page brief', elements: ['summary'] })
    expect(data.elements).toEqual(templatesWire.elements)
    expect(data.definitions[0]).toMatchObject({ id: 'rd_7f3a', theme: 'light', scope: { window: '7d', ip: ['203.0.113.42'], sensor: ['cowrie'] } })
    // The generated store row carries `_doc_id` beside the meta; the id comes
    // off the meta and the extra field is dropped, not merged.
    expect(data.generated).toEqual([{ id: 'gr_19c2', title: 'SSH activity', template: 'executive', origin: 'schedule', createdAt: generatedWire.created_at, sizeBytes: 184_320, definitionId: 'rd_7f3a' }])
  })

  it('fails as an error, never as a studio with nothing in it', async () => {
    stub({ ...reportsFixtures(), '/api/v1/store/generated-reports': fail(502) })
    await expect(live('getReports')()).rejects.toThrow(ApiError)
    stub({ ...reportsFixtures(), '/api/v1/reports/definitions': () => { throw new TypeError('fetch failed') } })
    await expect(live('getReports')()).rejects.toThrow(ApiError)
  })
})

describe('the reports slice gaps, each one where it belongs', () => {
  it('GAP 1: a scope filter is one string on the wire and a list on the page, so both directions are lossy', async () => {
    // Read: three values on the page, the first on the wire. The store builds
    // a single term query, so a second value has nowhere to go.
    stub(reportsFixtures())
    const [def] = (await live('getReports')()).definitions
    expect(def.scope.ip).toEqual(['203.0.113.42'])

    // Save: the page keeps three, the body keeps one.
    const calls = stub(reportsFixtures({ '/api/v1/reports/definitions': { definition: definitionWire } }))
    await live('saveReportDefinition')({ ...savedDefinition, scope: { ...savedDefinition.scope, ip: ['203.0.113.42', '198.51.100.4'] } })
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]?.body)).scope.ip).toBe('203.0.113.42')
    expect(calls).toHaveLength(2)
  })

  it('GAP 2: the wire scope keys with no page field are lost on a page round-trip', async () => {
    // `network` is in the store's scope and the page type has nowhere to put
    // it, so the page never shows it and a save never sends it back — the
    // definition is silently re-scoped on the next edit. Asserted, not fixed:
    // adding a page field is a types.ts change this slice does not make.
    stub(reportsFixtures())
    const [def] = (await live('getReports')()).definitions
    expect(definitionWire.scope.network).toBe('203.0.113.0/24')
    expect(JSON.stringify(def)).not.toContain('203.0.113.0/24')

    const calls = stub(reportsFixtures({ '/api/v1/reports/definitions': { definition: definitionWire } }))
    await live('saveReportDefinition')({ ...savedDefinition, id: 'rd_7f3a' })
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]?.body)).scope).not.toHaveProperty('network')
    expect(calls).toHaveLength(2)
  })

  it('GAP 3: a disabled schedule reads as no schedule, so saving re-sends it as no schedule', async () => {
    // The page has no on/off, so `enabled: false` becomes `schedule: null`
    // and the save body omits `schedule` entirely. That is the backend's own
    // behaviour (reports_store stores the absent schedule as disabled), not a
    // bug papered over here: the schedule the operator disabled stays off.
    stub(reportsFixtures({ '/api/v1/reports/definitions': { definitions: [{ ...definitionWire, schedule: { enabled: false, frequency: 'weekly', hour: 6, minute: 30, weekday: 1, month_day: 1 } }] } }))
    const [def] = (await live('getReports')()).definitions
    expect(def.schedule).toBeNull()

    stub(reportsFixtures({ '/api/v1/reports/definitions': { definition: definitionWire } }))
    await live('saveReportDefinition')(def)
    expect(JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]?.body))).not.toHaveProperty('schedule')
  })

  it('GAP 3b: schedule.enabled=false and schedule.failures have no page field, and failures is not sent back', async () => {
    // `failures` is the scheduler's own consecutive-failure counter, cleared
    // by any success. The page type has no field for it, so a save would
    // reset it — here the body omits the whole schedule rather than sending a
    // fabricated `failures: 0`, which is what keeps the counter intact.
    stub(reportsFixtures({ '/api/v1/reports/definitions': { definitions: [{ ...definitionWire, schedule: { ...definitionWire.schedule, failures: 7 } }] } }))
    const [def] = (await live('getReports')()).definitions
    expect(JSON.stringify(def)).not.toContain('failures')

    stub(reportsFixtures({ '/api/v1/reports/definitions': { definition: definitionWire } }))
    await live('saveReportDefinition')(def)
    const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]?.body))
    expect(body.schedule).toEqual({ enabled: true, frequency: 'weekly', hour: 6, minute: 30, weekday: 1, month_day: 1 })
  })

  it('GAP 4: the wire fields with no page field are dropped, and an empty generated title falls back to name', async () => {
    // `updated` on the definition; the template's title/theme/window and its
    // sandbox/payload/ghidra flags; the generated row's `name` and `theme`.
    stub(reportsFixtures())
    const data = await live('getReports')()
    expect(definitionWire.updated).toBe('2026-09-20T10:00:00Z')
    expect(JSON.stringify(data.definitions[0])).not.toContain('2026-09-20T10:00:00Z')
    // The artifact flag that says which template this is: `payload: true` on
    // the wire, and nothing on the page to put it in.
    expect(JSON.stringify(data.templates[1])).not.toContain('Payload report')
    expect(JSON.stringify(data.templates[1])).not.toContain('30d')
    expect(JSON.stringify(data.generated[0])).not.toContain('Executive brief')

    // The fallback is the one that is not a loss: the history row's title
    // reads from `name` when `title` is empty.
    stub(reportsFixtures({ '/api/v1/store/generated-reports': { total: 1, rows: [{ ...generatedWire, title: '', _doc_id: 'gr_19c2' }] } }))
    expect((await live('getReports')()).generated[0].title).toBe('Weekly SSH brief')
  })

  it('GAP 5: the sandbox-run and payload search lists are typed with no seam function and no page type', async () => {
    // contracts/reports.ts types SandboxRunPageWire and PayloadSearchPageWire
    // for the artifact pickers `generatePayloadReport` and `generateReportFrom`
    // would need. No page type consumes them, so nothing fetches them; the
    // assertion is that adding one is not needed to build the studio and that
    // the two generators work without picker data.
    stub(reportsFixtures({ [`/api/v1/payloads/${'a'.repeat(64)}/report`]: { id: 'gr_a', generated: { ...generatedWire, id: 'gr_a', definition_id: '', name: 'Payload aaa', title: '' } } }))
    const made = await live('generatePayloadReport')('a'.repeat(64))
    expect(made).toMatchObject({ id: 'gr_a', title: 'Payload aaa', definitionId: '' })
  })

  it('GAP 6: previewReport has no endpoint, so it answers null without a request', async () => {
    // Verified in the Rust router: lib.rs registers templates, the three
    // definition routes, generate, delete_generated and generate_payload_report,
    // and nothing else under /api/v1/reports. There is no preview route, so the
    // live tier answers null (APIARY#3524) and must not reach the backend.
    const calls = stub(reportsFixtures())
    expect(liveQueryNames()).toContain('previewReport')
    const preview = await live('previewReport')({ ...savedDefinition, id: '' })
    expect(preview).toBeNull()
    expect(calls).toEqual([])
  })

  it('GAP 7: both deletes answer { deleted: id } and the page type is void, so nothing adapts', async () => {
    const calls = stub(reportsFixtures({
      '/api/v1/reports/definitions/rd_7f3a': { deleted: 'rd_7f3a' },
      '/api/v1/reports/generated/gr_19c2': { deleted: 'gr_19c2' },
    }))
    await expect(live('deleteReportDefinition')('rd_7f3a')).resolves.toBeUndefined()
    await expect(live('deleteGeneratedReport')('gr_19c2')).resolves.toBeUndefined()
    // One config read per delete (the guard), then one request each.
    expect(calls).toEqual([
      'http://backend.test/api/v1/config',
      'http://backend.test/api/v1/reports/definitions/rd_7f3a',
      'http://backend.test/api/v1/config',
      'http://backend.test/api/v1/reports/generated/gr_19c2',
    ])
  })
})

describe('the reports writes', () => {
  it('creates with POST and replaces with PUT, because the backend refuses the other pairing', async () => {
    // create_definition 400s a non-empty id ("id is assigned by the server"),
    // and replace_definition 400s an id that disagrees with the path.
    const calls = stub(reportsFixtures({
      '/api/v1/reports/definitions': { definition: definitionWire },
    }))
    await live('saveReportDefinition')(savedDefinition)
    expect(calls[1]).toBe('http://backend.test/api/v1/reports/definitions')
    expect(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]).toMatchObject({ method: 'POST' })

    stub(reportsFixtures({ '/api/v1/reports/definitions/rd_7f3a': { definition: definitionWire } }))
    const saved = await live('saveReportDefinition')({ ...savedDefinition, id: 'rd_7f3a' })
    expect(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]).toMatchObject({ method: 'PUT' })
    expect(saved).toMatchObject({ id: 'rd_7f3a', theme: 'light' })
  })

  it('generates a saved definition, and a payload report with no definition at all', async () => {
    const calls = stub(reportsFixtures({
      '/api/v1/reports/definitions/rd_7f3a/generate': { generated: generatedWire },
      '/api/v1/payloads/bb/report': { id: 'gr_bb', generated: { ...generatedWire, id: 'gr_bb', definition_id: '', name: 'Payload bb', title: '' } },
    }))
    expect(await live('generateReport')('rd_7f3a')).toMatchObject({ id: 'gr_19c2', origin: 'schedule' })
    // origin defaults to "manual" server-side and the body is optional, so
    // this is an empty POST rather than a repeated default.
    expect(vi.mocked(globalThis.fetch).mock.calls[WRITE_AT][1]).toMatchObject({ method: 'POST' })
    expect(await live('generatePayloadReport')('bb')).toMatchObject({ id: 'gr_bb', title: 'Payload bb', definitionId: '' })
    expect(calls[WRITE_AT + 2]).toBe('http://backend.test/api/v1/payloads/bb/report')
  })

  it('the wizard generates through a saved definition, and drops it again for a one-off', async () => {
    // generate takes an id and reads the definition out of the store, so a
    // draft must exist first. keep: true keeps it and returns it; keep: false
    // creates, generates, then deletes — the same store state the mock leaves.
    const created = { definition: { ...definitionWire, id: 'rd_new' } }
    stub(reportsFixtures({
      '/api/v1/reports/definitions': created,
      '/api/v1/reports/definitions/rd_new/generate': { generated: { ...generatedWire, id: 'gr_new', definition_id: 'rd_new' } },
    }))
    const kept = await live('generateReportFrom')(savedDefinition, true)
    expect(kept.definition).toMatchObject({ id: 'rd_new' })
    expect(kept.report).toMatchObject({ id: 'gr_new', definitionId: 'rd_new' })

    // Each composed write makes the read-only check itself, which re-reads
    // /api/v1/config. The requests are the contract; how many times the guard
    // asks for the config is its own business, so those reads are filtered.
    const requests = vi.mocked(globalThis.fetch).mock.calls.map((call) => [String(call[0]), (call[1])?.method]).filter(([url]) => url !== 'http://backend.test/api/v1/config')
    expect(requests).toEqual([
      ['http://backend.test/api/v1/reports/definitions', 'POST'],
      ['http://backend.test/api/v1/reports/definitions/rd_new/generate', 'POST'],
    ])

    vi.clearAllMocks()
    stub(reportsFixtures({
      '/api/v1/reports/definitions': created,
      '/api/v1/reports/definitions/rd_new/generate': { generated: { ...generatedWire, id: 'gr_new', definition_id: 'rd_new' } },
      '/api/v1/reports/definitions/rd_new': { deleted: 'rd_new' },
    }))
    const once = await live('generateReportFrom')(savedDefinition, false)
    expect(once.definition).toBeUndefined()
    expect(once.report).toMatchObject({ id: 'gr_new' })
    expect(vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0])).filter((url) => url !== 'http://backend.test/api/v1/config')).toEqual([
      'http://backend.test/api/v1/reports/definitions',
      'http://backend.test/api/v1/reports/definitions/rd_new/generate',
      'http://backend.test/api/v1/reports/definitions/rd_new',
    ])
  })

  it('refuses every reports write in read-only mode, the guard the Rust tier has no concept of', async () => {
    const locked = { ...configWire, payload: { ...configWire.payload, behavior: { ...configWire.payload.behavior, read_only: true } } }
    const calls = stub(reportsFixtures({ '/api/v1/config': locked }))
    await expect(live('saveReportDefinition')(savedDefinition)).rejects.toThrow(ApiError)
    await expect(live('deleteReportDefinition')('rd_7f3a')).rejects.toThrow(ApiError)
    await expect(live('generateReport')('rd_7f3a')).rejects.toThrow(ApiError)
    await expect(live('deleteGeneratedReport')('gr_19c2')).rejects.toThrow(ApiError)
    await expect(live('generatePayloadReport')('bb')).rejects.toThrow(ApiError)
    await expect(live('generateReportFrom')(savedDefinition, true)).rejects.toThrow(ApiError)
    // One config read per refused write, and nothing else: no write reached
    // the backend.
    expect(new Set(calls)).toEqual(new Set(['http://backend.test/api/v1/config']))
    expect(calls).toHaveLength(6)
  })

  it('refuses a non-admin the same writes the mock refuses them', async () => {
    stub(reportsFixtures())
    const viewer = { id: 'u', name: 'A', email: 'a@example.test', roles: ['viewer' as const] }
    await expect(liveQuery('saveReportDefinition', viewer)!(savedDefinition)).rejects.toThrow(ApiError)
    await expect(liveQuery('generateReport', viewer)!('rd_7f3a')).rejects.toThrow(ApiError)
    // getReports is a read, so the same viewer gets it.
    await expect(liveQuery('getReports', viewer)!()).resolves.toMatchObject({ elements: templatesWire.elements })
  })
})

// ---- the Monitor slice (#74) -------------------------------------------------

/** One ml-anomalies `_source`, as ml-worker `write_anomaly` builds it: the
 * optional markers are Python `None` reaching Elasticsearch, which is the
 * shape the adapter's own tests pin. */
const mlRow = {
  '@timestamp': '2026-10-04T20:41:03Z',
  severity: 'critical',
  composite_score: 0.87,
  model_scores: { isolation_forest: 0.91, lstm_ae: null, hbos: 0.62 },
  explanation: 'Command-and-control beacon on an unseen JA4 fingerprint.',
  src_ip: '203.0.113.42',
  src_country: 'NL',
  src_port: 4444,
  dst_ip: '10.0.0.7',
  dst_port: '8080',
  proto: 'tcp',
  sensor: 'cowrie',
  event_type: 'cowrie.command.input',
  community_id: null,
  source_event_id: 'ev_9f2c1a',
  source_index: 'honeypot-v2-2026.10.04',
  alert_threshold: 0.62,
  model_state_id: 'iso@r41',
  status: 'open',
}

/** One agent-intrusion-campaigns `_source`. The `events` entries carry NO
 * `source_index`: `build_campaign_verdict` never writes that key, which is
 * the gap the adapter documents and the test below pins. */
const campaignRow = {
  '@timestamp': '2026-10-04T21:00:00Z',
  campaign_id: 'cmp-7712',
  start: '2026-10-04T20:00:00Z',
  end: '2026-10-04T21:00:00Z',
  severity: 'critical',
  matched_categories: ['credential-access', 'execution'],
  correlation_identifiers: ['203.0.113.42', 'fingerprint:curl/8.5.0'],
  event_count: 2,
  events: [
    { event_id: 'ev_9f2c1a', source_index: 'honeypot-v2-2026.10.14', timestamp: '2026-10-04T20:41:03Z', matched_rules: [{ rule: 'base64-pipe-shell', reason: 'echo | base64 -d | sh', trust_boundary: 'trust-boundary-3', decode_chain: [{ transform: 'base64', input_sha256: 'aa', output_sha256: 'bb', output_len: 128 }] }] },
    { event_id: 'ev_9f2c1b', source_index: '', timestamp: '2026-10-04T20:55:00Z', matched_rules: [] },
  ],
}

const authRow = {
  '@timestamp': '2026-10-04T19:00:00Z',
  event_id: 'kc-4411',
  type: 'LOGIN_ERROR',
  realm: 'honeypot',
  client_id: 'grafana',
  user_id: null,
  ip_address: '203.0.113.42',
  error: 'invalid_user_credentials',
  details: { username: 'admin', redirect_uri: '' },
}

const llmRow = {
  '@timestamp': '2026-10-04T20:50:00Z',
  analysis_id: 'an-88',
  doc_type: 'session',
  session_id: 'sess-77a1',
  payload_sha256: '',
  src_ip: '203.0.113.42',
  model: 'claude-haiku-4-5-20251001',
  summary: 'Credential stuffing against the SSH decoy, then a payload drop.',
  intent: 'credential stuffing',
  behaviors: ['modifies credentials', 'clears history'],
  severity: 'high',
  confidence: 'high',
  error: '',
}

const dashboardWire = {
  protocols: [{ key: 'ssh', count: 412, link: '/events?proto=ssh' }],
  top_ports: [{ key: '22', count: 980, link: '/events?port=22' }],
  countries: [{ key: 'NL', count: 611, link: '/events?country=NL' }],
  asns: [{ key: 'AS64496 Example Transit', count: 402, link: '/asn/AS64496' }],
  providers: [{ key: 'hosting', count: 380, link: '/ips' }],
  top_ips: [{ key: '203.0.113.42', count: 210, link: '/ips/203.0.113.42' }],
  top_paths: [{ key: '/bin/busybox', count: 88, link: '/history?q=busybox' }],
  top_creds: [{ key: 'root / toor', count: 140, link: '/history?q=root' }],
  top_commands: [{ key: 'uname -a', count: 66, link: '/commands' }],
  clients: [{ key: 'curl/8.5.0', count: 120, link: '/ips' }],
  fingerprints: [{ key: 'fingerprint:curl/8.5.0', count: 120, link: '/ips' }],
  alerts: [{ key: 'ET SCAN Nmap', count: 12, link: '/history?q=nmap' }],
  alert_cats: [{ key: 'scan', count: 40, link: '/alerts' }],
  payloads: [{ shasum: 'ab12', download: '/tmp/x', count: 3, link: '/payloads/ab12', vt: 'https://vt/ab12' }],
  logins: 18,
  heatmap: [{ sensor: 'cowrie', cells: [{ label: '00', count: 4, pct: 100 }, { label: '01', count: 2, pct: 50 }] }],
  map_points: [{ city: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.9, events: 611, ips: 24, url: '/events?city=Amsterdam' }],
  sensors: [{ name: 'cowrie', count: 980, last_seen: '2026-10-04T20:41:03Z', state: 'active' }],
}

const kpisWire = { total: 1900, last24h: 980, previous24h: 820, change24h: '+19%', unique_ips: 214, hourly: [1, 2, 3], logins: 18, ready: true }

/** Response bodies recorded from the real backend (read-only GETs, 2026-10-09).
 * The catalog keeps its first two sensors; every other body is as served. */
const recordedSources = {
  "total_unique": 29303,
  "truncated": true,
  "rows": [
    {
      "ip": "85.217.149.4",
      "country": "DE",
      "events": 896629,
      "logins": 0,
      "sessions": 0,
      "sensors": [
        "zeek",
        "suricata"
      ],
      "first": "2026-09-29T14:57:13.871Z",
      "last": "2026-10-09T14:56:22.158Z"
    },
    {
      "ip": "85.217.149.16",
      "country": "",
      "events": 896623,
      "logins": 0,
      "sessions": 0,
      "sensors": [
        "zeek"
      ],
      "first": "2026-09-29T14:57:13.871Z",
      "last": "2026-10-09T14:56:22.158Z"
    },
    {
      "ip": "45.156.129.136",
      "country": "",
      "events": 896621,
      "logins": 0,
      "sessions": 0,
      "sensors": [
        "zeek"
      ],
      "first": "2026-09-29T14:57:13.871Z",
      "last": "2026-10-09T14:56:22.158Z"
    }
  ]
}
const recordedOsDistribution = [{"name": "Linux 2.2.x-3.x", "value": 14}, {"name": "Windows NT kernel 5.x", "value": 17}, {"name": "Linux 2.2.x-3.x (barebone)", "value": 6}, {"name": "Windows 7 or 8", "value": 1}, {"name": "Windows NT kernel", "value": 1}]
const recordedCatalog = {"window": "now-14d", "sensors": [{"sensor": "cowrie", "events": 2690166, "last_seen": "2026-09-30T19:25:19.795Z"}, {"sensor": "multipot", "events": 1217778, "last_seen": "2026-09-30T19:25:19.534Z"}]}
const recordedJa4h = {"categories": ["ge11nn040000_e1d2031bdfea_000000000000_000000000000", "ge11nn06enus_8d3d7241d0f5_000000000000_000000000000", "ge11nn030000_cd680697de12_000000000000_000000000000", "ge11nn09en u_11106e000afa_000000000000_000000000000", "ge11nn040000_66d37a417839_000000000000_000000000000", "op00nn000000_000000000000_000000000000_000000000000", "op00nn010000_ab85ac6458c5_000000000000_000000000000", "ge11nn110000_0a45cece97b8_000000000000_000000000000", "ge11nn030000_fe444ad14866_000000000000_000000000000", "ge11nn010000_4a823118b9ba_000000000000_000000000000", "ge11nn050000_2f4dedb4228f_000000000000_000000000000", "ge11nn040000_5b1e8b5f4d2d_000000000000_000000000000", "ge11nn040000_08e7224bf8c7_000000000000_000000000000", "ge11nn000000_000000000000_000000000000_000000000000", "ge10nn000000_000000000000_000000000000_000000000000"], "values": [3985, 985, 339, 268, 263, 225, 202, 198, 196, 193, 165, 150, 132, 125, 120]}
const recordedEndlessh = {"categories": ["<1s", "1-5s", "5-15s", "15-60s", "1-5min", "5min+"], "values": [0, 0, 0, 0, 0, 0]}
const recordedNetflowBytes = [{"name": "bytes", "points": [{"time": "2026-10-08T20:00:00.000Z", "value": 164474703}]}]
const emptyBars = { categories: [], values: [] }

/** `emptyDashboard` is what a bodyless 200 maps to; every other slice's
 * fixture set includes the config doc the read-only guard reads before a
 * write, and this one needs it for the same reason. */
const monitorFixtures = (overrides: Record<string, unknown> = {}) => ({
  '/api/v1/overview/kpis': kpisWire,
  '/api/v1/overview/dashboard': dashboardWire,
  '/api/v1/payloads': { total: 37, rows: [] },
  '/api/v1/campaigns': { total: 1, rows: [] },
  '/api/v1/events': { total: 2, offset: 0, rows: [] },
  '/api/v1/store/ml-anomalies': { total: 1, rows: [{ ...mlRow, _doc_id: 'anom-1' }] },
  // The 24-hour window: three anomalies, two critical from one address and one from none.
  '/api/v1/store/ml-anomalies#q': { total: 3, offset: 0, rows: [
    { ...mlRow, _doc_id: 'anom-w1', severity: 'critical', src_ip: '203.0.113.42', event_type: 'ssh' },
    { ...mlRow, _doc_id: 'anom-w2', severity: 'high', src_ip: '203.0.113.42', event_type: 'http' },
    { ...mlRow, _doc_id: 'anom-w3', severity: 'critical', src_ip: null, event_type: 'ssh' },
  ] },
  '/api/v1/ml-anomalies/acks': {},
  '/api/v1/ml-anomalies/stats': { total: 9, open: 4 },
  '/api/v1/ml-health': [{ model: 'isolation_forest', timestamp: '2026-10-04T17:00:00Z', accepted: true, reason: 'within tolerance', anomaly_rate_new: 0.021, anomaly_rate_previous: 0.019, train_samples: 184_220 }],
  '/api/v1/charts/ml-anomaly-scores': [{ name: 'isolation_forest', points: [{ time: '2026-10-04T20:00:00Z', value: 0.91 }, { time: '2026-10-04T21:00:00Z', value: 0.55 }] }],
  '/api/v1/store/llm-analysis': { total: 1, rows: [{ ...llmRow, _doc_id: 'llm-1' }] },
  '/api/v1/llm-search': { available: true, hits: [] },
  '/api/v1/store/agent-campaigns': { total: 1, rows: [{ ...campaignRow, _doc_id: 'cmp-doc-1' }] },
  '/api/v1/store/auth-events': { total: 1, rows: [{ ...authRow, _doc_id: 'kc-doc-1' }] },
  '/api/v1/store/auth-events#q': { total: 1, rows: [{ ...authRow, _doc_id: 'kc-doc-1' }] },
  '/api/v1/sources': recordedSources,
  '/api/v1/sensors/catalog': recordedCatalog,
  '/api/v1/charts/os-distribution': recordedOsDistribution,
  '/api/v1/charts/ja4h-fingerprints': recordedJa4h,
  '/api/v1/charts/endlessh-held-histogram': recordedEndlessh,
  '/api/v1/charts/netflow-bytes': recordedNetflowBytes,
  '/api/v1/charts/tcp-stack-clusters': [],
  '/api/v1/charts/ml-backlog': [],
  '/api/v1/charts/netflow-packets': [],
  '/api/v1/charts/ics-functions': emptyBars,
  '/api/v1/charts/decoy-requests': emptyBars,
  '/api/v1/charts/decoy-client-fingerprints': emptyBars,
  '/api/v1/charts/ja4l-fingerprints': emptyBars,
  '/api/v1/charts/ja4x-fingerprints': emptyBars,
  '/api/v1/charts/tls-fingerprints': emptyBars,
  '/api/v1/charts/ssh-fingerprints': emptyBars,
  '/api/v1/charts/dionaea-cves': emptyBars,
  '/api/v1/ml-anomalies/ack': { Key: 'anom-1', Acknowledged: true, AckedBy: '', AckedAt: '2026-10-05T00:00:00Z' },
  '/api/v1/ml-anomalies/ack-all': { changed: 4 },
  '/api/v1/ml-anomalies/disposition': { key: 'anom-1', status: 'true_positive', disposed_at: '2026-10-05T00:00:00Z' },
  '/api/v1/config': configWire,
  ...overrides,
})

describe('the Monitor slice reads the endpoints the Rust tier actually serves', () => {
  it('builds the overview from the KPIs, the payload count and the recent events', async () => {
    const calls = stub(monitorFixtures())
    const out = await live('getOverview')()
    expect(calls.map((url) => `${new URL(url).pathname}${new URL(url).search}`).sort()).toEqual([
      '/api/v1/events?offset=0&size=18',
      '/api/v1/overview/dashboard?parts=countries',
      '/api/v1/overview/kpis',
      '/api/v1/payloads?offset=0&size=15',
      '/api/v1/sensors/catalog',
      '/api/v1/sources?offset=0&size=10',
    ])
    // Only the three tiles /overview/kpis can fill, plus the payloads tile
    // overview.rs's own module doc sends to the store listing.
    expect(out.kpis.map((kpi) => [kpi.id, kpi.value])).toEqual([
      ['events', 980],
      ['sources', 214],
      ['logins', 18],
      ['payloads', 37],
    ])
    // The events tile carries the wire's own hourly sparkline and the real
    // previous-period figure — this is the one tile with a genuine trend.
    expect(out.kpis[0]).toMatchObject({ previous: 820, trend: [1, 2, 3] })
  })

  it('leaves the sessions KPI tile out — no endpoint counts sessions', async () => {
    // GAP (APIARY#3556): no endpoint counts sessions. The tile is absent from
    // the live data, and the page renders it as not available.
    stub(monitorFixtures())
    expect((await live('getOverview')()).kpis.map((kpi) => kpi.id)).not.toContain('sessions')
  })

  it('fills the top sources from the sources list, the countries from the dashboard, and the sensors from the catalog', async () => {
    stub(monitorFixtures())
    const out = await live('getOverview')()
    // The recorded rows, highest event count first, as the page type carries them.
    // The second row has no country on the wire: it is absent, not ''.
    expect(out.topSources).toEqual([
      { ip: '85.217.149.4', country: 'DE', events: 896629, firstSeen: '2026-09-29T14:57:13.871Z', lastSeen: '2026-10-09T14:56:22.158Z' },
      { ip: '85.217.149.16', events: 896623, firstSeen: '2026-09-29T14:57:13.871Z', lastSeen: '2026-10-09T14:56:22.158Z' },
      { ip: '45.156.129.136', events: 896621, firstSeen: '2026-09-29T14:57:13.871Z', lastSeen: '2026-10-09T14:56:22.158Z' },
    ])
    expect(out.topSources?.[1]).not.toHaveProperty('country')
    expect(out.topCountries).toEqual([{ id: 'NL', label: 'NL', count: 611 }])
    expect(out.sensors).toEqual([{ sensor: 'cowrie', events: 2690166 }, { sensor: 'multipot', events: 1217778 }])
  })

  it('leaves the usernames and passwords unavailable: the wire has only user / pass pairs', async () => {
    // GAP: `top_creds` is one pair per key. Splitting it into two lists would
    // be two invented ones, so both widgets are unavailable and the credential
    // tab shows the pairs.
    stub(monitorFixtures())
    const out = await live('getOverview')()
    expect(out.topUsernames).toBeNull()
    expect(out.topPasswords).toBeNull()
    // The KPIs' own unique-address count is real, so it is the sources tile.
    expect(out.kpis.find((kpi) => kpi.id === 'sources')?.value).toBe(214)
  })

  it('leaves the 24-hour timeline and protocol list unavailable rather than built from the first 18 events', async () => {
    // GAP (APIARY#3556): no 24 h hourly rollup on the wire. The events page is
    // paged by offset, so an hour-bucket chart of it is an approximation of 18
    // events, which is not drawn as a measurement.
    stub(monitorFixtures({ '/api/v1/events': { total: 3, offset: 0, rows: [row] } }))
    const out = await live('getOverview')()
    expect(out.timeline).toBeNull()
    expect(out.topProtocols).toBeNull()
    // The recent rows are real and still there.
    expect(out.recentEvents).toHaveLength(1)
  })

  it('leaves the KPI tiles null when /overview/kpis has no answer, and the rest of the overview still renders', async () => {
    // A 404 on a fixed endpoint is a broken backend, not an empty fleet: the
    // tiles it fills are not available, and the other legs still fill the page.
    stub(monitorFixtures({ '/api/v1/overview/kpis': fail(404), '/api/v1/events': { total: 1, offset: 0, rows: [row] } }))
    const out = await live('getOverview')()
    expect(out.kpis.map((kpi) => [kpi.id, kpi.value])).toEqual([
      ['events', null],
      ['sources', null],
      ['logins', null],
      ['payloads', 37],
    ])
    expect(out.kpis[0]).toMatchObject({ previous: null, trend: [] })
    expect(out.topSources).toHaveLength(3)
    expect(out.topCountries).toEqual([{ id: 'NL', label: 'NL', count: 611 }])
    expect(out.sensors).toHaveLength(2)
    expect(out.recentEvents).toHaveLength(1)
  })

  it('leaves the payload tile, the dashboard views and the campaigns null per field when their endpoints have no answer', async () => {
    stub(monitorFixtures({ '/api/v1/overview/dashboard': fail(404), '/api/v1/payloads': fail(404), '/api/v1/campaigns': fail(404) }))
    const overview = await live('getOverview')()
    expect(overview.kpis.find((kpi) => kpi.id === 'payloads')?.value).toBeNull()
    expect(overview.kpis.find((kpi) => kpi.id === 'events')?.value).toBe(980)
    const views = await live('getOverviewViews')()
    expect(views.protocols).toBeNull()
    expect(views.credentials).toBeNull()
    expect(views.feeds).toBeNull()
    expect(views.mapPoints).toBeNull()
    expect(views.heatmap).toBeNull()
    expect(views.payloads).toBeNull()
    expect(views.campaigns).toBeNull()
    // The chart routes are separate endpoints and still answer.
    expect(views.osDistribution?.length).toBeGreaterThan(0)
  })

  it('reports the sources as unavailable when the sources route has no answer', async () => {
    stub(monitorFixtures({ '/api/v1/sources': fail(404), '/api/v1/sensors/catalog': fail(404) }))
    const out = await live('getOverview')()
    expect(out.topSources).toBeNull()
    expect(out.sensors).toBeNull()
  })

  it('fills the deep-dive tabs the dashboard endpoint and the chart routes carry', async () => {
    const calls = stub(monitorFixtures())
    const views = await live('getOverviewViews')()
    const paths = calls.map((url) => new URL(url).pathname)
    expect(paths.filter((p) => !p.startsWith('/api/v1/charts/')).sort()).toEqual(['/api/v1/campaigns', '/api/v1/overview/dashboard', '/api/v1/payloads'])
    // Fifteen chart routes, each read through the same chart proxy path.
    expect(paths.filter((p) => p.startsWith('/api/v1/charts/'))).toHaveLength(15)
    expect(views.protocols).toEqual([{ id: 'ssh', label: 'ssh', count: 412 }])
    expect(views.credentials).toEqual([{ id: 'root / toor', label: 'root / toor', count: 140 }])
    // A heat cell's `pct`/`label` are the backend's own intensity, which the
    // page's `HeatmapRow.cells` is a bare count series with no field for.
    expect(views.heatmap).toEqual([{ sensor: 'cowrie', cells: [4, 2] }])
    // `state` is the backend's three-value string; `SensorFeed.state` is the
    // page's four.
    expect(views.feeds).toEqual([{ sensor: 'cowrie', state: 'fresh', documents: 980, lastSeen: '2026-10-04T20:41:03Z' }])
    // Pie slices and bar categories become one count row each, in the chart's order.
    expect(views.osDistribution?.slice(0, 2)).toEqual([
      { id: 'Linux 2.2.x-3.x', label: 'Linux 2.2.x-3.x', count: 14 },
      { id: 'Windows NT kernel 5.x', label: 'Windows NT kernel 5.x', count: 17 },
    ])
    expect(views.ja4h?.[0]).toEqual({ id: 'ge11nn040000_e1d2031bdfea_000000000000_000000000000', label: 'ge11nn040000_e1d2031bdfea_000000000000_000000000000', count: 3985 })
    expect(views.endlessh?.map((bucket) => bucket.label)).toEqual(['<1s', '1-5s', '5-15s', '15-60s', '1-5min', '5min+'])
    // A series becomes one point per instant, keyed by the series name.
    expect(views.netflowBytes).toEqual([{ time: '2026-10-08T20:00:00.000Z', bytes: 164474703 }])
    expect(views.mlBacklog).toEqual([])
  })

  it('leaves the vectors and conformance views unavailable: no endpoint carries them', async () => {
    stub(monitorFixtures())
    const views = await live('getOverviewViews')()
    expect(views.vectors).toBeNull()
    expect(views.conformance).toBeNull()
  })

  it('leaves a chart whose route has no answer unavailable, not an empty list', async () => {
    // A 404 from /api/v1/charts/{name} is "no such route" to the proxy, so the
    // page must not read it as a chart with no rows.
    stub(monitorFixtures({ '/api/v1/charts/tls-fingerprints': fail(404), '/api/v1/charts/netflow-bytes': fail(404) }))
    const views = await live('getOverviewViews')()
    expect(views.tls).toBeNull()
    expect(views.netflowBytes).toBeNull()
    expect(views.ssh).toEqual([])
  })

  it('reads the anomaly rows, the ack sidecar, the backlog and the model health', async () => {
    const calls = stub(monitorFixtures())
    const out = await live('getMlAnomalies')()
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/charts/ml-anomaly-scores', '/api/v1/ml-anomalies/acks', '/api/v1/ml-anomalies/stats', '/api/v1/ml-health', '/api/v1/store/ml-anomalies', '/api/v1/store/ml-anomalies'])
    expect(out.anomalies).toMatchObject([{ id: 'anom-1', severity: 'critical', compositeScore: 0.87, srcIp: '203.0.113.42', status: 'open', sourceIndex: 'honeypot-v2-2026.10.04' }])
    // `open` is the all-time backlog, which is why it feeds its own labelled
    // tile rather than the 24-hour one.
    expect(out.openBacklog).toBe(4)
    expect(out.modelHealth).toEqual([{ model: 'isolation_forest', timestamp: '2026-10-04T17:00:00Z', accepted: true, reason: 'within tolerance', anomalyRateNew: 0.021, anomalyRatePrevious: 0.019, trainSamples: 184_220 }])
  })

  it('reads the ack sidecar when the anomaly document says open', async () => {
    stub(monitorFixtures({ '/api/v1/ml-anomalies/acks': { 'anom-1': { Key: 'anom-1', Acknowledged: true, AckedBy: 'A', AckedAt: '2026-10-05T00:00:00Z' } } }))
    expect((await live('getMlAnomalies')()).anomalies[0].status).toBe('acknowledged')
  })

  it('reads a detector that did not fire as a stored null, not a zero score', async () => {
    // ml-worker #1969 writes JSON null for a detector that did not fire, so
    // `lstm_ae: null` is a real reading — the adapter's `score()` is what maps
    // it to the page's numeric field.
    stub(monitorFixtures())
    expect((await live('getMlAnomalies')()).anomalies[0].modelScores).toEqual({ isolationForest: 0.91, lstmAe: 0, hbos: 0.62 })
  })

  it('counts the 24-hour figures from a windowed store read', async () => {
    // The store takes a Lucene `q`; the 24 h window is the one the old
    // dashboard sent. The total is the exact count in the window, and the
    // breakdowns are counted over its rows.
    const calls = stub(monitorFixtures())
    const out = await live('getMlAnomalies')()
    expect(calls.map((url) => new URL(url).searchParams.get('q')).filter(Boolean)).toEqual(['@timestamp:[now-24h TO now]'])
    expect(out.total24h).toBe(3)
    expect(out.bySeverity).toEqual([{ id: 'critical', label: 'critical', count: 2 }, { id: 'high', label: 'high', count: 1 }])
    expect(out.topSources).toEqual([{ id: '203.0.113.42', label: '203.0.113.42', count: 2 }])
    expect(out.eventTypes).toEqual(['ssh', 'http'])
    // Every window row is counted, so no "latest N" note is due.
    expect(out.breakdownRows).toBeUndefined()
    // `folded` is the page's own same-address-and-second grouping over the
    // loaded page; one stored document is one anomaly, so nothing is claimed.
    expect(out.anomalies.map((a) => a.folded)).toEqual([1])
  })

  it('says how many rows the breakdowns cover when the window holds more than were loaded', async () => {
    stub(monitorFixtures({ '/api/v1/store/ml-anomalies#q': { total: 9000, offset: 0, rows: [{ ...mlRow, _doc_id: 'anom-w1', src_ip: '203.0.113.42', event_type: 'ssh' }] } }))
    const out = await live('getMlAnomalies')()
    expect(out.total24h).toBe(9000)
    expect(out.breakdownRows).toBe(1)
  })

  it('reports an empty window as zero, a real answer, not as unavailable', async () => {
    // A failed read throws; an empty window is a real count of nothing.
    stub(monitorFixtures({ '/api/v1/store/ml-anomalies#q': { total: 0, offset: 0, rows: [] } }))
    const out = await live('getMlAnomalies')()
    expect(out.total24h).toBe(0)
    expect(out.bySeverity).toEqual([])
  })

  it('transposes the ml-anomaly-scores chart into the page one-row-per-instant shape', async () => {
    stub(monitorFixtures())
    expect((await live('getMlAnomalies')()).scoreTimeline).toEqual([
      { time: '2026-10-04T20:00:00Z', isolationForest: 0.91, lstmAe: 0, hbos: 0 },
      { time: '2026-10-04T21:00:00Z', isolationForest: 0.55, lstmAe: 0, hbos: 0 },
    ])
  })

  it('drops a detector outside the three the page has a column for', async () => {
    // The chart answers one Series per model, taken from the data so a new
    // detector shows up with no dashboard change. The page's ScorePoint has a
    // fixed field per detector, so an unknown one has no column — it is
    // dropped, not folded into a detector that did not score it.
    stub(monitorFixtures({ '/api/v1/charts/ml-anomaly-scores': [{ name: 'autoencoder', points: [{ time: '2026-10-04T20:00:00Z', value: 0.99 }] }] }))
    expect((await live('getMlAnomalies')()).scoreTimeline).toEqual([{ time: '2026-10-04T20:00:00Z', isolationForest: 0, lstmAe: 0, hbos: 0 }])
  })

  it('sweeps every open anomaly, admin-only, through the backend endpoint', async () => {
    stub(monitorFixtures())
    // The sweep is the WHOLE index, not the loaded page, so the returned
    // count is the backend's own — a live `changed` can be lower than the
    // open rows on screen when a row carries a disposition.
    expect(await live('acknowledgeAllAnomalies')()).toBe(4)
    expect(bodiesOf()).toEqual([{ path: '/api/v1/ml-anomalies/ack-all', body: {} }])
  })

  it('acks one anomaly per call and counts what changed', async () => {
    stub(monitorFixtures({ '/api/v1/ml-anomalies/ack': { Key: 'anom-1', Acknowledged: false, AckedBy: '', AckedAt: '2026-10-05T00:00:00Z' } }))
    // `ack: false` is the endpoint's own un-ack, which the page's signature
    // cannot express — so a row the backend leaves un-acked counts as
    // unchanged rather than as a success the operator did not get.
    expect(await live('acknowledgeAnomalies')(['anom-1'])).toBe(0)
    expect(bodiesOf()).toEqual([{ path: '/api/v1/ml-anomalies/ack', body: { key: 'anom-1', ack: true } }])
  })

  it('writes a verdict onto the anomaly document and refuses acknowledged as one', async () => {
    stub(monitorFixtures())
    expect(await live('setAnomalyDisposition')(['anom-1'], 'true_positive', 'Confirmed dropper download')).toBeUndefined()
    expect(bodiesOf()).toEqual([{ path: '/api/v1/ml-anomalies/disposition', body: { key: 'anom-1', status: 'true_positive', reason: 'Confirmed dropper download' } }])
    // The backend's closed set is the three verdicts plus the 'open'
    // retraction; the ack lives only in the sidecar, so nothing the page can
    // send is lost by the refusal.
    // The page type accepts it (`AnomalyStatus`); the page's own signature
    // narrows the argument away before it reaches here, so this is the
    // adapter's refusal rather than a wire 400.
    await expect((live('setAnomalyDisposition') as (ids: string[], status: string, reason: string) => Promise<unknown>)(['anom-1'], 'acknowledged', '')).rejects.toThrow('acknowledged is not a disposition')
  })

  it('keeps the three anomaly writes admin-only on the live path', async () => {
    const analyst = { id: 'u', name: 'A', email: 'a@example.test', roles: ['viewer' as const] }
    // Refused before any fetch — the seam applies the same decision
    // `backend()` does, so a role is refused identically on either tier.
    for (const call of [() => (liveQuery('acknowledgeAllAnomalies', analyst) as () => Promise<unknown>)(), () => (liveQuery('acknowledgeAnomalies', analyst) as (ids: string[]) => Promise<unknown>)(['anom-1']), () => (liveQuery('setAnomalyDisposition', analyst) as (ids: string[], status: 'open', reason: string) => Promise<unknown>)(['anom-1'], 'open', '')]) {
      const refused = await call().catch((error: unknown) => error)
      expect(refused).toBeInstanceOf(ApiError)
      expect((refused as ApiError).kind).toBe('forbidden')
    }
  })

  it('honours read-only before acking or disposing', async () => {
    // Nothing in the Rust tier enforces read-only: it is a dashboard
    // preference, so a live call would otherwise write with the toggle on.
    stub(monitorFixtures({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } }))
    await expect(live('acknowledgeAllAnomalies')()).rejects.toThrow(ApiError)
    await expect(live('setAnomalyDisposition')(['anom-1'], 'true_positive', '')).rejects.toThrow(ApiError)
  })

  it('reads the llm-analysis list and maps the error doc_type to report', async () => {
    const calls = stub(monitorFixtures({ '/api/v1/store/llm-analysis': { total: 1, rows: [{ ...llmRow, doc_type: 'error', summary: '', _doc_id: 'llm-1' }] } }))
    const out = await live('getLlmAnalyses')()
    expect(calls[0]).toContain('/api/v1/store/llm-analysis?offset=0&size=100')
    // llm-worker `record_error` writes a fourth doc_type the page type does
    // not model; it reads as the page's catch-all analysis shape.
    expect(out).toMatchObject([{ id: 'an-88', docType: 'report', severity: 'high', confidence: 'high' }])
  })

  it('asks the llm-search endpoint for a query, and never for an empty one', async () => {
    const calls = stub(monitorFixtures({ '/api/v1/llm-search': { available: true, hits: [{ ...llmRow, score: 0.42 }] } }))
    const out = await live('semanticSearch')('credential stuffing')
    expect(calls).toEqual(['http://backend.test/api/v1/llm-search?q=credential+stuffing'])
    // A hit has no `_doc_id` — the search returns `_source` plus `_score` — so
    // the id is `analysis_id`.
    expect(out).toMatchObject({ available: true, hits: [{ id: 'an-88', score: 0.42, sessionId: 'sess-77a1' }] })
    // `q` is required and a blank one is an error upstream, so the page's
    // no-search-yet state never leaves this tier.
    const blank = stub(monitorFixtures())
    expect(await live('semanticSearch')('   ')).toEqual({ available: true, hits: [] })
    expect(blank).toEqual([])
  })

  it('renders the llm-search backend own words when embeddings are not configured', async () => {
    // `available: false` is an ANSWER about the deployment, not a failure —
    // the same shape `getCredentials`'s `available: false` is a failure on,
    // and deliberately different: llm_search.rs always answers 200 and says
    // why the search is unavailable, which is what the page shows.
    stub(monitorFixtures({ '/api/v1/llm-search': { available: false, reason: 'embeddings are not configured' } }))
    expect(await live('semanticSearch')('beacon')).toEqual({ available: false, reason: 'embeddings are not configured' })
  })

  it('maps source_index onto each campaign event, empty for a document stored before it was written', async () => {
    const calls = stub(monitorFixtures())
    const [campaign] = await live('getAgentCampaigns')()
    expect(calls[0]).toContain('/api/v1/store/agent-campaigns?offset=0&size=100')
    expect(campaign.events.map((e) => e.sourceIndex)).toEqual(['honeypot-v2-2026.10.14', ''])
    expect(campaign.events[0].matchedRules).toMatchObject([{ rule: 'base64-pipe-shell', trustBoundary: 'trust-boundary-3', decodeChain: [{ transform: 'base64', outputLen: 128 }] }])
  })

  it('reads a campaign detail without inventing the absent campaign-events endpoint', async () => {
    const calls = stub(monitorFixtures({
      '/api/v1/store/agent-campaigns/cmp-7712': campaignRow,
    }))
    const out = await live('getAgentCampaign')('cmp-7712')
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/store/agent-campaigns/cmp-7712'])
    expect(out).toMatchObject({ campaign: { id: 'cmp-7712' }, events: [] })
    expect(out?.campaign.events[0].eventId).toBe('ev_9f2c1a')
  })

  it('reads an LLM analysis detail and its session evidence from the live backend', async () => {
    const calls = stub(monitorFixtures({
      '/api/v1/store/llm-analysis/an-88': llmRow,
      '/api/v1/sessions/sess-77a1': sessionWire,
    }))
    const out = await live('getLlmAnalysis')('an-88')
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/store/llm-analysis/an-88', '/api/v1/sessions/sess-77a1'])
    expect(out).toMatchObject({ analysis: { id: 'an-88' }, events: [{ id: 'ev_9f2c1a' }] })
  })

  it('reads payload and source evidence for non-session LLM analyses', async () => {
    for (const [detail, param, value] of [
      [{ ...llmRow, session_id: '', payload_sha256: 'sha-1' }, 'shasum', 'sha-1'],
      [{ ...llmRow, session_id: '', payload_sha256: '' }, 'ip', '203.0.113.42'],
    ] as const) {
      const calls = stub(monitorFixtures({ '/api/v1/store/llm-analysis/an-88': detail, '/api/v1/events': page }))
      expect(await live('getLlmAnalysis')('an-88')).toMatchObject({ events: [{ id: 'ev_9f2c1a' }] })
      expect(new URL(calls[1]).searchParams.get(param)).toBe(value)
    }
  })

  it('reads an anomaly detail, its acknowledgement and its source event from the live backend', async () => {
    const calls = stub(monitorFixtures({
      '/api/v1/store/ml-anomalies/anom-1': mlRow,
      '/api/v1/ml-anomalies/acks': { 'anom-1': { Key: 'anom-1', Acknowledged: true, AckedBy: 'A', AckedAt: '2026-10-05T00:00:00Z' } },
      '/api/v1/event/ev_9f2c1a': eventPageWire,
    }))
    const out = await live('getAnomaly')('anom-1')
    expect(calls.map((url) => new URL(url).pathname)).toEqual([
      '/api/v1/store/ml-anomalies/anom-1',
      '/api/v1/ml-anomalies/acks',
      '/api/v1/event/ev_9f2c1a',
    ])
    expect(out).toMatchObject({ anomaly: { id: 'anom-1', status: 'acknowledged', folded: 1 }, event: { id: 'ev_9f2c1a' } })
  })

  it('maps a missing Monitor detail to null without querying related data', async () => {
    for (const [name, path] of [
      ['getAgentCampaign', '/api/v1/store/agent-campaigns/missing'],
      ['getLlmAnalysis', '/api/v1/store/llm-analysis/missing'],
      ['getAnomaly', '/api/v1/store/ml-anomalies/missing'],
    ] as const) {
      const calls = stub({ [path]: fail(404) })
      expect(await live(name)('missing'), name).toBeNull()
      expect(calls.map((url) => new URL(url).pathname)).toEqual([path])
    }
  })

  it('reads the auth-events list, and counts its 24-hour figures from a windowed read', async () => {
    // The window counts against the wall clock; the list read is the first call.
    const calls = stub(monitorFixtures())
    const out = await live('getAuthEvents')()
    expect(calls[0]).toContain('/api/v1/store/auth-events?offset=0&size=100')
    expect(calls.map((url) => new URL(url).searchParams.get('q')).filter(Boolean)).toEqual(['@timestamp:[now-24h TO now]'])
    // username and redirect_uri are nested under `details` by the
    // auth-events-worker, not at the top level; Keycloak leaves the redirect
    // unset on most event types, and `''` means absent.
    expect(out.events).toMatchObject([{ id: 'kc-4411', ip: '203.0.113.42', username: 'admin', clientId: 'grafana', redirectUri: undefined }])
    expect(out.failed24h).toBe(1)
    expect(out.byClient).toEqual([{ id: 'grafana', label: 'grafana', count: 1 }])
    expect(out.topSources).toEqual([{ id: '203.0.113.42', label: '203.0.113.42', count: 1 }])
    expect(out.breakdownRows).toBeUndefined()
  })

  it('counts the whole 24-hour window, and says the breakdowns cover only the rows loaded', async () => {
    // The 100-row list used to stand in for the window; the window's own total
    // is the figure now, and its breakdowns say how many rows they were counted over.
    stub(monitorFixtures({ '/api/v1/store/auth-events#q': { total: 250, offset: 0, rows: [{ ...authRow, _doc_id: 'kc-w1' }] } }))
    const out = await live('getAuthEvents')()
    expect(out.failed24h).toBe(250)
    expect(out.breakdownRows).toBe(1)
  })

  it('maps a failed Monitor fetch to an error, never to an empty panel', async () => {
    // The whole point of the seam: an anomaly list that renders empty because
    // the backend was down reads as "no anomalies", and an operator cannot
    // tell that from a quiet fleet.
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getOverview', () => live('getOverview')(), { '/api/v1/overview/kpis': fail(502) }],
      ['getOverviewViews', () => live('getOverviewViews')(), { '/api/v1/overview/dashboard': fail(502) }],
      ['getMlAnomalies', () => live('getMlAnomalies')(), { '/api/v1/store/ml-anomalies': fail(502) }],
      ['acknowledgeAllAnomalies', () => live('acknowledgeAllAnomalies')(), { '/api/v1/ml-anomalies/ack-all': fail(502) }],
      ['acknowledgeAnomalies', () => live('acknowledgeAnomalies')(['anom-1']), { '/api/v1/ml-anomalies/ack': fail(502) }],
      ['setAnomalyDisposition', () => live('setAnomalyDisposition')(['anom-1'], 'true_positive', ''), { '/api/v1/ml-anomalies/disposition': fail(502) }],
      ['getLlmAnalyses', () => live('getLlmAnalyses')(), { '/api/v1/store/llm-analysis': fail(502) }],
      ['semanticSearch', () => live('semanticSearch')('beacon'), { '/api/v1/llm-search': fail(502) }],
      ['getAgentCampaigns', () => live('getAgentCampaigns')(), { '/api/v1/store/agent-campaigns': fail(502) }],
      ['getAuthEvents', () => live('getAuthEvents')(), { '/api/v1/store/auth-events': fail(502) }],
      ['getAgentCampaign', () => live('getAgentCampaign')('cmp-7712'), { '/api/v1/store/agent-campaigns/cmp-7712': fail(502) }],
      ['getLlmAnalysis', () => live('getLlmAnalysis')('an-88'), { '/api/v1/store/llm-analysis/an-88': fail(502) }],
      ['getAnomaly', () => live('getAnomaly')('anom-1'), { '/api/v1/store/ml-anomalies/anom-1': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(monitorFixtures(fixtures))
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })
})

// ---- sources & correlation (#76) ------------------------------------------

const ip = '203.0.113.42'
const cidr = '203.0.113.0/24'

const sourcesWire: SourcesPageWire = {
  total_unique: 2,
  truncated: true,
  rows: [{ ip, country: 'NL', events: 812, logins: 96, sessions: 31, sensors: ['cowrie'], first: '2026-09-25T04:11:00Z', last: '2026-10-04T21:02:00Z' }],
}

const attackerWire = {
  id: 'att_9f21c4',
  ips: [ip, '198.51.100.7'],
  fingerprints: ['hassh:a7b1c0'],
  payloads: ['9f86d0818'],
  credentials: ['root:root'],
  sensors: ['cowrie'],
  events: 4210,
  first: '2026-09-12T10:00:00Z',
  last: '2026-10-04T20:44:00Z',
  updated: '2026-10-04T21:00:00Z',
  verdicts: [],
  techniques: ['T1059.004'],
  ports_touched: 18,
  dest_ips: 240,
  protocols_touched: 4,
  scan: '',
}

const campaignWire = {
  cidr,
  score: 71,
  events: 4210,
  unique_ips: 12,
  dst_ips_touched: 240,
  ports_touched_counted: 18,
  protocols_touched: 4,
  scan: 'horizontal',
  sensors: ['cowrie'],
  ports: ['22', '23', '2323'],
  creds: 9,
  payloads: 3,
  alerts: 14,
  providers: ['hosting'],
  fingerprints: 5,
  first: '2026-09-30T00:00:00Z',
  last: '2026-10-04T21:00:00Z',
  generated: '2026-10-04T21:05:00Z',
  explanation: 'horizontal scan across 240 hosts',
}

const credEdgeWire = { user: 'root', pass: 'admin', unique_ips: 14, ips: [ip], sensors: ['cowrie'], events: 210, first: '2026-09-28T00:00:00Z', last: '2026-10-04T19:12:00Z' }

const clusterWire = { kind: 'asn', value: 'AS15169 Google LLC', events: 880, sources: 6, sensors: ['cowrie'], generated: '2026-10-04T21:05:00Z' }

/** One correlation `records` row. `id` is "" on every row the three
 * investigate endpoints serve: they build rows from a bare `_source`, so
 * there is no hit to take a document id from. */
const correlationRecord = (srcIp: string, sensor = 'cowrie') => ({ id: '', src_ip_claimed: '', time: '2026-10-04T20:41:03Z', sensor, src_ip: srcIp, country: 'NL', port: '22', proto: 'ssh', detail: 'command.input: uname -a', session: 'sess-77a1', pivots: { ...pivots, shasum: 'ab12cd34' }, record: { honeypot: { eventid: 'cowrie.command.input' } } })

const correlationWire: CorrelationWire = { total: 2, truncated: false, sensors: [{ key: 'cowrie', count: 2 }], sensors_total: 1, tunnel_connections: 1, tunnel_os_guesses: ['Linux 4.x'], records: [correlationRecord(ip), correlationRecord('198.51.100.7')] }

const ipProfileWire: IpProfileWire = {
  ip, total: 4210, first: '2026-09-25T04:11:00Z', last: '2026-10-04T21:02:00Z', country: 'NL', asn: 'Example Hosting B.V.', as_organization: 'Example Hosting B.V.', as_number: 64512,
  sensors: [{ key: 'cowrie', count: 3900 }], ports: [{ key: '22', count: 900 }], protos: [{ key: 'ssh', count: 800 }],
  credentials: [{ key: 'root', count: 96 }], commands: [{ key: 'uname -a', count: 40 }], sessions: [{ key: 'sess-77a1', count: 31 }],
  techniques: [{ id: 'T1059.004', name: 'Unix Shell', domain: 'Execution', evidence: 'a shell command was recorded', count: 40, url: 'https://attack.mitre.org/techniques/T1059/004/' }],
  payloads: [{ key: 'ab12cd34', count: 3 }], alerts: [], fingerprints: [{ key: 'hassh:a7b1c0', count: 60 }], paths: [],
  events: [correlationRecord(ip)],
  portbridge: null,
  correlation: correlationWire,
  confirmed_malicious: true,
}

const mapPointsWire = {
  protocols: [], top_ports: [], countries: [], asns: [], providers: [], top_ips: [], top_paths: [], top_creds: [], top_commands: [],
  clients: [], fingerprints: [], alerts: [], alert_cats: [], payloads: [], heatmap: [], sensors: [], logins: 0,
  map_points: [{ city: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.9, events: 812, ips: 14, url: '/events?city=Amsterdam' }],
}

/** The two endpoints that must never be registered twice, and the two that
 * answer the same path for two different page types. */
const sourcesFixtures = (over: Record<string, unknown> = {}) => ({
  '/api/v1/sources': sourcesWire,
  '/api/v1/attackers': { total: 1, rows: [{ ...attackerWire, _doc_id: attackerWire.id }] },
  '/api/v1/campaigns': { total: 1, rows: [{ ...campaignWire, _doc_id: cidr }] },
  '/api/v1/clusters': { total: 1, rows: [{ ...clusterWire, _doc_id: 'asn:AS15169 Google LLC' }] },
  '/api/v1/cred-reuse': [credEdgeWire],
  '/api/v1/overview/dashboard': mapPointsWire,
  '/api/v1/investigate/ip/203.0.113.42': ipProfileWire,
  '/api/v1/ip-block/203.0.113.42': { IP: ip, Blocked: true, Active: true, BlockedBy: 'analyst', BlockedAt: '2026-10-04T12:00:00Z', ExpiresAt: null },
  '/api/v1/investigate/cidr/203.0.113.0%2F24': { cidr, correlation: correlationWire },
  '/api/v1/investigate/cluster': { kind: 'fingerprint', value: 'hassh:a7b1c0', ip_count: 2, correlation: correlationWire },
  '/api/v1/config': configWire,
  ...over,
})

describe('the sources slice reads the endpoints the Rust tier actually serves', () => {
  it('builds the attack-sources page from the two documents it needs', async () => {
    const calls = stub(sourcesFixtures())
    const out = await live('getSourceProfiles')()
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/overview/dashboard', '/api/v1/sources'])
    expect(out.sources).toHaveLength(1)
    expect(out.mapPoints).toEqual([{ country: 'NL', lat: 52.37, lon: 4.9, events: 812, ips: 14 }])
    // The sources handler caps a page at `min(offset + size, 1000)`; asking
    // for its ceiling is what makes the list the whole 1000-bucket answer.
    expect(new URL(calls[0]).searchParams.get('size')).toBe('1000')
  })

  it('registers /overview/dashboard once — ?parts= is the endpoint selector, not a second route', async () => {
    // The Monitor slice reads the same path for its own slice. Two entries
    // would be the same request twice; one helper serves both.
    const calls = stub(sourcesFixtures())
    await live('getSourceProfiles')()
    const dashboards = calls.filter((url) => new URL(url).pathname === '/api/v1/overview/dashboard')
    expect(dashboards).toHaveLength(1)
    expect(new URL(dashboards[0]).searchParams.get('parts')).toBe('map_points')
  })

  it('GAP 1: SourceProfile.org stays empty — the sources row has no organization field', async () => {
    // The row is a terms aggregation over `source.ip` with country, event
    // counts and an activity window; it never asks for an organization, so
    // none is synthesised. Same for total_unique and truncated, which the
    // page type has no field for: the header counts the rows it was given.
    stub(sourcesFixtures())
    const { sources } = await live('getSourceProfiles')()
    expect(sources[0]).toMatchObject({ ip, country: 'NL', org: '', events: 812, logins: 96, sessions: 31 })
  })

  it('GAP 2: MapPoint drops the wire city and url', async () => {
    // `city` has no page field and `url` is the backend's own drill-down
    // link; the map is pinned by country, which the page can link.
    stub(sourcesFixtures())
    const { mapPoints: pins } = await live('getSourceProfiles')()
    expect(pins[0]).not.toHaveProperty('city')
    expect(pins[0]).not.toHaveProperty('url')
    expect(pins[0].ips).toBe(14)
  })

  it('reads the three store pages and the bare cred-reuse array', async () => {
    const attackersCalls = stub(sourcesFixtures())
    expect(await live('getAttackers')()).toMatchObject([{ id: 'att_9f21c4', ips: [ip, '198.51.100.7'], destIps: 240, portsTouched: 18 }])
    expect(new URL(attackersCalls[0]).searchParams.get('size')).toBe('100')

    const campaignCalls = stub(sourcesFixtures())
    const { campaigns, credReuse } = await live('getNetworkCampaigns')()
    expect(campaignCalls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/campaigns', '/api/v1/cred-reuse'])
    expect(campaigns).toHaveLength(1)
    expect(credReuse[0]).toEqual({ id: 'root:admin', user: 'root', pass: 'admin', uniqueIps: 14, sensors: ['cowrie'], events: 210, last: '2026-10-04T19:12:00Z' })

    const clusterCalls = stub(sourcesFixtures())
    expect(await live('getInfraClusters')()).toEqual([{ id: 'asn:AS15169 Google LLC', kind: 'asn', value: 'AS15169 Google LLC', sources: 6, events: 880, sensors: ['cowrie'] }])
    expect(new URL(clusterCalls[0]).searchParams.get('size')).toBe('100')
  })

  it('GAP 3: a campaign portsTouched is the size of the ports list, not the scored count', async () => {
    // `ports_touched_counted` is what the correlator blended into `score`,
    // not a port count; the page's own value is the list it can render.
    stub(sourcesFixtures())
    const { campaigns } = await live('getNetworkCampaigns')()
    expect(campaigns[0].portsTouched).toBe(3)
    expect(campaigns[0]).not.toHaveProperty('ports_touched_counted')
    // Also GAP 3: asns and sequence have no writer field at all.
    expect(campaigns[0].asns).toEqual([])
    expect(campaigns[0].sequence).toEqual([])
  })

  it('GAP 4: cred-reuse ids are the rejoined user:pass, and ips/first are dropped', async () => {
    // A bare array, not a paged read: no envelope, nothing to page.
    stub(sourcesFixtures())
    const { credReuse } = await live('getNetworkCampaigns')()
    expect(credReuse[0].id).toBe('root:admin')
    expect(credReuse[0]).not.toHaveProperty('ips')
    expect(credReuse[0]).not.toHaveProperty('first')
  })

  it('GAP 5: an unknown cluster kind degrades to fingerprint, never a wider union', async () => {
    // The page's fifth kind, `credential`, has no cluster document at all,
    // and ClusterKind is not widened to match a backend that never writes
    // one. An unrecognised wire value degrades the same way.
    stub(sourcesFixtures({ '/api/v1/clusters': { total: 2, rows: [{ ...clusterWire, kind: 'credential', _doc_id: 'credential:root' }, { ...clusterWire, kind: 'sessions', _doc_id: 'sessions:x' }] } }))
    const out = await live('getInfraClusters')()
    expect(out.map((cluster) => cluster.kind)).toEqual(['fingerprint', 'fingerprint'])
    // `id` is rebuilt from the wire's own kind:value, not from the store's
    // `_doc_id` — which for an unknown kind is the raw string the backend
    // indexed, and carries the value too.
    expect(out[0].id).toBe('credential:AS15169 Google LLC')
  })

  it('fans the kill-chain page out over its three chart documents', async () => {
    const calls = stub(
      sourcesFixtures({
        '/api/v1/charts/attck-coverage': { tactics: ['Execution', 'Initial Access'], techniques: ['T1059.004 Unix Shell', 'T1190 Exploit Public-Facing Application'], cells: [{ tactic_idx: 0, technique_idx: 0, count: 40 }, { tactic_idx: 1, technique_idx: 1, count: 7 }] },
        '/api/v1/charts/kill-chain-sankey': { nodes: [{ name: 'Reconnaissance' }, { name: 'Initial Access' }], links: [{ source: 'Reconnaissance', target: 'Initial Access', value: 12 }] },
        '/api/v1/charts/campaign-timeline': [{ cidr, start_ms: 1_757_000_000_000, end_ms: 1_757_100_000_000, score: 71, events: 4210 }],
      }),
    )
    const out = await live('getKillChain')()
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/charts/attck-coverage', '/api/v1/charts/campaign-timeline', '/api/v1/charts/kill-chain-sankey'])
    // The grid's technique entries are "T1059.004 Unix Shell"; the page wants
    // the id and the name apart.
    expect(out.coverage).toEqual([
      { tactic: 'Execution', technique: 'T1059.004', name: 'Unix Shell', events: 40 },
      { tactic: 'Initial Access', technique: 'T1190', name: 'Exploit Public-Facing Application', events: 7 },
    ])
    // The sankey names its tactics; the page's Sankey indexes into nodes.
    expect(out.flow.links).toEqual([{ source: 0, target: 1, value: 12 }])
    // The timeline's times are epoch millis; the chart parses ISO strings.
    expect(out.timeline).toEqual([{ cidr, first: '2025-09-04T15:33:20.000Z', last: '2025-09-05T19:20:00.000Z', events: 4210 }])
  })

  it('answers the ip profile from investigate/ip joined with the block and the entity', async () => {
    const calls = stub(sourcesFixtures())
    const out = (await live('getIpProfile')(ip))!
    expect(calls.map((url) => new URL(url).pathname).sort()).toEqual(['/api/v1/attackers', '/api/v1/investigate/ip/203.0.113.42', '/api/v1/ip-block/203.0.113.42'])
    expect(out.source).toMatchObject({ ip, org: 'Example Hosting B.V.', riskScore: 0, tags: [] })
    expect(out.blocked).toBe(true)
    expect(out.block).toEqual({ by: 'analyst', at: '2026-10-04T12:00:00Z' })
    expect(out.attackerId).toBe('att_9f21c4')
    expect(out.techniques).toEqual([{ id: 'T1059.004', name: 'Unix Shell', tactic: 'Execution', events: 40 }])
    // The correlation's rows carry no document id (row_from_source), and
    // they still map through the page event like any other row.
    expect(out.events[0]).toMatchObject({ id: '', sensor: 'cowrie', srcIp: ip, sessionId: 'sess-77a1' })
  })

  it('answers an address with no events as the page null, a 404 upstream', async () => {
    stub(sourcesFixtures({ '/api/v1/investigate/ip/203.0.113.42': fail(404, 'no events for this ip') }))
    expect(await live('getIpProfile')(ip)).toBeNull()
  })

  it('GAP 6: a lapsed block record reads as no block at all', async () => {
    // The backend computes `Active` fresh on read, so a record it still
    // reports `Blocked: true` over reads as blocked-but-unattributed. A
    // never-blocked address has no document at all and the handler
    // synthesizes `{IP, Blocked:false}` — also no block.
    const lapsed = { IP: ip, Blocked: true, Active: false, BlockedBy: 'analyst', BlockedAt: '2026-10-01T12:00:00Z' }
    stub(sourcesFixtures({ '/api/v1/ip-block/203.0.113.42': lapsed }))
    const out = (await live('getIpProfile')(ip))!
    expect(out.blocked).toBe(false)
    expect(out.block).toBeUndefined()
    stub(sourcesFixtures({ '/api/v1/ip-block/203.0.113.42': { IP: ip, Blocked: false, Active: false } }))
    expect((await live('getIpProfile')(ip))!.blocked).toBe(false)
  })

  it('sends an explicit duration with a block, none with an unblock, and never an actor', async () => {
    stub(sourcesFixtures({ '/api/v1/ip-block': { IP: ip, Blocked: true, BlockedBy: '', BlockedAt: '2026-10-04T21:00:00Z', ExpiresAt: '2026-10-11T21:00:00Z' } }))
    await live('setIpBlocked')(ip, true, 7)
    await live('setIpBlocked')(ip, true, 0)
    await live('setIpBlocked')(ip, false)
    const writes = bodiesOf().filter((call) => call.path === '/api/v1/ip-block')
    expect(writes.map((w) => w.body)).toEqual([
      { ip, blocked: true, expires_days: 7 },
      { ip, blocked: true, expires_days: 0 },
      { ip, blocked: false },
    ])
    for (const w of writes) expect(w.body).not.toHaveProperty('actor')
  })

  it('refuses a block with no duration before any write', async () => {
    stub(sourcesFixtures())
    await expect(live('setIpBlocked')(ip, true)).rejects.toThrow(/duration/)
    expect(bodiesOf().filter((call) => call.path === '/api/v1/ip-block')).toHaveLength(0)
  })

  it('keeps the block write admin-only on the live path, before any fetch', async () => {
    const viewer = { id: 'u', name: 'A', email: 'a@example.test', roles: ['viewer' as const] }
    const calls = stub(sourcesFixtures())
    const refused = await liveQuery('setIpBlocked', viewer)!('203.0.113.42', true, 7).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ApiError)
    expect((refused as ApiError).kind).toBe('forbidden')
    expect(calls).toHaveLength(0)
  })

  it('honours read-only before writing a block', async () => {
    stub(sourcesFixtures({ '/api/v1/config': { ...configWire, payload: { behavior: { read_only: true } } } }))
    await expect(live('setIpBlocked')(ip, true, 7)).rejects.toThrow(ApiError)
  })

  it('builds a network page from its CIDR correlation, percent-encoding the slash', async () => {
    const calls = stub(sourcesFixtures())
    const out = (await live('getNetwork')(cidr))!
    expect(calls.some((url) => new URL(url).pathname === '/api/v1/investigate/cidr/203.0.113.0%2F24')).toBe(true)
    expect(out).toMatchObject({ cidr, asn: 'AS64496', org: 'Example Transit', country: 'NL' })
    expect(out.group.members.map((m) => m.ip)).toEqual([ip, '198.51.100.7'])
    expect(out.group.totalMatches).toBe(2)
    expect(out.campaign).toMatchObject({ cidr, score: 71 })
    // The group is folded from the records it was given: no organization
    // and no login count, because nothing upstream carries either.
    expect(out.group.members.every((m) => m.org === '' && m.logins === 0)).toBe(true)
    expect(out.group.networks).toEqual([{ id: '198.51.100.0/24', label: '198.51.100.0/24', count: 1 }, { id: '203.0.113.0/24', label: '203.0.113.0/24', count: 1 }])
  })

  it('asks the campaigns store for the network own campaign, and leaves it off when the store holds none', async () => {
    stub(sourcesFixtures({ '/api/v1/campaigns': { total: 0, rows: [] } }))
    expect((await live('getNetwork')(cidr))!.campaign).toBeUndefined()
  })

  it('builds a cluster page from the same correlation, with kind and value as separate params', async () => {
    const calls = stub(sourcesFixtures())
    const out = (await live('getCluster')('fingerprint', 'hassh:a7b1c0'))!
    const asked = calls.find((url) => new URL(url).pathname === '/api/v1/investigate/cluster')!
    // A value with spaces decodes differently through a packed path
    // segment than through a query string, so they are separate params.
    expect(new URL(asked).searchParams.get('kind')).toBe('fingerprint')
    expect(new URL(asked).searchParams.get('value')).toBe('hassh:a7b1c0')
    expect(out).toMatchObject({ kind: 'fingerprint', value: 'hassh:a7b1c0' })
    expect(out.group.members).toHaveLength(2)
  })

  it('answers a cluster the backend does not correlate with the page null', async () => {
    // Fewer than two members is the handler's own 404; a kind its
    // membership filter does not know (`credential`, which the page has and
    // no cluster document does) is a 400.
    stub(sourcesFixtures({ '/api/v1/investigate/cluster': fail(404, 'cluster not found') }))
    expect(await live('getCluster')('payload', '9f86d0818')).toBeNull()
    stub(sourcesFixtures({ '/api/v1/investigate/cluster': fail(400, 'unknown cluster kind') }))
    await expect(live('getCluster')('credential', 'root:toor')).rejects.toThrow(ApiError)
  })

  it('reads the identity why-merged table from the fusion chart endpoint', async () => {
    const calls = stub(sourcesFixtures({ '/api/v1/charts/attacker-fusion': { categories: ['JA3', 'HASSH'], values: [2, 1], ips: [ip, '198.51.100.7'] } }))
    expect(await live('getIdentityFusion')('att_9f21c4')).toEqual({ categories: ['JA3', 'HASSH'], values: [2, 1], ips: [ip, '198.51.100.7'] })
    expect(new URL(calls[0]).searchParams.get('id')).toBe('att_9f21c4')
    // A 404 is the backend's "no such attacker entity".
    stub(sourcesFixtures({ '/api/v1/charts/attacker-fusion': fail(404, 'no such attacker entity') }))
    expect(await live('getIdentityFusion')('att_nope')).toBeNull()
  })

  it('resolves a hash through the cluster endpoint the cluster page already reads', async () => {
    // One seam entry, two page types: `resolveHash` and `getCluster` ask
    // the same upstream path with the same query shape.
    const calls = stub(sourcesFixtures({ '/api/v1/investigate/cluster': { kind: 'payload', value: '9f86d0818', ip_count: 2, correlation: correlationWire } }))
    expect(await live('resolveHash')('9f86d0818')).toEqual({ kind: 'cluster', clusterKind: 'payload', value: '9f86d0818' })
    const asked = calls.filter((url) => new URL(url).pathname === '/api/v1/investigate/cluster')
    expect(asked.length).toBeGreaterThan(0)
    // A HASSH-prefixed lookup matches the bare value the store holds.
    stub(sourcesFixtures({ '/api/v1/investigate/cluster': { kind: 'fingerprint', value: 'hassh:a7b1c0', ip_count: 2, correlation: correlationWire } }))
    expect(await live('resolveHash')('a7b1c0')).toEqual({ kind: 'cluster', clusterKind: 'fingerprint', value: 'hassh:a7b1c0' })
    // A 404 for every kind is the page's not-found, not an error.
    stub(sourcesFixtures({ '/api/v1/investigate/cluster': fail(404, 'cluster not found') }))
    expect(await live('resolveHash')('deadbeef')).toEqual({ kind: 'not-found', value: 'deadbeef' })
  })

  it('leaves the mock answering when BACKEND_URL is unset or a scenario is in force', async () => {
    delete process.env.BACKEND_URL
    for (const name of ['getSourceProfiles', 'getAttackers', 'getNetworkCampaigns', 'getInfraClusters', 'getKillChain', 'getIpProfile', 'getNetwork', 'getCluster', 'resolveHash', 'getIdentityFusion'] as const) {
      expect(liveQuery(name, undefined), name).toBeUndefined()
    }
  })

  it('maps a failed sources fetch to an error, never to an empty list', async () => {
    const cases: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
      ['getSourceProfiles', () => live('getSourceProfiles')(), { '/api/v1/sources': fail(502) }],
      ['getAttackers', () => live('getAttackers')(), { '/api/v1/attackers': fail(502) }],
      ['getNetworkCampaigns', () => live('getNetworkCampaigns')(), { '/api/v1/campaigns': fail(502) }],
      ['getInfraClusters', () => live('getInfraClusters')(), { '/api/v1/clusters': fail(502) }],
      ['getKillChain', () => live('getKillChain')(), { '/api/v1/charts/attck-coverage': fail(502) }],
      ['getIpProfile', () => live('getIpProfile')(ip), { '/api/v1/investigate/ip/203.0.113.42': fail(502) }],
      ['getNetwork', () => live('getNetwork')(cidr), { '/api/v1/investigate/cidr/203.0.113.0%2F24': fail(502) }],
      ['getCluster', () => live('getCluster')('payload', '9f86'), { '/api/v1/investigate/cluster': fail(502) }],
      ['getIdentityFusion', () => live('getIdentityFusion')('att_1'), { '/api/v1/charts/attacker-fusion': fail(502) }],
      ['setIpBlocked', () => live('setIpBlocked')(ip, true, 7), { '/api/v1/ip-block': fail(502) }],
    ]
    for (const [name, call, fixtures] of cases) {
      stub(sourcesFixtures(fixtures))
      await expect(call(), name).rejects.toThrow(ApiError)
    }
  })
})

describe('the Monitor slice keeps the mock path untouched', () => {
  it('leaves every Monitor query answering from the mock without BACKEND_URL', async () => {
    // The default: an unconfigured deployment talks to nobody, and the ten
    // scenarios the smoke gate depends on keep working.
    delete process.env.BACKEND_URL
    for (const name of ['getOverview', 'getOverviewViews', 'getMlAnomalies', 'acknowledgeAllAnomalies', 'acknowledgeAnomalies', 'setAnomalyDisposition', 'getLlmAnalyses', 'semanticSearch', 'getAgentCampaigns', 'getAuthEvents', 'getAgentCampaign', 'getLlmAnalysis', 'getAnomaly'] as const) {
      expect(liveQuery(name, undefined), name).toBeUndefined()
    }
    const { backend } = await import('./backend')
    // The mock's own figures are still the mock's: four KPIs, folded rows and
    // all — nothing above reached for a fixture.
    const mock = backend('normal', { name: 'A', email: 'a@x.test', roles: ['admin'] })
    expect((await mock.getOverview()).kpis).toHaveLength(5)
    expect((await mock.getMlAnomalies()).anomalies.some((a) => a.folded > 1)).toBe(true)
    expect((await mock.getAgentCampaigns())[0].events[0].sourceIndex).not.toBe('')
  })
})
