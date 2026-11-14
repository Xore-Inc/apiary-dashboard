// The ECharts option for each chart the dashboard draws (dash#305). Pure:
// data and a resolved ChartTheme in, an option out, so each chart's
// behaviour (series, axes, tooltips, what a click opens) is tested without a
// canvas. components/charts.tsx wraps each in an <EChart>.
import type { EChartsOption } from 'echarts'
import type { CountRow, HeatmapRow, KillChainData, SeriesPoint, TimeBucket } from '#/data/types'
import { formatCompact, formatDateTime, formatDay, formatNumber, formatTime } from '#/lib/format'
import { DATA_INK, PALETTE, TOKENS, escapeHtml, inkShade, swatch } from './chartTheme'
import type { ChartTheme } from './chartTheme'

// ---- Shared ------------------------------------------------------------------

// Colors follow the protocol, never its rank, so filtering never repaints a
// series. Order (blue, orange, teal, purple, pink) is validated with the
// dataviz palette checker on both surfaces; the theme sets separate dark
// values (#14). Everything else folds into gray "Other".
//
// A chart whose traffic is mostly outside those five (one Conpot device, the
// SIP or DNS sensor) would be a single gray bar, so it names its own top
// protocols instead, in the same palette order. Such a chart shows one
// sensor, so filtering it never repaints a series either.
export type Series = { key: string; label: string; color: string }

export const OTHER: Series = { key: 'other', label: 'Other', color: TOKENS.textSecondary }

export const SERIES: Series[] = [
  { key: 'ssh', label: 'SSH', color: PALETTE[0] },
  { key: 'telnet', label: 'Telnet', color: PALETTE[1] },
  { key: 'http', label: 'HTTP', color: PALETTE[2] },
  { key: 'smb', label: 'SMB', color: PALETTE[3] },
  { key: 'rdp', label: 'RDP', color: PALETTE[4] },
  OTHER,
]

/** First slots of the validated categorical order; lines never exceed three. */
export const LINE_COLORS = PALETTE.slice(0, 3)

/** The tooltip every chart shares: kept inside the chart's box, so it never
 * runs off a narrow panel. */
const tooltip = (t: ChartTheme, extra: Record<string, unknown>) => ({
  confine: true,
  transitionDuration: t.animate ? 0.2 : 0,
  ...extra,
})

type AxisParam = { seriesName?: string; value?: unknown; color?: unknown; axisValue?: string; dataIndex: number; name?: string }

// ---- Protocol timeline --------------------------------------------------------

/** The fixed series, or this chart's own top protocols when those cover
 * less than half of its events. */
export function seriesFor(buckets: TimeBucket[]): Series[] {
  const totals = new Map<string, number>()
  for (const bucket of buckets) for (const [protocol, count] of Object.entries(bucket.byProtocol)) totals.set(protocol, (totals.get(protocol) ?? 0) + count)
  const all = [...totals.values()].reduce((a, b) => a + b, 0)
  const named = SERIES.reduce((sum, s) => sum + (totals.get(s.key) ?? 0), 0)
  if (all === 0 || named * 2 >= all) return SERIES
  const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, PALETTE.length)
  return [...top.map(([key], i) => ({ key, label: key.length <= 4 ? key.toUpperCase() : key, color: PALETTE[i] })), OTHER]
}

export type TimelineRow = { time: string } & Record<string, number | string>

/** The rows the stacked bars draw. A bucket's `total` is the truth; its
 * protocol split may be partial or absent (the sensor overview carries only
 * a count per hour), and the part no protocol claims is drawn as "other", so
 * a bucket with a total and no split is a bar, not an empty slot (#286). */
export function toRows(buckets: TimeBucket[], series: Series[]): TimelineRow[] {
  const named = new Set(series.map((s) => s.key))
  return buckets.map((bucket) => {
    const row: TimelineRow = { time: bucket.time, other: 0 }
    let split = 0
    for (const [protocol, count] of Object.entries(bucket.byProtocol)) {
      split += count
      if (protocol !== 'other' && named.has(protocol)) row[protocol] = count
      else row.other = (row.other as number) + count
    }
    row.other = (row.other as number) + Math.max(0, bucket.total - split)
    return row
  })
}

const HOUR = 3600_000

/** How the x-axis labels a run of hourly buckets: clock times for a day or
 * less, every fourth hour; dates for a longer window, about eight labels
 * across it, never one per bucket. */
export function timelineAxis(buckets: TimeBucket[]): { interval: number; label: (iso: string) => string } {
  const hours = buckets.length > 1 ? (Date.parse(buckets[buckets.length - 1].time) - Date.parse(buckets[0].time)) / HOUR + 1 : buckets.length
  if (hours <= 36) return { interval: 3, label: (iso) => formatTime(iso).slice(0, 5) }
  return { interval: Math.max(0, Math.ceil(buckets.length / 8) - 1), label: formatDay }
}

/** The legend's series: those a bar uses, so a chart of unsplit counts
 * shows one entry, not five empty ones. */
export const drawn = (series: Series[], rows: TimelineRow[]) => series.filter((s) => rows.some((r) => Number(r[s.key] ?? 0) > 0))

/** A y-axis tick as short text: 25000 reads "25K". */
export const yAxisLabel = (value: number): string => formatCompact(value)

const TICK_FONT = 12

/** The y axis's width: the widest label the scale can print, at the tick font,
 * plus padding. The stacked total's scale rounds up past the tallest bar, so
 * one more digit than the tallest bar's is allowed for (#288: the fixed 36 px
 * cut "20000" to "0000"). */
export function yAxisWidth(buckets: TimeBucket[]): number {
  const tallest = Math.max(0, ...buckets.map((b) => b.total))
  const chars = yAxisLabel(tallest * 1.25).length
  return Math.max(36, Math.ceil(chars * TICK_FONT * 0.62) + 12)
}

/** Hourly events stacked by protocol. */
export function timelineOption(buckets: TimeBucket[], t: ChartTheme): EChartsOption {
  const series = seriesFor(buckets)
  const rows = toRows(buckets, series)
  const axis = timelineAxis(buckets)
  return {
    grid: { top: 8, right: 4, bottom: 24, left: yAxisWidth(buckets) },
    tooltip: tooltip(t, {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: t.c(TOKENS.muted), opacity: 0.6 } },
      formatter: (params: AxisParam[]) => {
        const items = params.filter((p) => Number(p.value) > 0)
        const total = params.reduce((sum, p) => sum + (Number(p.value) || 0), 0)
        const head = `${escapeHtml(formatTime(params[0]?.axisValue ?? ''))} · ${formatNumber(total)} events`
        return [head, ...[...items].reverse().map((p) => `${swatch(String(p.color))}${escapeHtml(p.seriesName)}: ${formatNumber(Number(p.value))}`)].join('<br/>')
      },
    }),
    xAxis: { type: 'category', data: rows.map((r) => r.time), axisLabel: { interval: axis.interval, formatter: axis.label } },
    yAxis: { type: 'value', axisLabel: { formatter: yAxisLabel } },
    series: series.map((s, index) => ({
      type: 'bar',
      name: s.label,
      stack: 'protocol',
      barCategoryGap: 2,
      data: rows.map((r) => Number(r[s.key] ?? 0)),
      itemStyle: { color: t.c(s.color), borderColor: t.c(TOKENS.card), borderWidth: 1, borderRadius: index === series.length - 1 ? [4, 4, 0, 0] : 0 },
      emphasis: { disabled: true },
    })),
  }
}

// ---- Lines -------------------------------------------------------------------

/** A KPI tile's trend: one line, no axes, nothing to hover. */
export function sparklineOption(data: number[], t: ChartTheme): EChartsOption {
  return {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{ type: 'line', data, smooth: true, showSymbol: false, silent: true, lineStyle: { width: 2, color: t.c(DATA_INK) }, itemStyle: { color: t.c(DATA_INK) } }],
  }
}

export type LineSeries = { key: string; label: string }

function linesTooltip(t: ChartTheme, head: (axisValue: string) => string, value: (v: number) => string) {
  return tooltip(t, {
    trigger: 'axis',
    axisPointer: { type: 'line', lineStyle: { color: t.c(TOKENS.border) } },
    formatter: (params: AxisParam[]) =>
      [
        escapeHtml(head(params[0]?.axisValue ?? '')),
        ...params.filter((p) => p.value != null).map((p) => `${swatch(String(p.color))}${escapeHtml(p.seriesName)}: ${escapeHtml(value(Number(p.value)))}`),
      ].join('<br/>'),
  })
}

const lineSeries = <T extends { time: string }>(data: T[], series: LineSeries[], t: ChartTheme) =>
  series.map((s, index) => ({
    type: 'line' as const,
    name: s.label,
    data: data.map((row) => {
      const v = (row as Record<string, unknown>)[s.key]
      return typeof v === 'number' ? v : null
    }),
    smooth: true,
    showSymbol: false,
    symbolSize: 8,
    lineStyle: { width: 2, color: t.c(LINE_COLORS[index]) },
    itemStyle: { color: t.c(LINE_COLORS[index]), borderColor: t.c(TOKENS.card), borderWidth: 2 },
  }))

/** Up to three series over hourly time buckets on one shared 0–1 axis. */
export function timeLinesOption<T extends { time: string }>(data: T[], series: LineSeries[], domain: [number, number], t: ChartTheme): EChartsOption {
  return {
    grid: { top: 8, right: 8, bottom: 24, left: 36 },
    tooltip: linesTooltip(t, formatTime, (v) => v.toFixed(2)),
    xAxis: { type: 'category', boundaryGap: false, data: data.map((d) => d.time), axisLabel: { interval: 3, formatter: (v: string) => formatTime(v).slice(0, 5) } },
    yAxis: { type: 'value', min: domain[0], max: domain[1] },
    series: lineSeries(data, series, t),
  }
}

/** Up to three series over time with an auto-scaled axis and a value
 * formatter; labels that would overlap are left out. */
export function seriesLinesOption(data: SeriesPoint[], series: LineSeries[], format: (v: number) => string, dayTicks: boolean, t: ChartTheme): EChartsOption {
  return {
    grid: { top: 8, right: 8, bottom: 24, left: 72 },
    tooltip: linesTooltip(t, formatDateTime, format),
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((d) => d.time),
      axisLabel: { hideOverlap: true, formatter: (v: string) => (dayTicks ? formatDay(v) : formatTime(v).slice(0, 5)) },
    },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => format(v) } },
    series: lineSeries(data, series, t),
  }
}

// ---- Flow --------------------------------------------------------------------

/** The gap between a Sankey's nodes: 14 px, shrunk so even a column holding
 * every node keeps at least half the height for its bars. ECharts, like
 * Recharts before it, lays a column out as `height - (n - 1) * gap`, so a
 * fixed gap drew negative heights for the topology's ~30 sensors. */
export function sankeyGap(nodes: number, innerHeight: number): number {
  if (nodes <= 1) return 14
  return Math.max(0, Math.min(14, Math.floor((innerHeight * 0.5) / (nodes - 1))))
}

/** Left-to-right flow between named stages (kill-chain tactics, pipeline
 * components). Nodes drag; hovering one lights its links; dense columns hide
 * the labels that would overlap (the tooltip still names them). */
/** A stage's size as the layout draws it: the larger of what flows in and
 * what flows out. */
export function nodeValue(flow: KillChainData['flow'], i: number): number {
  let inflow = 0
  let outflow = 0
  for (const l of flow.links) {
    if (l.target === i) inflow += l.value
    if (l.source === i) outflow += l.value
  }
  return Math.max(inflow, outflow)
}

export function sankeyOption(flow: KillChainData['flow'], height: number, t: ChartTheme): EChartsOption {
  const outgoing = new Set(flow.links.map((l) => l.source))
  const ink = t.c(DATA_INK)
  const names = flow.nodes.map((n) => n.name)
  const label = (i: number) => `${names[i]} · ${formatNumber(nodeValue(flow, i))}`
  // Every label reads rightwards, so the last column's need a gutter of
  // their own instead of printing over the column before.
  const sinks = flow.nodes.map((_, i) => i).filter((i) => !outgoing.has(i))
  const gutter = Math.min(240, Math.max(8, ...sinks.map((i) => Math.ceil(label(i).length * 6.6) + 12)))
  return {
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: (p: { dataType?: string; name?: string; value?: number; data?: { source?: number; target?: number } }) =>
        p.dataType === 'edge'
          ? `${escapeHtml(names[p.data?.source ?? -1])} → ${escapeHtml(names[p.data?.target ?? -1])}: ${formatNumber(Number(p.value))}`
          : `${escapeHtml(p.name)}: ${formatNumber(Number(p.value))}`,
    }),
    series: [
      {
        type: 'sankey',
        left: 8,
        right: gutter,
        top: 16,
        bottom: 16,
        nodeWidth: 12,
        nodeGap: sankeyGap(flow.nodes.length, height - 32),
        draggable: true,
        // Drag on empty canvas pans; the zoom buttons own the scale.
        roam: 'move',
        layoutIterations: 32,
        emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.55 } },
        // Ids, not names: two stages may share a name.
        data: flow.nodes.map((node, i) => ({
          id: String(i),
          name: node.name,
          draggable: true,
        })),
        links: flow.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
        itemStyle: { color: ink, borderWidth: 0, borderRadius: 2 },
        lineStyle: { color: ink, opacity: 0.25, curveness: 0.5 },
        label: {
          color: t.c(TOKENS.text),
          fontSize: 12,
          formatter: (p: { name: string; value: unknown }) => `${p.name} · ${formatNumber(Number(p.value))}`,
        },
        labelLayout: { hideOverlap: true },
      },
    ],
  }
}

// ---- Campaign timeline ------------------------------------------------------

/** Each campaign as a bar from first to last observed activity; a click opens
 * the campaign. */
export function campaignTimelineOption(rows: KillChainData['timeline'], t: ChartTheme): EChartsOption {
  const spans = rows.map((r) => [Date.parse(r.first), Date.parse(r.last)])
  const min = Math.min(...spans.map((s) => s[0]))
  const max = Math.max(...spans.map((s) => s[1]))
  const ink = t.c(DATA_INK)
  return {
    grid: { top: 4, right: 12, bottom: 24, left: 140 },
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => {
        const row = rows[p.dataIndex]
        return `${escapeHtml(row.cidr)}<br/>${escapeHtml(formatDateTime(row.first))} → ${escapeHtml(formatDateTime(row.last))} · ${formatNumber(row.events)} events`
      },
    }),
    xAxis: { type: 'time', min, max: max === min ? min + HOUR : max, axisLabel: { hideOverlap: true, formatter: (v: number) => formatDay(new Date(v).toISOString()) } },
    yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.cidr), splitLine: { show: false }, axisLabel: { width: 132, overflow: 'truncate', color: t.c(TOKENS.textSecondary) } },
    series: [
      {
        type: 'custom',
        cursor: 'pointer',
        encode: { x: [1, 2], y: 0 },
        data: rows.map((r, i) => [i, spans[i][0], spans[i][1], r.events]),
        renderItem: (params, api) => {
          const lane = api.value(0)
          const start = api.coord([api.value(1), lane])
          const end = api.coord([api.value(2), lane])
          const h = (api.size?.([0, 1]) as number[])[1] * 0.7
          const sys = params.coordSys as unknown as { x: number; width: number }
          const x0 = Math.max(start[0], sys.x)
          const x1 = Math.min(Math.max(end[0], start[0] + 4), sys.x + sys.width)
          return { type: 'rect', shape: { x: x0, y: start[1] - h / 2, width: Math.max(4, x1 - x0), height: h, r: 4 }, style: { fill: ink } }
        },
      },
    ],
  }
}

// ---- Heatmaps ----------------------------------------------------------------

/** Light-to-dark steps of the data ink. */
export const HEAT_STEPS = [18, 34, 52, 72, 92]

/** Which of `steps` an event count falls in, on a log scale against the max,
 * so one loud cell does not wash every other one out. */
export const logStep = (events: number, max: number, steps = HEAT_STEPS.length) =>
  Math.min(steps - 1, Math.floor((Math.log2(events + 1) / Math.log2(max + 1)) * steps))

type CoverageCell = KillChainData['coverage'][number]

/** The coverage grid: a column per tactic, its techniques stacked in it. */
export function coverageLayout(tactics: string[], cells: CoverageCell[]) {
  const columns = tactics.map((tactic) => cells.filter((c) => c.tactic === tactic))
  return { columns, rows: Math.max(0, ...columns.map((c) => c.length)) }
}

/** ATT&CK techniques grouped by tactic; darker = more observed events (one
 * hue, light to dark), never severity. `cellWidth` truncates the names. */
export function coverageOption(tactics: string[], cells: CoverageCell[], cellWidth: number, t: ChartTheme): EChartsOption {
  const { columns, rows } = coverageLayout(tactics, cells)
  const max = Math.max(1, ...cells.map((c) => c.events))
  const nameChars = Math.max(4, Math.floor((cellWidth - 16) / 5.6))
  const card = t.c(TOKENS.card)
  const data = columns.flatMap((column, ci) =>
    column.map((cell, ri) => {
      const step = logStep(cell.events, max)
      const name = cell.name.length > nameChars ? `${cell.name.slice(0, nameChars - 1)}…` : cell.name
      return { value: [ci, ri, step], cell, name, label: { color: HEAT_STEPS[step] > 70 ? card : t.c(TOKENS.text) } }
    }),
  )
  return {
    grid: { top: 30, right: 0, bottom: 0, left: 0 },
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: (p: { data: { cell: CoverageCell } }) => `${escapeHtml(p.data.cell.technique)} ${escapeHtml(p.data.cell.name)}: ${formatNumber(p.data.cell.events)} events`,
    }),
    xAxis: {
      type: 'category',
      position: 'top',
      data: tactics,
      splitLine: { show: false },
      axisLabel: { interval: 0, color: t.c(TOKENS.text), fontWeight: 600, width: cellWidth - 8, overflow: 'truncate', margin: 10 },
    },
    yAxis: { type: 'category', show: false, inverse: true, data: Array.from({ length: rows }, (_, i) => i) },
    visualMap: {
      type: 'piecewise',
      show: false,
      dimension: 2,
      pieces: HEAT_STEPS.map((pct, i) => ({ value: i, color: t.c(inkShade(pct)) })),
    },
    series: [
      {
        type: 'heatmap',
        data,
        itemStyle: { borderColor: card, borderWidth: 3, borderRadius: 6 },
        emphasis: { itemStyle: { borderColor: t.c(TOKENS.text), borderWidth: 2 } },
        label: {
          show: true,
          position: 'insideLeft',
          align: 'left',
          lineHeight: 15,
          fontSize: 11,
          formatter: (p: { data?: unknown }) => {
            const d = p.data as { cell: CoverageCell; name: string }
            return `${d.cell.technique}\n${d.name}`
          },
        },
      },
    ],
  }
}

export const SENSOR_HEAT = [12, 28, 46, 66, 88]

/** Every colour the builders ask for beyond the theme tokens, so a chart
 * resolves them all in one go. */
export const CHART_COLORS = [DATA_INK, ...[...HEAT_STEPS, ...SENSOR_HEAT].map(inkShade)]
export const HEAT_LABEL_W = 132

/** Sensors × hours, one hue light→dark, an empty hour muted; the exact count
 * is in each cell's tooltip, and a click opens that sensor's events. */
export function sensorHeatmapOption(rows: HeatmapRow[], startIso: string, t: ChartTheme): EChartsOption {
  const max = Math.max(1, ...rows.flatMap((r) => r.cells))
  const start = Date.parse(startIso)
  const hour = (ci: number) => new Date(start + ci * HOUR).toISOString()
  const step = (count: number) => (count === 0 ? 0 : 1 + Math.min(SENSOR_HEAT.length - 1, Math.floor((count / max) * SENSOR_HEAT.length)))
  const ticks = new Set([0, 6, 12, 18, 23])
  return {
    grid: { top: 0, right: 0, bottom: 22, left: HEAT_LABEL_W },
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: (p: { value: [number, number, number, number] }) =>
        `${escapeHtml(rows[p.value[1]].sensor)} · ${escapeHtml(formatTime(hour(p.value[0])))} · ${formatNumber(p.value[3])} events`,
    }),
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => i),
      splitLine: { show: false },
      axisLabel: { interval: (i: number) => ticks.has(i), fontSize: 11, formatter: (v: string) => formatTime(hour(Number(v))).slice(0, 5) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.sensor),
      splitLine: { show: false },
      axisLabel: { color: t.c(TOKENS.text), width: HEAT_LABEL_W - 8, overflow: 'truncate', align: 'left', margin: HEAT_LABEL_W },
    },
    // An empty hour muted, then light to dark. ECharts colours a heatmap
    // through a visualMap (it insists on one).
    visualMap: {
      type: 'piecewise',
      show: false,
      dimension: 2,
      pieces: [{ value: 0, color: t.c(TOKENS.muted) }, ...SENSOR_HEAT.map((pct, i) => ({ value: i + 1, color: t.c(inkShade(pct)) }))],
    },
    series: [
      {
        type: 'heatmap',
        cursor: 'pointer',
        data: rows.flatMap((row, ri) => row.cells.map((count, ci) => [ci, ri, step(count), count])),
        itemStyle: { borderColor: t.c(TOKENS.card), borderWidth: 1.5, borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: t.c(TOKENS.text), borderWidth: 1.5 } },
      },
    ],
  }
}

// ---- Bars --------------------------------------------------------------------

export const rankBarsHeight = (rows: number) => Math.max(140, rows * 30 + 20)

/** Horizontal bars for a leaderboard, largest first, one hue. A click copies
 * the full value (labels are cut to fit). */
export function rankBarsOption(rows: CountRow[], t: ChartTheme): EChartsOption {
  return {
    grid: { top: 0, right: 56, bottom: 0, left: 236 },
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: (p: { dataIndex: number }) => `${escapeHtml(rows[p.dataIndex].label)}: ${formatNumber(rows[p.dataIndex].count)}`,
    }),
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.label),
      axisLabel: { width: 228, overflow: 'truncate', color: t.c(TOKENS.textSecondary) },
    },
    series: [
      {
        type: 'bar',
        cursor: 'pointer',
        barCategoryGap: 6,
        data: rows.map((r) => r.count),
        itemStyle: { color: t.c(DATA_INK), borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontSize: 11, color: t.c(TOKENS.textSecondary), formatter: (p: { value: unknown }) => formatNumber(Number(p.value)) },
      },
    ],
  }
}

/** Vertical bars over ordered buckets (a histogram). */
export function histogramOption(rows: CountRow[], t: ChartTheme): EChartsOption {
  return {
    grid: { top: 16, right: 8, bottom: 24, left: 44 },
    tooltip: tooltip(t, {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: t.c(TOKENS.muted), opacity: 0.6 } },
      formatter: (params: AxisParam[]) => `${escapeHtml(params[0]?.name)}: ${formatNumber(Number(params[0]?.value))} connections`,
    }),
    xAxis: { type: 'category', data: rows.map((r) => r.label), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{ type: 'bar', barCategoryGap: 8, data: rows.map((r) => r.count), itemStyle: { color: t.c(DATA_INK), borderRadius: [4, 4, 0, 0] } }],
  }
}

// ---- Radar -------------------------------------------------------------------

/** Why an identity merged: per fingerprint family, how many values its
 * members share. */
export function radarOption(categories: string[], values: number[], t: ChartTheme): EChartsOption {
  const max = Math.max(1, ...values)
  const ink = t.c(DATA_INK)
  return {
    tooltip: tooltip(t, {
      trigger: 'item',
      formatter: () => categories.map((c, i) => `${escapeHtml(c)}: ${formatNumber(values[i])} shared`).join('<br/>'),
    }),
    radar: {
      radius: '68%',
      indicator: categories.map((name) => ({ name, max })),
      axisName: { color: t.c(TOKENS.textSecondary), fontSize: 11 },
      axisLine: { lineStyle: { color: t.c(TOKENS.border) } },
      splitLine: { lineStyle: { color: t.c(TOKENS.border) } },
      splitArea: { show: false },
    },
    series: [
      {
        type: 'radar',
        name: 'Shared values',
        symbolSize: 5,
        data: [{ value: values, name: 'Shared values' }],
        lineStyle: { color: ink, width: 2 },
        itemStyle: { color: ink },
        areaStyle: { color: ink, opacity: 0.25 },
      },
    ],
  }
}
