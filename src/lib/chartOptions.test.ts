import { describe, expect, it } from 'vitest'
import type { TimeBucket } from '#/data/types'
import {
  campaignTimelineOption,
  coverageOption,
  histogramOption,
  logStep,
  radarOption,
  rankBarsOption,
  sankeyGap,
  sankeyOption,
  sensorHeatmapOption,
  seriesFor,
  seriesLinesOption,
  timelineAxis,
  timelineOption,
  toRows,
  yAxisLabel,
  yAxisWidth,
} from './chartOptions'
import { echartsTheme, escapeHtml } from './chartTheme'
import type { ChartTheme } from './chartTheme'

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

// #288: the weekly chart's tick labels (20000, 25000) were cut at the left edge.
describe('y axis', () => {
  it('abbreviates large tick values', () => {
    expect(yAxisLabel(0)).toBe('0')
    expect(yAxisLabel(25_000)).toBe('25K')
    expect(yAxisLabel(1_500_000)).toBe('1.5M')
  })

  it('makes room for the widest label the scale can print', () => {
    const wide = yAxisWidth(hourly([9_000, 31_000]))
    const narrow = yAxisWidth(hourly([3, 8]))
    expect(wide).toBeGreaterThan(narrow)
    // "38.8K" at 12 px does not fit the old fixed 36 px.
    expect(wide).toBeGreaterThan(36)
  })
})

// ---- ECharts options (dash#305) ---------------------------------------------

/** A theme whose resolver tags each token, so a test can see which one a
 * chart asked for. */
const T: ChartTheme = { c: (css) => `<${css}>`, fontFamily: 'Figtree', animate: true }
 
type Any = any
const opt = (o: unknown) => o as Any

describe('theme', () => {
  it('resolves every colour through the theme tokens, never a literal', () => {
    const theme = echartsTheme(T)
    expect(theme.tooltip.backgroundColor).toBe('<var(--color-background-card)>')
    expect(theme.valueAxis.axisLabel.color).toBe('<var(--color-text-secondary)>')
    expect(theme.color[0]).toBe('<var(--color-data-categorical-blue)>')
    expect(theme.textStyle.fontFamily).toBe('Figtree')
  })

  it('escapes data before it reaches a tooltip, which ECharts renders as HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&#60;img src=x onerror=alert(1)&#62;')
    const rows = [{ id: 'a', label: '<script>x</script>', count: 3 }]
    const html = opt(rankBarsOption(rows, T)).tooltip.formatter({ dataIndex: 0 })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&#60;script&#62;')
  })
})

describe('protocol timeline', () => {
  it('stacks one bar series per protocol on the shared rows, top one rounded', () => {
    const o = opt(timelineOption(hourly([100, 50], { ssh: 60, telnet: 10 }), T))
    expect(o.series.every((s: Any) => s.type === 'bar' && s.stack === 'protocol')).toBe(true)
    expect(o.series.find((s: Any) => s.name === 'SSH').data).toEqual([60, 60])
    expect(o.series.find((s: Any) => s.name === 'Other').data).toEqual([30, 0])
    expect(o.series.at(-1).itemStyle.borderRadius).toEqual([4, 4, 0, 0])
    expect(o.grid.left).toBe(yAxisWidth(hourly([100, 50])))
  })

  it('totals the hovered hour in its tooltip, biggest layer last', () => {
    const o = opt(timelineOption(hourly([100]), T))
    const html = o.tooltip.formatter([
      { seriesName: 'SSH', value: 60, color: 'blue', axisValue: '2026-11-02T00:00:00Z', dataIndex: 0 },
      { seriesName: 'Other', value: 40, color: 'gray', axisValue: '2026-11-02T00:00:00Z', dataIndex: 0 },
    ])
    expect(html).toContain('100 events')
    expect(html.indexOf('Other')).toBeLessThan(html.indexOf('SSH'))
  })

  it('names a sensor’s own protocols when the fixed five miss most of its traffic', () => {
    expect(seriesFor(hourly([100], { modbus: 90, ssh: 10 })).map((s) => s.key)).toEqual(['modbus', 'ssh', 'other'])
  })
})

describe('sankey', () => {
  const fan = (sinks: number) => ({
    nodes: [{ name: 'traefik' }, ...Array.from({ length: sinks }, (_, i) => ({ name: `sensor-${i}` }))],
    links: Array.from({ length: sinks }, (_, i) => ({ source: 0, target: i + 1, value: 1 })),
  })

  it('keeps 14 px between few stages and shrinks the gap so 30 sensors keep half the height for bars', () => {
    expect(sankeyGap(6, 388)).toBe(14)
    const gap = sankeyGap(31, 448)
    expect(gap * 30).toBeLessThanOrEqual(224)
    expect(gap).toBeGreaterThan(0)
  })

  it('links by index and ids each node, so two stages may share a name', () => {
    const o = opt(sankeyOption({ nodes: [{ name: 'a' }, { name: 'a' }], links: [{ source: 0, target: 1, value: 5 }] }, 420, T))
    const s = o.series[0]
    expect(s.data.map((n: Any) => n.id)).toEqual(['0', '1'])
    expect(s.links).toEqual([{ source: 0, target: 1, value: 5 }])
  })

  it('drags nodes, lights adjacent links on hover and hides labels that overlap', () => {
    const s = opt(sankeyOption(fan(3), 420, T)).series[0]
    expect(s.draggable).toBe(true)
    expect(s.data.every((n: Any) => n.draggable)).toBe(true)
    expect(s.emphasis.focus).toBe('adjacency')
    expect(s.labelLayout).toEqual({ hideOverlap: true })
  })

  it('labels every stage rightwards and keeps a gutter for the last column’s labels', () => {
    const s = opt(sankeyOption(fan(2), 420, T)).series[0]
    expect(s.data.every((n: Any) => n.label === undefined)).toBe(true)
    // "sensor-0 · 1" at 12 px needs more than the 8 px edge.
    expect(s.right).toBeGreaterThan(60)
    expect(s.label.formatter({ name: 'traefik', value: 2 })).toBe('traefik · 2')
  })

  it('names both ends of a hovered link', () => {
    const o = opt(sankeyOption(fan(1), 420, T))
    expect(o.tooltip.formatter({ dataType: 'edge', value: 7, data: { source: 0, target: 1 } })).toBe('traefik → sensor-0: 7')
  })
})

describe('campaign timeline', () => {
  const rows = [
    { cidr: '198.51.100.0/24', first: '2026-11-01T00:00:00Z', last: '2026-11-03T00:00:00Z', events: 12 },
    { cidr: '203.0.113.0/24', first: '2026-11-02T00:00:00Z', last: '2026-11-02T00:00:00Z', events: 3 },
  ]

  it('draws one bar per campaign from first to last activity on a time axis', () => {
    const o = opt(campaignTimelineOption(rows, T))
    expect(o.yAxis.data).toEqual(['198.51.100.0/24', '203.0.113.0/24'])
    expect(o.series[0].data[0]).toEqual([0, Date.parse(rows[0].first), Date.parse(rows[0].last), 12])
    expect(o.xAxis.type).toBe('time')
  })

  it('draws a single-instant campaign as a visible bar', () => {
    const o = opt(campaignTimelineOption(rows, T))
    const api = { value: (i: number) => o.series[0].data[1][i], coord: ([x]: number[]) => [x / 1e9, 50], size: () => [0, 20] }
    const shape = o.series[0].renderItem({ coordSys: { x: 0, width: 1e9 } }, api).shape
    expect(shape.width).toBeGreaterThanOrEqual(4)
  })
})

describe('heatmaps', () => {
  it('steps counts on a log scale so one loud cell does not wash out the rest', () => {
    expect(logStep(0, 1000)).toBe(0)
    expect(logStep(1000, 1000)).toBe(4)
    expect(logStep(30, 1000)).toBeGreaterThan(1)
  })

  it('stacks each tactic’s techniques in its column and keeps the real count for the tooltip', () => {
    const cells = [
      { tactic: 'Execution', technique: 'T1059', name: 'Command and Scripting Interpreter', events: 40 },
      { tactic: 'Discovery', technique: 'T1082', name: 'System Information Discovery', events: 2 },
      { tactic: 'Execution', technique: 'T1204', name: 'User Execution', events: 1 },
    ]
    const o = opt(coverageOption(['Execution', 'Discovery'], cells, 120, T))
    expect(o.series[0].data.map((d: Any) => d.value.slice(0, 2))).toEqual([[0, 0], [0, 1], [1, 0]])
    expect(o.tooltip.formatter({ data: o.series[0].data[0] })).toBe('T1059 Command and Scripting Interpreter: 40 events')
    // Truncated to the cell, with the full name in the tooltip.
    expect(o.series[0].data[0].name.endsWith('…')).toBe(true)
  })

  it('mutes empty hours and opens a sensor from its row', () => {
    const o = opt(sensorHeatmapOption([{ sensor: 'cowrie', cells: [0, 5, ...Array(22).fill(1)] }], '2026-11-02T00:00:00Z', T))
    expect(o.series[0].data[0]).toEqual([0, 0, 0, 0])
    expect(o.series[0].data[1][2]).toBeGreaterThan(0)
    expect(o.visualMap.pieces[0]).toEqual({ value: 0, color: '<var(--color-background-muted)>' })
    expect(o.yAxis.data).toEqual(['cowrie'])
  })
})

describe('bars, lines, radar', () => {
  it('ranks largest first with the count printed at the bar end', () => {
    const o = opt(rankBarsOption([{ id: 'a', label: 'a', count: 9 }, { id: 'b', label: 'b', count: 3 }], T))
    expect(o.yAxis.inverse).toBe(true)
    expect(o.series[0].label.formatter({ value: 1234 })).toBe('1,234')
  })

  it('draws a histogram of the buckets in their order', () => {
    expect(opt(histogramOption([{ id: '1', label: '<1s', count: 4 }, { id: '2', label: '1-10s', count: 2 }], T)).xAxis.data).toEqual(['<1s', '1-10s'])
  })

  it('leaves gaps where a series has no value and formats the axis with the caller’s formatter', () => {
    const o = opt(seriesLinesOption([{ time: '2026-11-02T00:00:00Z', bytes: 2048 }, { time: '2026-11-02T01:00:00Z' }], [{ key: 'bytes', label: 'Bytes' }], (v) => `${v} B`, true, T))
    expect(o.series[0].data).toEqual([2048, null])
    expect(o.yAxis.axisLabel.formatter(5)).toBe('5 B')
  })

  it('scales the radar to the largest shared count', () => {
    const o = opt(radarOption(['ssh', 'tls'], [3, 7], T))
    expect(o.radar.indicator).toEqual([{ name: 'ssh', max: 7 }, { name: 'tls', max: 7 }])
  })
})
