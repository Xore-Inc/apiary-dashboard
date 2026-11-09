import { describe, expect, it } from 'vitest'
import type { TimeBucket } from '#/data/types'
import { timelineAxis, toRows } from './charts'

const hourly = (totals: number[], byProtocol: Record<string, number> = {}): TimeBucket[] =>
  totals.map((total, i) => ({ time: new Date(Date.UTC(2026, 10, 2, 0) + i * 3600_000).toISOString(), total, byProtocol }))

const SERIES = [
  { key: 'ssh', label: 'SSH', color: 'blue' },
  { key: 'other', label: 'Other', color: 'gray' },
]

describe('toRows', () => {
  // #286: the sensor overview carries a count per hour and no protocol split.
  it('draws a bucket that has a total and no split as "other", not as an empty bar', () => {
    const rows = toRows(hourly([40_000, 52_000]), SERIES)
    expect(rows.map((r) => r.other)).toEqual([40_000, 52_000])
  })

  it('keeps a protocol split and adds only the part no protocol claims', () => {
    const [row] = toRows([{ time: '2026-11-02T00:00:00Z', total: 100, byProtocol: { ssh: 60, rdp: 10 } }], SERIES)
    expect(row).toMatchObject({ ssh: 60, other: 40 })
  })

  it('does not invent a remainder when the split already adds up', () => {
    const [row] = toRows([{ time: '2026-11-02T00:00:00Z', total: 70, byProtocol: { ssh: 60, rdp: 10 } }], SERIES)
    expect(row.other).toBe(10)
  })
})

describe('timelineAxis', () => {
  it('labels a day of hourly buckets with clock times, every fourth hour', () => {
    expect(timelineAxis(hourly(Array(24).fill(1)))).toMatchObject({ interval: 3 })
  })

  // #286: 168 hourly buckets were labelled every 4 h, about 40 labels.
  it('labels a week with dates and a handful of ticks, not one every four hours', () => {
    const axis = timelineAxis(hourly(Array(168).fill(1)))
    expect(Math.ceil(168 / (axis.interval + 1))).toBeLessThanOrEqual(9)
    expect(axis.label('2026-11-02T00:00:00Z')).not.toMatch(/\d\d:\d\d/)
  })
})
