// The lines of the protocol-conformance chart: one per app protocol the
// points carry, busiest first. charts.rs `anomaly_trend` names a series by
// Suricata's `app_proto`, and buckets events with none as `(none)`.
import type { SeriesPoint } from '#/data/types'

const LABELS: Record<string, string> = { '(none)': 'No app protocol', http: 'HTTP', smb: 'SMB', sip: 'SIP', tls: 'TLS', dns: 'DNS', ftp: 'FTP', smtp: 'SMTP', ssh: 'SSH' }

/** At most this many lines; the chart has room for a handful. */
const MAX_LINES = 6

export function conformanceSeries(points: SeriesPoint[]): Array<{ key: string; label: string }> {
  const totals = new Map<string, number>()
  for (const point of points) {
    for (const [key, value] of Object.entries(point)) {
      if (key === 'time' || typeof value !== 'number') continue
      totals.set(key, (totals.get(key) ?? 0) + value)
    }
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LINES)
    .map(([key]) => ({ key, label: LABELS[key] ?? key.toUpperCase() }))
}
