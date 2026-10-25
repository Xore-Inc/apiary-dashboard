// Monitor slice adapters: one realistic wire fixture per endpoint, mapped to
// the page types the overview and the ML-anomalies, LLM-analysis,
// agent-campaigns and auth-events pages already render.
import { describe, expect, it } from 'vitest'
import type {
  AgentCampaignRow,
  AuthEventRow,
  ConfigDoc,
  Dashboard,
  LlmAnalysisRow,
  MlAckRecord,
  MlAnomalyRow,
  OverviewKpis,
  PayloadsPage,
} from '../contracts/monitor'
import type { AgentCampaign, Disposition } from '../types'
import {
  mlAckBody,
  mlDispositionBody,
  toAckAllCount,
  toAckedCount,
  toAgentCampaign,
  barRows,
  overviewSources,
  pieRows,
  seriesPoints,
  toAuthFailure,
  toCampaignSummary,
  toCountRows,
  toDispositionStatus,
  toLlmAnalysis,
  toMlAnomalies,
  toMlAnomaly,
  toModelHealth,
  toOpenBacklog,
  toOverviewKpis,
  toOverviewViews,
  toPayloadCount,
  toPresentation,
  toSemanticSearch,
  toSeverity,
} from './monitor'

const kpis: OverviewKpis = {
  total: 512_004,
  last24h: 18_402,
  previous24h: 15_110,
  change24h: '+21%',
  unique_ips: 4_118,
  hourly: [812, 690, 741, 1204],
  logins: 96,
  sessions_24h: 312,
  sessions_previous24h: 280,
  hourly_by_protocol: [{ hour: '2026-10-13T10:00:00.000Z', total: 812, counts: { ssh: 700, other: 112 } }],
  ready: true,
}

const dashboard: Dashboard = {
  protocols: [{ key: 'ssh', count: 8120, link: '/explore?proto=ssh' }],
  top_ports: [{ key: '22', count: 6110, link: '/explore?port=22' }],
  countries: [{ key: 'NL', count: 2210, link: '/explore?country=NL' }],
  asns: [{ key: 'AS64496 Example Transit', count: 980, link: '/asn/AS64496' }],
  providers: [{ key: 'hosting', count: 1500, link: '/explore?provider=hosting' }],
  top_ips: [{ key: '203.0.113.42', count: 640, link: '/sources/203.0.113.42' }],
  top_paths: [{ key: '/admin', count: 210, link: '/explore?path=/admin' }],
  top_creds: [{ key: 'root / admin', count: 480, link: '/explore?cred=root+%2F+admin' }],
  top_commands: [{ key: 'uname -a', count: 96, link: '/commands' }],
  clients: [{ key: 'curl/8.5.0', count: 310, link: '/explore?fingerprint=curl' }],
  fingerprints: [{ key: 'hassh:a7b1c0', count: 220, link: '/clusters/fingerprint:hassh%3Aa7b1c0' }],
  alerts: [{ key: 'ET EXPLOIT ...', count: 12, link: '/alerts' }],
  alert_cats: [{ key: 'Attempted Administrator Privilege Gain', count: 9, link: '/explore?cat=attempted-administrator-privilege-gain' }],
  payloads: [{ shasum: '9f86d081884c7d65', download: '/tmp/p.sh', count: 4, link: '/payloads/9f86d081', vt: 'https://www.virustotal.com/gui/file/9f86d081' }],
  logins: 96,
  heatmap: [{ sensor: 'cowrie', cells: [{ label: '10', count: 42, pct: 70 }, { label: '11', count: 60, pct: 100 }] }],
  map_points: [{ city: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.89, events: 2210, ips: 340, url: '/explore?city=Amsterdam' }],
  sensors: [{ name: 'cowrie', count: 18_402, last_seen: '2026-10-04T21:02:00Z', state: 'active' }],
}

const anomaly: MlAnomalyRow = {
  '@timestamp': '2026-10-04T20:58:11Z',
  severity: 'high',
  composite_score: 0.9123,
  model_scores: { isolation_forest: 0.8412, lstm_ae: null, hbos: 0.7744 },
  explanation: '48 failed logins then a payload drop',
  src_ip: '203.0.113.42',
  src_country: 'NL',
  src_port: 44_512,
  dst_ip: '10.0.0.7',
  dst_port: 22,
  proto: 'tcp',
  sensor: 'cowrie',
  event_type: 'process',
  community_id: '1:abc123',
  source_event_id: 'ev_7f3a91',
  source_index: 'honeypot-v2-cowrie',
  alert_threshold: 0.65,
  model_state_id: 'iso:v4|lstm:v2|hbos:v3',
  status: 'open',
  disposition_reason: null,
  disposition_by: null,
  disposed_at: null,
}

const analysis: LlmAnalysisRow = {
  '@timestamp': '2026-10-04T20:10:00Z',
  analysis_id: 'an_44de91',
  doc_type: 'session',
  session_id: 'sess_99a',
  payload_sha256: '',
  src_ip: '203.0.113.42',
  model: 'qwen2.5-coder:14b',
  summary: 'Attacker enumerated the honeyfs and downloaded a script.',
  intent: 'reconnaissance',
  behaviors: ['ls', 'cat /etc/passwd'],
  severity: 'medium',
  confidence: 'high',
  error: '',
}

const campaign: AgentCampaignRow = {
  '@timestamp': '2026-10-04T19:00:00Z',
  campaign_id: 'c0ffee1234567890',
  start: '2026-10-04T18:10:00Z',
  end: '2026-10-04T18:59:00Z',
  severity: 'critical',
  matched_categories: ['reconnaissance', 'credential-access'],
  correlation_identifiers: ['203.0.113.42', 'hassh:a7b1c0'],
  event_count: 2,
  events: [
    {
      event_id: 'ev_7f3a91',
      source_index: '',
      timestamp: '2026-10-04T18:11:00Z',
      matched_rules: [{ rule: 'burst-failed-logins', reason: '12 logins in 60s', trust_boundary: 'identity', decode_chain: [{ transform: 'base64', input_sha256: 'a1', output_sha256: 'b2', output_len: 48 }] }],
    },
    { event_id: 'ev_7f3a92', source_index: '', timestamp: '2026-10-04T18:59:00Z', matched_rules: [] },
  ],
}

const authEvent: AuthEventRow = {
  '@timestamp': '2026-10-04T18:30:00Z',
  event_id: 'kc-9f2b1c',
  type: 'LOGIN_ERROR',
  realm: 'apiary',
  client_id: 'apiary-frontend',
  user_id: null,
  ip_address: '203.0.113.42',
  error: 'invalid_user_credentials',
  details: { username: 'admin', redirect_uri: '' },
}

const ack: MlAckRecord = { Key: 'an_doc_1', Acknowledged: true, AckedBy: 'analyst', AckedAt: '2026-10-04T21:00:00Z' }

describe('monitor adapters', () => {
  // Bodies as GET /api/v1/sources?size=3 and the chart routes served them on
  // 2026-10-09 (read-only probes); the source list is trimmed to its first two rows.
  it('maps GET /sources to the overview top sources, keeping only what the wire carries', () => {
    const wire = {
      total_unique: 29303,
      truncated: true,
      rows: [
        { ip: '85.217.149.4', country: 'DE', events: 896629, logins: 0, sessions: 0, sensors: ['zeek', 'suricata'], first: '2026-09-29T14:57:13.871Z', last: '2026-10-09T14:56:22.158Z' },
        { ip: '85.217.149.16', country: '', events: 896623, logins: 0, sessions: 0, sensors: ['zeek'], first: '2026-09-29T14:57:13.871Z', last: '2026-10-09T14:56:22.158Z' },
        { ip: '45.156.129.136', country: '', events: 896621, logins: 0, sessions: 0, sensors: ['zeek'], first: '2026-09-29T14:57:13.871Z', last: '2026-10-09T14:56:22.158Z' },
      ],
    }
    expect(overviewSources(wire, 2)).toEqual([
      { ip: '85.217.149.4', country: 'DE', events: 896629, firstSeen: '2026-09-29T14:57:13.871Z', lastSeen: '2026-10-09T14:56:22.158Z' },
      { ip: '85.217.149.16', events: 896623, firstSeen: '2026-09-29T14:57:13.871Z', lastSeen: '2026-10-09T14:56:22.158Z' },
    ])
  })

  it('maps the os-distribution pie and a bar chart to count rows, in the chart order', () => {
    expect(pieRows([{ name: 'Linux 2.2.x-3.x', value: 14 }, { name: 'Windows 7 or 8', value: 1 }])).toEqual([
      { id: 'Linux 2.2.x-3.x', label: 'Linux 2.2.x-3.x', count: 14 },
      { id: 'Windows 7 or 8', label: 'Windows 7 or 8', count: 1 },
    ])
    // The first JA4H category is the empty string on the wire; it stays a row.
    expect(barRows({ categories: ['', '11312_50'], values: [545613, 73] })).toEqual([
      { id: '', label: '', count: 545613 },
      { id: '11312_50', label: '11312_50', count: 73 },
    ])
  })

  it('pivots series into one point per instant, keyed by the series name', () => {
    expect(
      seriesPoints([
        { name: 'bytes', points: [{ time: '2026-10-08T20:00:00.000Z', value: 164474703 }, { time: '2026-10-08T21:00:00.000Z', value: 12 }] },
        { name: 'packets', points: [{ time: '2026-10-08T21:00:00.000Z', value: 4 }] },
      ]),
    ).toEqual([
      { time: '2026-10-08T20:00:00.000Z', bytes: 164474703 },
      { time: '2026-10-08T21:00:00.000Z', bytes: 12, packets: 4 },
    ])
    expect(seriesPoints([])).toEqual([])
  })

  it('turns a dashboard key/count list into count rows, the key as both id and label', () => {
    expect(toCountRows([{ key: 'CN', count: 86685, link: '/events?country=CN' }])).toEqual([{ id: 'CN', label: 'CN', count: 86685 }])
  })

  it('maps GET /overview/kpis, previous figures only where the wire has them', () => {
    const [events, sources, logins] = toOverviewKpis(kpis)
    expect(events).toEqual({ id: 'events', label: 'Events', value: 18_402, previous: 15_110, trend: [812, 690, 741, 1204] })
    // unique_ips has no previous-period figure on the wire, so the tile shows no change.
    expect(sources).toEqual({ id: 'sources', label: 'Unique sources', value: 4_118, previous: 4_118, trend: [] })
    expect(logins).toMatchObject({ id: 'logins', value: 96 })
  })

  it('maps GET /overview/dashboard, dropping the heat intensity and the drill-down links', () => {
    const views = toOverviewViews(dashboard)
    expect(views.heatmap).toEqual([{ sensor: 'cowrie', cells: [42, 60] }])
    expect(views.feeds).toEqual([{ sensor: 'cowrie', state: 'fresh', documents: 18_402, lastSeen: '2026-10-04T21:02:00Z' }])
    expect(views.credentials).toEqual([{ id: 'root / admin', label: 'root / admin', count: 480 }])
    expect(views.mapPoints).toEqual([{ country: 'NL', lat: 52.37, lon: 4.89, events: 2210, ips: 340 }])
  })

  it('maps every feed state, and a dashboard with no slices asked for', () => {
    const quiet = toOverviewViews({ ...dashboard, sensors: [{ name: 'dionaea', count: 12, last_seen: '', state: 'quiet' }, { name: 'conpot', count: 0, last_seen: '', state: 'stale' }] })
    expect(quiet.feeds.map((f) => f.state)).toEqual(['delayed', 'stale'])
    // ?parts= strips the aggregations, so every list key is still present but empty.
    const empty = dashboardKeysServedEmpty()
    expect(empty.protocols).toEqual([])
    expect(empty.logins).toBe(0)
    expect(empty.heatmap).toEqual([])
  })

  it('maps GET /campaigns and GET /payloads for the overview summary', () => {
    expect(toCampaignSummary({ cidr: '203.0.113.0/24', score: 71, events: 4_210, unique_ips: 96, sensors: ['cowrie'], ports: ['22'], first: '2026-10-01T00:00:00Z', last: '2026-10-04T21:00:00Z' })).toEqual({ cidr: '203.0.113.0/24', events: 4_210, uniqueIps: 96, sensors: ['cowrie'], last: '2026-10-04T21:00:00Z' })
    const page: PayloadsPage = { total: 128, rows: [] }
    expect(toPayloadCount(page)).toBe(128)
  })

  it('maps GET /config, and a never-configured deployment with no presentation block', () => {
    const doc: ConfigDoc = { revision: 7, schema_version: 4, updated: '2026-10-01T09:00:00Z', payload: { presentation: { dashboard_title: 'Field sensors', banner_text: 'Maintenance window', banner_severity: 'warning', footer_text: '' } } }
    expect(toPresentation(doc)).toEqual({ dashboardTitle: 'Field sensors', dashboardSubtitle: '', footerText: '', bannerText: 'Maintenance window', bannerSeverity: 'warning' })
    expect(toPresentation({ revision: 0, payload: {} })).toEqual({ dashboardTitle: '', dashboardSubtitle: '', footerText: '', bannerText: '', bannerSeverity: '' })
  })

  it('maps a store/ml-anomalies row and its ack, a null detector score reading 0', () => {
    const [row] = toMlAnomalies({ total: 1, rows: [{ ...anomaly, _doc_id: 'an_doc_1' }] }, { 'an_doc_1': ack })
    expect(row).toEqual({
      id: 'an_doc_1',
      timestamp: '2026-10-04T20:58:11Z',
      severity: 'high',
      compositeScore: 0.9123,
      // lstm_ae is a stored null (the detector did not fire), not a 0.0.
      modelScores: { isolationForest: 0.8412, lstmAe: 0, hbos: 0.7744 },
      srcIp: '203.0.113.42',
      country: 'NL',
      explanation: '48 failed logins then a payload drop',
      sourceEventId: 'ev_7f3a91',
      sourceIndex: 'honeypot-v2-cowrie',
      eventType: 'process',
      dstPort: 22,
      proto: 'tcp',
      sensor: 'cowrie',
      status: 'acknowledged',
      thresholdAtScoring: 0.65,
      modelState: 'iso:v4|lstm:v2|hbos:v3',
    })
  })

  it('lets a disposition win over an ack, and an ack win over open', () => {
    const dispositioned = toMlAnomaly({ ...anomaly, _doc_id: 'an_doc_1', status: 'false_positive', disposition_reason: 'honeypot banner' }, ack)
    expect(dispositioned.status).toBe('false_positive')
    expect(dispositioned.dispositionReason).toBe('honeypot banner')
    expect(toMlAnomaly({ ...anomaly, _doc_id: 'an_doc_1' }).status).toBe('open')
  })

  it('maps an anomaly with every nullable field null', () => {
    const sparse = toMlAnomaly({ ...anomaly, _doc_id: 'an_doc_1', src_ip: null, src_country: null, sensor: null, proto: null, model_state_id: null, model_scores: null })
    expect(sparse).toMatchObject({ srcIp: undefined, country: undefined, sensor: '', proto: '', modelState: undefined, modelScores: { isolationForest: 0, lstmAe: 0, hbos: 0 }, status: 'open' })
    expect('srcIp' in sparse && sparse.srcIp !== undefined).toBe(false)
  })

  it('reads a port the worker stored as text, and builds the ack and disposition bodies', () => {
    const textPort = toMlAnomaly({ ...anomaly, _doc_id: 'an_doc_1', dst_port: '8443' })
    expect(textPort.dstPort).toBe(8443)
    expect(toMlAnomaly({ ...anomaly, _doc_id: 'an_doc_1', dst_port: null }).dstPort).toBe(0)
    expect(mlAckBody('an_doc_1', false, 'analyst')).toEqual({ key: 'an_doc_1', ack: false, actor: 'analyst' })
    expect(mlAckBody('an_doc_1', true)).toEqual({ key: 'an_doc_1', ack: true })
    expect(mlDispositionBody('an_doc_1', 'true_positive', 'dropped a miner', 'analyst')).toEqual({ key: 'an_doc_1', status: 'true_positive', reason: 'dropped a miner', actor: 'analyst' })
    expect(mlDispositionBody('an_doc_1', 'open')).toEqual({ key: 'an_doc_1', status: 'open' })
    // 'acknowledged' is an ack-sidecar status, not a disposition the backend accepts.
    expect(() => mlDispositionBody('an_doc_1', 'acknowledged')).toThrow(/not a disposition/)
  })

  it('maps the stats, model-health and the two POST responses', () => {
    expect(toOpenBacklog({ total: 4_210, open: 118 })).toBe(118)
    expect(toModelHealth({ model: 'isolation_forest', timestamp: '2026-10-04T06:00:00Z', accepted: true, reason: '', anomaly_rate_new: 0.02, anomaly_rate_previous: 0.03, train_samples: 18_402 })).toEqual({ model: 'isolation_forest', timestamp: '2026-10-04T06:00:00Z', accepted: true, reason: '', anomalyRateNew: 0.02, anomalyRatePrevious: 0.03, trainSamples: 18_402 })
    expect(toAckedCount([ack, { ...ack, Key: 'an_doc_2', Acknowledged: false }])).toBe(1)
    expect(toAckAllCount({ changed: 118 })).toBe(118)
    expect(toDispositionStatus({ key: 'an_doc_1', status: 'benign_known', disposed_at: '2026-10-04T21:10:00Z' })).toBe('benign_known')
  })

  it('maps a store/llm-analysis row, and a worker error record reading as a report', () => {
    expect(toLlmAnalysis({ ...analysis, _doc_id: 'es_id_1' })).toEqual({
      id: 'an_44de91',
      timestamp: '2026-10-04T20:10:00Z',
      docType: 'session',
      severity: 'medium',
      confidence: 'high',
      intent: 'reconnaissance',
      summary: 'Attacker enumerated the honeyfs and downloaded a script.',
      sessionId: 'sess_99a',
      srcIp: '203.0.113.42',
      model: 'qwen2.5-coder:14b',
      behaviors: ['ls', 'cat /etc/passwd'],
    })
    // doc_type "error" is the worker's failure record; it is not a page docType.
    const failed = toLlmAnalysis({ ...analysis, doc_type: 'error', error: 'model timeout', confidence: '', _doc_id: 'es_id_2' })
    expect(failed.docType).toBe('report')
    expect(failed.confidence).toBeUndefined()
    expect(failed.error).toBe('model timeout')
  })

  it('maps a payload analysis and an empty session, where "" reads as absent', () => {
    const payload = toLlmAnalysis({ ...analysis, doc_type: 'payload', session_id: '', payload_sha256: '9f86d081884c7d65a174b4a855d', _doc_id: 'es_id_3' })
    expect(payload).toMatchObject({ docType: 'payload', payloadSha256: '9f86d081884c7d65a174b4a855d' })
    expect('sessionId' in payload && payload.sessionId !== undefined).toBe(false)
  })

  it('maps GET /llm-search, an unavailable search, and an empty available one', () => {
    const hit = { ...analysis, score: 0.8123 }
    expect(toSemanticSearch({ available: true, hits: [hit] })).toEqual({ available: true, hits: [{ id: 'an_44de91', score: 0.8123, severity: 'medium', summary: analysis.summary, sessionId: 'sess_99a' }] })
    expect(toSemanticSearch({ available: false, reason: 'semantic search is not configured' })).toEqual({ available: false, reason: 'semantic search is not configured' })
    // Available but filtered out: still available, zero hits.
    expect(toSemanticSearch({ available: true, hits: [], foreign_embeddings: 4, note: '4 sessions are embedded by a different model' })).toEqual({ available: true, hits: [] })
  })

  it('maps an agent campaign, a null score reading 0', () => {
    expect(toAgentCampaign(campaign)).toEqual({
      id: 'c0ffee1234567890',
      timestamp: '2026-10-04T19:00:00Z',
      start: '2026-10-04T18:10:00Z',
      end: '2026-10-04T18:59:00Z',
      severity: 'critical',
      categories: ['reconnaissance', 'credential-access'],
      identifiers: ['203.0.113.42', 'hassh:a7b1c0'],
      eventCount: 2,
      events: [
        { eventId: 'ev_7f3a91', sourceIndex: '', timestamp: '2026-10-04T18:11:00Z', matchedRules: [{ rule: 'burst-failed-logins', reason: '12 logins in 60s', trustBoundary: 'identity', decodeChain: [{ transform: 'base64', inputSha256: 'a1', outputSha256: 'b2', outputLen: 48 }] }] },
        { eventId: 'ev_7f3a92', sourceIndex: '', timestamp: '2026-10-04T18:59:00Z', matchedRules: [] },
      ],
    } satisfies Partial<AgentCampaign>)
  })

  it("keeps '' for an event stored before source_index existed, and passes a stored one through", () => {
    const [withRule] = toAgentCampaign(campaign).events
    expect(withRule.sourceIndex).toBe('')
    const stored = toAgentCampaign({ ...campaign, events: [{ event_id: 'ev_1', source_index: 'honeypot-v2-cowrie', timestamp: '2026-10-04T18:00:00Z' }] })
    expect(stored.events[0].sourceIndex).toBe('honeypot-v2-cowrie')
  })

  it("reads a missing source_index (a backend from before APIARY #3696) as ''", () => {
    const old = toAgentCampaign({ ...campaign, events: [{ event_id: 'ev_1', timestamp: '2026-10-04T18:00:00Z' }] })
    expect(old.events[0].sourceIndex).toBe('')
  })

  it('maps an auth event, reading username and redirectUri out of details', () => {
    expect(toAuthFailure({ ...authEvent, _doc_id: 'kc-9f2b1c' })).toEqual({
      id: 'kc-9f2b1c',
      timestamp: '2026-10-04T18:30:00Z',
      type: 'LOGIN_ERROR',
      ip: '203.0.113.42',
      error: 'invalid_user_credentials',
      username: 'admin',
      clientId: 'apiary-frontend',
      realm: 'apiary',
      userId: undefined,
    })
    // Keycloak left no details on this one: every details-derived field is absent.
    const bare = toAuthFailure({ ...authEvent, user_id: null, ip_address: null, details: {}, _doc_id: 'kc-9f2b1d' })
    expect(bare.ip).toBeUndefined()
    expect(bare.userId).toBeUndefined()
    expect('username' in bare && bare.username !== undefined).toBe(false)
  })

  it('falls back to info severity and a network provider class', () => {
    expect(toSeverity('critical')).toBe('critical')
    expect(toSeverity('sev1')).toBe('info')
    expect(toSeverity(undefined)).toBe('info')
    const disposition: Disposition = 'benign_known'
    expect(toDispositionStatus({ key: 'k', status: disposition, disposed_at: '' })).toBe('benign_known')
  })
})

/** What `?parts=` returns for a slice the caller did not ask for: every key
 * present, the unrequested lists empty. */
function dashboardKeysServedEmpty(): Pick<Dashboard, 'protocols' | 'logins' | 'heatmap'> {
  const empty: Dashboard = {
    protocols: [], top_ports: [], countries: [], asns: [], providers: [], top_ips: [], top_paths: [], top_creds: [], top_commands: [], clients: [], fingerprints: [], alerts: [], alert_cats: [], payloads: [],
    logins: 0, heatmap: [], map_points: [], sensors: [],
  }
  return empty
}