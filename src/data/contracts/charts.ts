// The chart payloads the Rust tier serves at /api/v1/charts/{name} and the
// topology slice at /api/v1/topology (backend-service charts.rs,
// kill_chain.rs, fusion.rs, topology.rs), as they arrive on the wire. The
// dashboard passes them through /api/chart/{name} and /api/topology/flow
// unchanged.

export interface Point {
  time: string
  value: number
}

export interface Series {
  name: string
  points: Point[]
}

export interface Bar {
  categories: string[]
  values: number[]
}

export interface PiePoint {
  name: string
  value: number
}

export interface SankeyData {
  nodes: Array<{ name: string }>
  links: Array<{ source: string; target: string; value: number }>
}

export interface AttckGrid {
  tactics: string[]
  techniques: string[]
  cells: Array<{ tactic_idx: number; technique_idx: number; count: number }>
}

export interface TimelineRow {
  cidr: string
  start_ms: number
  end_ms: number
  score: number
  events: number
}

export interface Fusion {
  categories: string[]
  values: number[]
  ips: string[]
}

export interface FlowGraph {
  nodes: Array<{ name: string; layer: number }>
  links: Array<{ source: string; target: string }>
}

/** Every chart the proxy lets through, with its wire shape. The browser can
 * reach no other path under /api/v1/charts. */
export interface Charts {
  'kill-chain-sankey': SankeyData
  'attck-coverage': AttckGrid
  'campaign-timeline': TimelineRow[]
  'ml-backlog': Series[]
  'netflow-bytes': Series[]
  'netflow-packets': Series[]
  'anomaly-trend': Series[]
  'dionaea-cves': Bar
  'os-distribution': PiePoint[]
  'tcp-stack-clusters': PiePoint[]
  'ics-functions': Bar
  'decoy-requests': Bar
  'decoy-client-fingerprints': Bar
  'ja4h-fingerprints': Bar
  'ja4x-fingerprints': Bar
  'ja4l-fingerprints': Bar
  'tls-fingerprints': Bar
  'ssh-fingerprints': Bar
  'endlessh-held-histogram': Bar
  'ml-anomaly-scores': Series[]
  /** Takes `?id=` (an attacker identity). */
  'attacker-fusion': Fusion
}

export type ChartName = keyof Charts

export const CHART_NAMES: readonly ChartName[] = [
  'kill-chain-sankey',
  'attck-coverage',
  'campaign-timeline',
  'ml-backlog',
  'netflow-bytes',
  'netflow-packets',
  'anomaly-trend',
  'dionaea-cves',
  'os-distribution',
  'tcp-stack-clusters',
  'ics-functions',
  'decoy-requests',
  'decoy-client-fingerprints',
  'ja4h-fingerprints',
  'ja4x-fingerprints',
  'ja4l-fingerprints',
  'tls-fingerprints',
  'ssh-fingerprints',
  'endlessh-held-histogram',
  'ml-anomaly-scores',
  'attacker-fusion',
]

export const isChartName = (name: string): name is ChartName => (CHART_NAMES as readonly string[]).includes(name)
