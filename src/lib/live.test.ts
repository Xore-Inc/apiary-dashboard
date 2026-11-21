// The edge-triggered conditions the operational toasts are built on, over
// source-health readings written out as literals: a healthy fleet, an
// incident, its escalation and its recovery.
import { describe, expect, it } from 'vitest'
import type { FeedState, SourceHealth } from '#/data/types'
import { conditionsFrom, transitions } from './healthConditions'

const reading = ({ cowrie = 'fresh', ingest = 'fresh' }: { cowrie?: FeedState; ingest?: FeedState } = {}): SourceHealth => ({
  clusterStatus: 'yellow',
  indexedDocuments: 1_000_000,
  feeds: [
    { sensor: 'cowrie', state: cowrie, documents: 500, lastSeen: '2026-11-15T11:00:00Z' },
    { sensor: 'dionaea', state: 'fresh', documents: 300, lastSeen: '2026-11-15T11:00:00Z' },
  ],
  ingest: { state: ingest, lastIngest: '2026-11-15T11:00:00Z', ageSeconds: 5, recentDeadLetters: 0 },
  yara: { enabled: true, lastScan: '2026-11-15T10:00:00Z', rulesSha256: '0'.repeat(64), samples: 10, matched: 1, errors: 0 },
  runtime: { uptimeSeconds: 3600, rssBytes: 1, vmBytes: 1 },
  pipeline: { state: 'running', acked: 1, failed: 0, dropped: 0, active: 1, decodeFailures: 0 },
  deadLetters: 0,
  unattributed24h: 0,
  modbusPdus: 0,
})

describe('operational conditions', () => {
  it('a healthy baseline raises nothing; an incident raises, recovery clears', () => {
    const baseline = conditionsFrom(reading())
    const known = new Map(baseline.map((c) => [c.key, c]))
    expect(transitions(known, baseline)).toEqual({ raised: [], cleared: [] })

    const during = conditionsFrom(reading({ cowrie: 'silent', ingest: 'delayed' }))
    expect(transitions(known, during).raised.map((c) => c.key)).toEqual(expect.arrayContaining(['sensor:cowrie', 'ingest']))

    // Behind → stalled is news again; still-stalled is not.
    const duringMap = new Map(during.map((c) => [c.key, c]))
    const stalled = conditionsFrom(reading({ cowrie: 'silent', ingest: 'stale' }))
    expect(transitions(duringMap, stalled).raised.map((c) => c.key)).toEqual(['ingest'])
    expect(transitions(new Map(stalled.map((c) => [c.key, c])), stalled).raised).toEqual([])

    const after = conditionsFrom(reading())
    expect(transitions(new Map(stalled.map((c) => [c.key, c])), after).cleared.map((c) => c.key).sort()).toEqual(['ingest', 'sensor:cowrie'])
  })
})
