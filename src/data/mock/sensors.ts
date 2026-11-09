// Per-sensor readings: each sensor reports the quantities it exists to
// produce and leaderboards over its own fields, rather than the same five
// for every sensor. Driven by the sensor's spec in #/lib/sensorSpecs, so a sensor
// added there is readable here without another hand-written case.
import type { CountRow, HoneypotEvent, Sensor, SensorMeasure, SensorReading } from '../types'
import { fieldText, readField } from '#/lib/sensorFields'
import { readingOf, specOf } from '#/lib/sensorSpecs'

// The catalog's reading lives in #/lib/sensorSpecs (live code reads it too);
// re-exported here for the mock's existing callers.
export { readingOf }

function countBy(values: string[], limit = 8): CountRow[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v !== '') counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ id: label, label, count }))
}

/** "12 from 198.51.100.7": the busiest single source for a measure. */
function busiestSource(events: HoneypotEvent[]): string {
  const top = countBy(events.map((e) => e.srcIp), 1).at(0)
  return top ? `busiest source: ${top.count} from ${top.label}` : 'busiest source: none'
}

export function sensorReading(sensor: Sensor, events: HoneypotEvent[]): { measures: SensorMeasure[]; topLists: Array<{ label: string; rows: CountRow[] }>; reading: SensorReading } {
  const spec = specOf(sensor.id)
  if (!spec) return { measures: [{ label: 'events', value: events.length, peak: busiestSource(events) }], topLists: [], reading: { what: sensor.what, columns: [], artefacts: [] } }
  return {
    measures: spec.measures.map((m) => {
      const matched = events.filter((e) => m.match(e.fields, e.type))
      return { label: m.label, value: matched.length, peak: busiestSource(matched) }
    }),
    topLists: spec.tops.map((t) => ({ label: t.label, rows: countBy(events.map((e) => fieldText(readField(e.fields, t.field)))) })).filter((t) => t.rows.length > 0),
    reading: readingOf(sensor.id),
  }
}

