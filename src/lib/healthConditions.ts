// What is operationally wrong, read from source health, and what changed
// between two readings: the logic behind the operational toasts.
import type { SourceHealth } from '#/data/types'

export type Severity = 'warning' | 'danger' | 'success'
export type Condition = { key: string; message: string; severity: Severity; to: string }

/** What is wrong right now, according to source health. */
export function conditionsFrom(health: SourceHealth | null | undefined): Condition[] {
  const conditions: Condition[] = []
  // A failed or partial reading (an upstream 502/503, a body the wire
  // changed) says nothing about the fleet: no conditions, rather than a
  // crash of the whole shell (2026-10-31 production check, dash#237). Typed
  // loosely on purpose: the wire can deliver less than the type promises.
  const reading = health as Partial<SourceHealth> | null | undefined
  if (!reading || !Array.isArray(reading.feeds) || !reading.ingest || !reading.pipeline) return conditions
  const h = reading as SourceHealth
  for (const feed of h.feeds) {
    if (feed.state === 'silent') conditions.push({ key: `sensor:${feed.sensor}`, message: `${feed.sensor} stopped reporting`, severity: 'warning', to: '/source-health' })
  }
  if (h.ingest.state === 'stale' || h.ingest.state === 'silent') conditions.push({ key: 'ingest', message: 'Ingestion has stalled: no new events are being indexed', severity: 'danger', to: '/source-health' })
  else if (h.ingest.state === 'delayed') conditions.push({ key: 'ingest', message: 'Ingestion is falling behind', severity: 'warning', to: '/source-health' })
  // Red only: yellow is the steady state of a single-node cluster.
  if (h.clusterStatus === 'red') conditions.push({ key: 'cluster', message: 'Elasticsearch cluster is red: shards are unavailable', severity: 'danger', to: '/source-health' })
  if (h.pipeline.state === 'stopped') conditions.push({ key: 'pipeline', message: 'Filebeat is unreachable', severity: 'danger', to: '/source-health' })
  if (h.deadLetters > 0) conditions.push({ key: 'dead-letters', message: `${h.deadLetters} documents rejected by Elasticsearch`, severity: 'warning', to: '/dead-letters' })
  return conditions
}

/** What changed between two observations. A condition that changes
 * severity (behind → stalled) is news again; one that persists is not. A
 * count that only grows (dead letters) keeps its key and stays quiet. */
export function transitions(previous: ReadonlyMap<string, Condition>, current: Condition[]): { raised: Condition[]; cleared: Condition[] } {
  const now = new Map(current.map((c) => [c.key, c]))
  return {
    raised: current.filter((c) => previous.get(c.key)?.severity !== c.severity),
    cleared: [...previous.values()].filter((c) => !now.has(c.key)),
  }
}
