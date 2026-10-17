// Operations slice adapters: one realistic wire fixture per endpoint, mapped
// to the page types the operations pages already render.
import { describe, expect, it } from 'vitest'
import type {
  AlertPageWire,
  CuratedSensorsWire,
  ProblemReportPageWire,
  SensorEventsWire,
  SensorOverviewWire,
  SourceHealthWire,
  TopologyWire,
} from '../contracts/operations'
import type { ServicesWire } from '../contracts/settings'
import type { Sensor } from '../types'
import {
  alertAckBody,
  alertPage,
  curatedSensors,
  deadLetters,
  pipelineState,
  problemReportPage,
  problemStatusBody,
  purgedDeadLetters,
  sensorCatalog,
  sensorEvents,
  sensorFeeds,
  sensorOverview,
  sensorState,
  sourceHealth,
  topology,
} from './operations'

const alerts: AlertPageWire = {
  total: 2,
  rows: [
    {
      Key: 'yara:9f86d081884c7d65',
      Message: 'yara matched loader_gen on 9f86d081884c7d65',
      Link: '/payloads/9f86d081',
      FirstSeen: '2026-10-04T18:00:00Z',
      LastSeen: '2026-10-04T21:02:00Z',
      LastNotified: '2026-10-04T18:05:00Z',
      Count: 12,
      Acknowledged: false,
      _doc_id: 'yara:9f86d081884c7d65',
    },
    {
      Key: 'pipeline:dead-letters',
      Message: 'Ingest dead letters are accumulating',
      Link: '/dead-letters',
      FirstSeen: '2026-10-03T09:00:00Z',
      LastSeen: '2026-10-04T20:00:00Z',
      LastNotified: null,
      Count: 3,
      Acknowledged: true,
      _doc_id: 'pipeline:dead-letters',
    },
  ],
}

const health: SourceHealthWire = {
  cluster_status: 'yellow',
  total_documents: 1_958_402_117,
  sensors: [
    { sensor: 'cowrie', documents: 151_204_550, last_seen: '2026-10-04T21:02:00Z', state: 'ACTIVE' },
    { sensor: 'conpot-s7-1200', documents: 1_204, last_seen: '2026-10-04T09:00:00Z', state: 'QUIET' },
    { sensor: 'tanner', documents: 12, last_seen: '2026-09-20T09:00:00Z', state: 'STALE' },
  ],
  yara: { enabled: true, last_scan: '2026-10-04T20:00:00Z', rules_sha256: 'a1b2', samples: 480, matched: 6, errors: 0 },
  runtime: { uptime_seconds: 864_000, rss_bytes: 268_435_456, vm_bytes: 1_073_741_824 },
  ingest: { state: 'healthy', last_ingest: '2026-10-04T21:02:00Z', age_seconds: 4, recent_dead_letters: 12 },
  dead_letters: 1_726_478_817,
  pipeline: { state: 'healthy', acked: 1_204, failed: 0, dropped: 0, active: 0, decode_failures: 3 },
  webhook: {
    available: true,
    reason: '',
    state: 'healthy',
    target: 'https://hooks.example.test/apiary',
    messages: 42,
    consecutive_failures: 0,
    failure_threshold: 5,
    last_success: { at: '2026-10-04T21:00:00Z', status: 'delivered', http_code: 200, latency_ms: 84, tries: 1, error: null },
    last_failure: null,
    updated_at: '2026-10-04T21:00:00Z',
  },
  unattributed_24h: 118,
}

const topologyWire: TopologyWire = {
  generated_at: '2026-10-04T21:02:00Z',
  sensors: [
    {
      sensor: 'cowrie',
      stack: 'honeypots',
      containers: ['hp-cowrie'],
      ingress: ['portbridge', 'tunnel-only'],
      hostnames: ['ssh.example.test'],
      ports: [{ proto: 'tcp', public: 2222, host: 22, proxy: true }],
      rawIndex: 'honeypot-v2-cowrie',
    },
    { sensor: 'tanner', stack: 'honeypots', containers: [], ingress: ['traefik'], hostnames: [], ports: [], rawIndex: 'unmapped' },
  ],
  flow: { nodes: [{ name: 'portbridge', layer: 0 }, { name: 'cowrie', layer: 1 }, { name: 'pipeline', layer: 2 }], links: [{ source: 'portbridge', target: 'cowrie' }, { source: 'cowrie', target: 'pipeline' }] },
  stacks: [{ stack: 'honeypots', containers: [{ name: 'hp-cowrie', adapter_visible: true }, { name: 'hp-unlisted', adapter_visible: false }] }],
}

const services: ServicesWire = {
  available: true,
  services: [
    { name: 'hp-cowrie', state: 'running', exit_code: 0, started_at: '2026-10-04T02:00:00Z', restart_count: 0, health: 'healthy' },
    { name: 'hp-unlisted', state: 'not_found', exit_code: null, started_at: null, restart_count: null },
  ],
}

const sensor: Sensor = {
  id: 'cowrie',
  name: 'Cowrie',
  kind: 'SSH',
  what: 'A full SSH and telnet emulation that records every command.',
  ports: [{ proto: 'tcp', port: 22 }],
  protocols: ['ssh'],
  location: 'apiary-1',
  status: 'online',
  eventsLast24h: 18_402,
  lastSeen: '2026-10-04T21:02:00Z',
}

describe('operations adapters', () => {
  describe('alerts', () => {
    it('maps a page to single-member groups keyed by the alert key', () => {
      const groups = alertPage(alerts)
      expect(groups).toHaveLength(2)
      expect(groups[0]).toMatchObject({ id: 'yara:9f86d081884c7d65', kind: 'yara', message: 'yara matched loader_gen on 9f86d081884c7d65', count: 12, acknowledged: false })
      expect(groups[0].members).toHaveLength(1)
      expect(groups[0].members[0]).toMatchObject({ key: 'yara:9f86d081884c7d65', severity: 'info', lastNotified: '2026-10-04T18:05:00Z', link: '/payloads/9f86d081' })
    })

    it('omits lastNotified and link when the document carries neither', () => {
      const [acked] = alertPage({ ...alerts, rows: [{ ...alerts.rows[1], LastNotified: null, Link: '' }] })
      expect(acked.members[0]).not.toHaveProperty('lastNotified')
      expect(acked.members[0]).not.toHaveProperty('link')
    })

    it('a key with no colon is its own kind, and ack flips the flag', () => {
      const [bare] = alertPage({ total: 1, rows: [{ ...alerts.rows[0], Key: 'pipeline', _doc_id: 'pipeline' }] })
      expect(bare.kind).toBe('pipeline')
      expect(alertAckBody(true)).toEqual({ ack: true })
      expect(alertAckBody(false)).toEqual({ ack: false })
    })
  })

  describe('sensors', () => {
    it('reads the catalog as names and counts', () => {
      const catalog = sensorCatalog({ window: 'now-14d', sensors: [{ sensor: 'cowrie', events: 18_402, last_seen: '2026-10-04T21:02:00Z' }] })
      expect(catalog).toEqual([{ sensor: 'cowrie', events: 18_402 }])
    })

    it('maps source-health sensor states onto the four feed states', () => {
      expect(sensorFeeds(health).map((f) => [f.sensor, f.state])).toEqual([
        ['cowrie', 'fresh'],
        ['conpot-s7-1200', 'delayed'],
        ['tanner', 'stale'],
      ])
      expect(sensorState('SOMETHING_NEW')).toBe('silent')
    })

    it('builds a sensor detail from the overview bundle', () => {
      const wire: SensorOverviewWire = {
        sensor: 'cowrie',
        window: 'now-7d',
        events: 12_004,
        unique_sources: 318,
        first_seen: '2026-09-28T09:00:00Z',
        last_seen: '2026-10-04T21:02:00Z',
        hourly: [1, 2, 3],
        top_sources: [{ key: '198.51.100.13', count: 90 }],
        top_countries: [{ key: 'NL', count: 44 }],
        top_lists: [{ label: 'commands issued', rows: [{ key: 'uname -a', count: 12 }] }],
        measures: [{ label: 'session duration', total: 12.5, max: 3.2, unit: 'duration_s' }],
      }
      const detail = sensorOverview(wire, sensor, [])
      expect(detail.sensor).toBe(sensor)
      expect(detail.uniqueSources).toBe(318)
      expect(detail.timeline.map((b) => b.total)).toEqual([1, 2, 3])
      // No bucket timestamps come with the wire series; they are derived backwards from last_seen.
      expect(detail.timeline[2].time).toBe('2026-10-04T21:02:00.000Z')
      expect(detail.topSources[0]).toEqual({ id: '198.51.100.13', label: '198.51.100.13', count: 90 })
      expect(detail.topLists[0].label).toBe('commands issued')
      // duration_s is scaled to the page's ms convention; peak has no per-source answer.
      expect(detail.measures[0]).toEqual({ label: 'session duration', value: 12_500, peak: '3.2 max' })
      expect(detail.byType).toEqual([])
    })

    it('keeps a sensor event as the sensor wrote it', () => {
      const wire: SensorEventsWire = {
        sensor: 'cowrie',
        total: 1,
        rows: [{ id: 'ev_1', when: '2026-10-04T21:02:00Z', src_ip: '203.0.113.42', src_port: 44_512, dst_port: 22, fields: { src_ip: '203.0.113.42', input: 'uname -a', password: 'root' } }],
      }
      const [row] = sensorEvents(wire)
      expect(row).toMatchObject({ id: 'ev_1', sensor: 'cowrie', srcIp: '203.0.113.42', srcPort: 44_512, dstPort: 22 })
      expect(row.fields).toEqual({ src_ip: '203.0.113.42', input: 'uname -a', password: 'root' })
      // No pivots on this endpoint, so there is no type/severity/country to read.
      expect(row).not.toHaveProperty('country')
    })

    it('counts the three curated views and passes their rows through', () => {
      const wire: CuratedSensorsWire = {
        mailoney: [{ session_id: 'm1', when: '2026-10-04T20:00:00Z', ip: '203.0.113.9', port: 25, logged_in: false, user: '', pass: '', mail_from: [], rcpt_to: [], body_size: 12, truncated: false, body_path: '', body_preview: '' }],
        http_requests: [],
        tanner: [],
      }
      const curated = curatedSensors(wire)
      expect(curated.mailoney).toBe(1)
      expect(curated.httpRequests).toBe(0)
      expect(curated.rows).toBe(wire)
    })
  })

  describe('source health', () => {
    it('maps the whole document onto the page type', () => {
      const page = sourceHealth(health)
      expect(page.clusterStatus).toBe('yellow')
      expect(page.indexedDocuments).toBe(1_958_402_117)
      expect(page.ingest.state).toBe('fresh')
      expect(page.yara.rulesSha256).toBe('a1b2')
      expect(page.runtime.uptimeSeconds).toBe(864_000)
      expect(page.pipeline).toEqual({ state: 'running', acked: 1_204, failed: 0, dropped: 0, active: 0, decodeFailures: 3 })
      // The page's dead-letter tile is the 24 h count, which is what recent_dead_letters holds.
      expect(page.deadLetters).toBe(12)
      expect(page.unattributed24h).toBe(118)
      // Everything the wire carries that the page type has no home for.
      expect(page).not.toHaveProperty('webhook')
      expect(page).not.toHaveProperty('dead_letters')
    })

    it('falls back on cluster status and reads pipeline verdicts, including unreachable ES', () => {
      expect(sourceHealth({ ...health, cluster_status: 'unreachable' }).clusterStatus).toBe('yellow')
      expect(sourceHealth({ ...health, cluster_status: 'red' }).clusterStatus).toBe('red')
      expect(pipelineState('disabled')).toBe('stopped')
      expect(pipelineState('unreachable')).toBe('stopped')
      expect(pipelineState('503 Service Unavailable')).toBe('stopped')
      expect(pipelineState('502 Bad Gateway')).toBe('stopped')
      expect(pipelineState('429 Too Many Requests')).toBe('degraded')
      expect(pipelineState('healthy')).toBe('running')
    })

    it('ingest unknown is silent, not stale', () => {
      const page = sourceHealth({ ...health, ingest: { ...health.ingest, state: 'unknown', age_seconds: -1 } })
      expect(page.ingest.state).toBe('silent')
      expect(page.ingest.ageSeconds).toBe(-1)
    })
  })

  describe('topology', () => {
    it('joins the static shape with feeds and services', () => {
      const page = topology(topologyWire, sensorFeeds(health), services)
      expect(page.flow.nodes).toEqual([{ name: 'portbridge' }, { name: 'cowrie' }, { name: 'pipeline' }])
      expect(page.flow.links).toEqual([
        { source: 0, target: 1, value: 1 },
        { source: 1, target: 2, value: 1 },
      ])
      const [cowrie, tanner] = page.sensors
      expect(cowrie).toMatchObject({ sensor: 'cowrie', ingress: ['portbridge'], rawIndex: 'honeypot-v2-cowrie', feed: 'fresh' })
      expect(cowrie.ports).toEqual([{ proto: 'tcp', public: 2222, host: 22 }])
      expect(tanner).toMatchObject({ sensor: 'tanner', ingress: ['traefik'], rawIndex: 'unmapped', feed: 'stale' })
      expect(page.stacks[0].containers).toEqual([
        { name: 'hp-cowrie', state: 'running' },
        { name: 'hp-unlisted', state: 'unknown' },
      ])
    })

    it('an unavailable services adapter means no live state, not stopped', () => {
      const page = topology(topologyWire, [], { available: false, reason: 'services adapter is unavailable', services: [] })
      expect(page.sensors[0].feed).toBe('silent')
      expect(page.stacks[0].containers.map((c) => c.state)).toEqual(['unknown', 'unknown'])
      expect(page.stacks[0].containers[0]).not.toHaveProperty('exitCode')
    })

    it('carries the exit code of an exited container only', () => {
      const page = topology(topologyWire, [], { available: true, services: [{ name: 'hp-cowrie', state: 'exited', exit_code: 137, started_at: null, restart_count: null }] })
      expect(page.stacks[0].containers[0]).toEqual({ name: 'hp-cowrie', state: 'exited', exitCode: 137 })
      expect(page.stacks[0].containers[0]).not.toHaveProperty('exitCode', null)
    })

    it('drops an ingress the page cannot colour and an unknown link endpoint', () => {
      const wire: TopologyWire = {
        ...topologyWire,
        sensors: [{ ...topologyWire.sensors[0], ingress: ['traefik', 'quic-proxy'] }],
        flow: { nodes: [{ name: 'a', layer: 0 }], links: [{ source: 'a', target: 'nowhere' }] },
      }
      expect(topology(wire, [], services).sensors[0].ingress).toEqual(['traefik'])
      expect(topology(wire, [], services).flow.links).toEqual([{ source: 0, target: 0, value: 1 }])
    })
  })

  describe('dead letters', () => {
    it('reads the passthrough row, trying both key spellings', () => {
      const rows = deadLetters({
        total: 2,
        rows: [
          { _doc_id: 'dl-1', '@timestamp': '2026-10-04T20:00:00Z', logset: 'dionaea', error: 'mapper_parsing_exception', document_id: 'x' },
          { _doc_id: 'dl-2', '@timestamp': '2026-10-04T19:00:00Z', pipeline: 'tanner', reason: 'validation_exception' },
        ],
      })
      expect(rows[0]).toMatchObject({ id: 'dl-1', timestamp: '2026-10-04T20:00:00Z', source: 'dionaea', reason: 'mapper_parsing_exception', index: '' })
      expect(rows[0].document).toEqual({ '@timestamp': '2026-10-04T20:00:00Z', logset: 'dionaea', error: 'mapper_parsing_exception', document_id: 'x' })
      expect(rows[1]).toMatchObject({ id: 'dl-2', source: 'tanner', reason: 'validation_exception' })
    })

    it('a row with none of the optional keys degrades rather than throwing', () => {
      const [row] = deadLetters({ total: 1, rows: [{ _doc_id: 'dl-3', note: 'no canonical key' }] })
      expect(row).toMatchObject({ id: 'dl-3', timestamp: '', reason: '', source: '', index: '' })
      expect(row.document).toEqual({ note: 'no canonical key' })
    })

    it('the purge response is a count of documents', () => {
      expect(purgedDeadLetters({ deleted: 4 })).toBe(4)
    })
  })

  describe('problem reports', () => {
    const page: ProblemReportPageWire = {
      total: 1,
      rows: [
        {
          id: 'pr-1',
          submitted_at: '2026-10-04T19:00:00Z',
          submitted_by: 'analyst',
          submitted_by_name: 'Analyst',
          page: '/events?country=CN',
          expected: 'Country filter keeps the sensor filter',
          actual: 'Sensor filter was cleared',
          action_trail: [{ at: '2026-10-04T18:59:50Z', kind: 'filter', detail: 'select country CN' }],
          console_errors: ['TypeError: x'],
          network_failures: ['POST /api/v1/events 502'],
          api_calls: [{ at: '2026-10-04T18:59:55Z', method: 'GET', url: '/api/v1/events?country=[redacted]', status: 200 }],
          user_agent: 'Mozilla/5.0',
          status: 'triaged',
          _doc_id: 'pr-1',
        },
      ],
    }

    it('maps a row, flattening the action trail and rewriting the call path', () => {
      const [row] = problemReportPage(page)
      expect(row).toMatchObject({ id: 'pr-1', submittedBy: 'Analyst', status: 'triaged', hasSnapshot: false })
      expect(row.actionTrail).toEqual(['select country CN'])
      expect(row.apiCalls).toEqual([{ method: 'GET', path: '/api/v1/events?country=[redacted]', status: 200 }])
    })

    it('falls back to submitted_by and reads an unknown status as open', () => {
      const [row] = problemReportPage({ ...page, rows: [{ ...page.rows[0], submitted_by_name: '', status: 'wontfix' }] })
      expect(row.submittedBy).toBe('analyst')
      expect(row.status).toBe('open')
    })

    it('closed is the only terminal state the backend has for fixed/wontfix', () => {
      expect(problemStatusBody('open')).toEqual({ status: 'open' })
      expect(problemStatusBody('triaged')).toEqual({ status: 'triaged' })
      expect(problemStatusBody('fixed')).toEqual({ status: 'closed' })
      expect(problemStatusBody('wontfix')).toEqual({ status: 'closed' })
    })
  })
})