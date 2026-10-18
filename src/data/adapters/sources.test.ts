// Sources & correlation slice adapters: one realistic wire fixture per
// endpoint, mapped to the page types the sources, campaigns, clusters,
// attackers and investigate pages already render.
import { describe, expect, it } from 'vitest'
import type { AttackerEntityWire, CampaignWire, ClusterWire, CorrelationWire, CredEdgeWire, IpBlockWire, IpProfileWire, MapPointsWire, SourceRowWire } from '../contracts/sources'
import type { HoneypotEvent } from '../types'
import { sharedSignals, attackerGraph, attackers, correlation, correlationGroup, credReuse, infraClusters, ipBlockRecord, ipCorrelation, ipProfile, mapPoints, networkCampaigns, setIpBlockBody, sourceProfiles } from './sources'

const sourceRow: SourceRowWire = {
  ip: '203.0.113.42',
  country: 'NL',
  events: 812,
  logins: 96,
  sessions: 31,
  sensors: ['cowrie', 'suricata', 'dionaea'],
  first: '2026-09-25T04:11:00Z',
  last: '2026-10-04T21:02:00Z',
}

const entity: AttackerEntityWire = {
  id: 'att_9f21c4',
  ips: ['203.0.113.42', '198.51.100.7'],
  fingerprints: ['hassh:a7b1c0'],
  payloads: ['9f86d0818'],
  credentials: ['root:root'],
  sensors: ['cowrie', 'dionaea'],
  events: 4210,
  first: '2026-09-12T10:00:00Z',
  last: '2026-10-04T20:44:00Z',
  updated: '2026-10-04T21:00:00Z',
  verdicts: ['9f86d0818: trojan.mirai'],
  techniques: ['T1059.004'],
  ports_touched: 18,
  dest_ips: 240,
  protocols_touched: 4,
  scan: 'horizontal',
}

const campaign: CampaignWire = {
  cidr: '203.0.113.0/24',
  score: 71,
  events: 4210,
  unique_ips: 12,
  dst_ips_touched: 240,
  ports_touched_counted: 18,
  protocols_touched: 4,
  scan: 'horizontal',
  sensors: ['cowrie', 'dionaea', 'suricata'],
  ports: ['22', '23', '2323'],
  creds: 9,
  payloads: 3,
  alerts: 14,
  providers: ['hosting'],
  fingerprints: 5,
  first: '2026-09-30T00:00:00Z',
  last: '2026-10-04T21:00:00Z',
  generated: '2026-10-04T21:05:00Z',
  explanation: 'cross-sensor activity (3); 12 related source IPs; horizontal scan across 240 hosts',
}

const cluster: ClusterWire = {
  kind: 'asn',
  value: 'AS15169 Google LLC',
  events: 880,
  sources: 6,
  sensors: ['cowrie'],
  generated: '2026-10-04T21:05:00Z',
}

const credEdge: CredEdgeWire = {
  user: 'root',
  pass: 'admin',
  unique_ips: 14,
  ips: ['203.0.113.42', '198.51.100.7'],
  sensors: ['cowrie', 'telnet'],
  events: 210,
  first: '2026-09-28T00:00:00Z',
  last: '2026-10-04T19:12:00Z',
}

const shared: CorrelationWire = {
  total: 4210,
  truncated: false,
  sensors: [
    { key: 'cowrie', count: 3900 },
    { key: 'portbridge', count: 310 },
  ],
  sensors_total: 14,
  tunnel_connections: 310,
  tunnel_os_guesses: ['Linux 4.x', 'Windows 7 or 8'],
  records: [],
}

describe('sources adapters', () => {
  it('maps GET /sources, dropping the org the wire row has no field for', () => {
    expect(sourceProfiles({ total_unique: 2, truncated: false, rows: [sourceRow] })).toEqual([
      { ip: '203.0.113.42', country: 'NL', org: '', events: 812, logins: 96, sessions: 31, sensors: ['cowrie', 'suricata', 'dionaea'], first: '2026-09-25T04:11:00Z', last: '2026-10-04T21:02:00Z' },
    ])
  })

  it('maps the map_points slice, dropping city and the drill-down url', () => {
    const wire: MapPointsWire = {
      protocols: [], top_ports: [], countries: [], asns: [], providers: [], top_ips: [], top_paths: [], top_creds: [],
      top_commands: [], clients: [], fingerprints: [], alerts: [], alert_cats: [], payloads: [], heatmap: [], sensors: [],
      logins: 0,
      map_points: [{ city: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.9, events: 812, ips: 14, url: '/events?city=Amsterdam' }],
    }
    expect(mapPoints(wire)).toEqual([{ country: 'NL', lat: 52.37, lon: 4.9, events: 812, ips: 14 }])
  })

  it('maps GET /attackers, carrying the scan label across', () => {
    const [out] = attackers({ total: 1, rows: [{ ...entity, _doc_id: entity.id }] })
    expect(out).toMatchObject({ id: 'att_9f21c4', scan: 'horizontal', destIps: 240, portsTouched: 18, techniques: ['T1059.004'] })
    expect(out).not.toHaveProperty('protocols_touched')
  })

  it('omits scan when the correlator labelled neither window', () => {
    const [out] = attackers({ total: 1, rows: [{ ...entity, scan: '', _doc_id: entity.id }] })
    expect(out).not.toHaveProperty('scan')
  })

  it('passes the attackers-graph nodes and edges through unchanged', () => {
    const wire = {
      nodes: [
        { id: 'hub:att_9f21c4', label: 'att_9f2', kind: 'hub' },
        { id: '203.0.113.42', label: '203.0.113.42', kind: 'spoke' },
        { id: 'overflow:att_9f21c4', label: '+30', kind: 'overflow' },
      ],
      edges: [
        { source: 'hub:att_9f21c4', target: '203.0.113.42' },
        { source: 'hub:att_9f21c4', target: 'overflow:att_9f21c4' },
      ],
    }
    expect(attackerGraph(wire)).toEqual(wire)
  })

  it('maps GET /campaigns, page portsTouched from the ports list not the scored count', () => {
    const [out] = networkCampaigns({ total: 1, rows: [{ ...campaign, _doc_id: campaign.cidr }] })
    expect(out).toMatchObject({ cidr: '203.0.113.0/24', ports: [22, 23, 2323], portsTouched: 3, scan: 'horizontal', asns: [], sequence: [] })
    expect(out).not.toHaveProperty('ports_touched_counted')
  })

  it('maps GET /cred-reuse, rejoining the id the wire splits', () => {
    expect(credReuse([credEdge])).toEqual([{ id: 'root:admin', user: 'root', pass: 'admin', uniqueIps: 14, sensors: ['cowrie', 'telnet'], events: 210, last: '2026-10-04T19:12:00Z' }])
  })

  it('maps GET /clusters, keying the id on kind:value', () => {
    expect(infraClusters({ total: 1, rows: [{ ...cluster, _doc_id: 'asn:AS15169 Google LLC' }] })).toEqual([{ id: 'asn:AS15169 Google LLC', kind: 'asn', value: 'AS15169 Google LLC', sources: 6, events: 880, sensors: ['cowrie'] }])
  })

  it('maps the block state, and drops a lapsed record the backend still calls Blocked', () => {
    const active: IpBlockWire = { IP: '203.0.113.42', Blocked: true, Active: true, BlockedBy: 'analyst', BlockedAt: '2026-10-04T12:00:00Z', ExpiresAt: '2026-10-11T12:00:00Z' }
    expect(ipBlockRecord(active)).toEqual({ by: 'analyst', at: '2026-10-04T12:00:00Z', expiresAt: '2026-10-11T12:00:00Z' })
    expect(ipBlockRecord({ ...active, Active: false })).toBeNull()
  })

  it('reads a never-blocked address as no record at all', () => {
    expect(ipBlockRecord({ IP: '203.0.113.42', Blocked: false, Active: false })).toBeNull()
  })

  it('builds the POST /ip-block body — a block names its duration, an unblock sends none, and actor is never sent', () => {
    expect(setIpBlockBody('203.0.113.42', true, 7)).toEqual({ ip: '203.0.113.42', blocked: true, expires_days: 7 })
    expect(setIpBlockBody('203.0.113.42', true, 0)).toEqual({ ip: '203.0.113.42', blocked: true, expires_days: 0 })
    expect(setIpBlockBody('203.0.113.42', false)).toEqual({ ip: '203.0.113.42', blocked: false })
    expect(() => setIpBlockBody('203.0.113.42', true)).toThrow(/duration/)
    expect(() => setIpBlockBody('203.0.113.42', true, -1)).toThrow(/duration/)
  })

  it('maps the one shared Correlation both drill-down envelopes carry', () => {
    expect(correlation({ ...shared, truncated: true })).toEqual({ totalMatches: 4210, tunnelConnections: 310, tunnelOsGuesses: ['Linux 4.x', 'Windows 7 or 8'] })
    // `sensors` holds only the top 10: the count comes from `sensors_total`.
    expect(ipCorrelation(shared).distinctSensors).toBe(14)
  })

  it('maps GET /investigate/ip/{ip}, with the AS number and organization', () => {
    const wire: IpProfileWire = {
      ip: '203.0.113.42', total: 4210, first: '2026-09-25T04:11:00Z', last: '2026-10-04T21:02:00Z',
      country: 'NL', asn: 'Example Hosting B.V.', as_organization: 'Example Hosting B.V.', as_number: 64512,
      sensors: [{ key: 'cowrie', count: 3900 }], ports: [{ key: '22', count: 900 }], protos: [{ key: 'ssh', count: 800 }],
      credentials: [{ key: 'root', count: 96 }], commands: [{ key: 'uname -a', count: 40 }], sessions: [{ key: 's-1', count: 31 }],
      techniques: [{ id: 'T1059.004', name: 'Unix Shell', domain: 'Execution', evidence: 'a shell command was recorded', count: 40, url: 'https://attack.mitre.org/techniques/T1059/004/' }],
      payloads: [{ key: '9f86d0818', count: 3 }], alerts: [{ key: 'ET SCAN Nmap', count: 14 }],
      fingerprints: [{ key: 'hassh:a7b1c0', count: 60 }], paths: [], events: [],
      portbridge: { os: 'Linux 4.x', first: '2026-09-30T00:00:00Z', last: '2026-10-04T20:00:00Z', ports_touched: [] },
      correlation: shared, confirmed_malicious: true,
    }
    const out = ipProfile(wire)
    expect(out.source).toMatchObject({ ip: '203.0.113.42', org: 'Example Hosting B.V.', asn: 'AS64512', asNumber: 64512, riskScore: 0, tags: [], sessions: 31 })
    expect(out.confirmedMalicious).toBe(true)
    expect(out.sensors).toEqual([{ id: 'cowrie', label: 'cowrie', count: 3900 }])
    expect(out.techniques).toEqual([{ id: 'T1059.004', name: 'Unix Shell', tactic: 'Execution', events: 40 }])
    expect(out.correlation).toEqual({ totalMatches: 4210, tunnelConnections: 310, distinctSensors: 14, tunnelOsGuesses: ['Linux 4.x', 'Windows 7 or 8'] })
  })

  it('falls back for a backend from before APIARY #3696: asn is the org, no AS number, sensors.length counts', () => {
    const { sensors_total: _drop, ...oldCorrelation } = shared
    const old = { ip: '203.0.113.42', total: 1, first: '2026-10-04T00:00:00Z', last: '2026-10-04T00:00:00Z', country: 'NL', asn: 'Example Hosting B.V.',
      sensors: [], ports: [], protos: [], credentials: [], commands: [], sessions: [], techniques: [],
      payloads: [], alerts: [], fingerprints: [], paths: [], events: [], portbridge: null, correlation: oldCorrelation, confirmed_malicious: false } satisfies IpProfileWire
    const out = ipProfile(old)
    expect(out.source).toMatchObject({ org: 'Example Hosting B.V.', asn: '', asNumber: null })
    expect(out.correlation.distinctSensors).toBe(2)
    expect(ipCorrelation(oldCorrelation).distinctSensors).toBe(2)
    expect(correlationGroup(oldCorrelation, []).sensorsTotal).toBe(2)
  })

  it('maps an address with no portbridge profile and no records', () => {
    const out = ipProfile({
      ip: '198.51.100.7', total: 1, first: '2026-10-04T00:00:00Z', last: '2026-10-04T00:00:00Z', country: '', asn: '', as_organization: '', as_number: null,
      sensors: [], ports: [], protos: [], credentials: [], commands: [], sessions: [], techniques: [],
      payloads: [], alerts: [], fingerprints: [], paths: [], events: [], portbridge: null,
      correlation: { total: 1, truncated: false, sensors: [], sensors_total: 0, tunnel_connections: 0, tunnel_os_guesses: [], records: [] },
      confirmed_malicious: false,
    })
    expect(out.sensors).toEqual([])
    expect(out.source).toMatchObject({ org: '', asn: '', asNumber: null })
    expect(out.correlation.tunnelOsGuesses).toEqual([])
  })
})
describe('sharedSignals', () => {
  const event = (srcIp: string, extra: Partial<HoneypotEvent>): HoneypotEvent => ({ id: srcIp, timestamp: '2026-10-09T00:00:00Z', sensor: 'cowrie', type: 'connection', srcIp, dstPort: 22, eventName: 'x', fields: {}, techniques: [], ...extra })

  it('lists a value only when two or more distinct addresses carry it, most shared first', () => {
    const rows = [
      event('203.0.113.1', { username: 'root', password: 'root', fingerprint: 'hassh-a', asn: 'AS64496' }),
      event('203.0.113.1', { username: 'root', password: 'root' }),
      event('203.0.113.2', { username: 'root', password: 'root', fingerprint: 'hassh-b' }),
      event('203.0.113.3', { username: 'root', password: 'root', fields: { shasum: 'abc' } }),
      event('203.0.113.2', { fields: { shasum: 'abc' } }),
    ]
    expect(sharedSignals(rows)).toEqual([
      { id: 'credential:root:root', kind: 'credential', value: 'root:root', members: ['203.0.113.1', '203.0.113.2', '203.0.113.3'] },
      { id: 'payload:abc', kind: 'payload', value: 'abc', members: ['203.0.113.3', '203.0.113.2'] },
    ])
  })
})
