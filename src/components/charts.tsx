import { Card } from '@astryxdesign/core/Card'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { StopIcon } from '@heroicons/react/24/solid'
import {
  Bar,
  BarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactElement } from 'react'
import type { CountRow, HeatmapRow, KillChainData, SeriesPoint, TimeBucket } from '#/data/types'
import { formatDateTime, formatCompact, formatDay, formatNumber, formatTime } from '#/lib/format'
import { useMeasuredWidth } from '#/lib/useMeasuredWidth'

// Colors follow the protocol, never its rank, so filtering never repaints a
// series. Order (blue, orange, teal, purple, pink) is validated with the
// dataviz palette checker on both surfaces; the theme sets separate dark
// values (#14). Everything else folds into gray "Other".
//
// A chart whose traffic is mostly outside those five (one Conpot device, the
// SIP or DNS sensor) would be a single gray bar, so it names its own top
// protocols instead, in the same palette order. Such a chart shows one
// sensor, so filtering it never repaints a series either.
type Series = { key: string; label: string; color: string }

/** Recharts' ResponsiveContainer takes its first size from
 * getBoundingClientRect, which includes the large-screen `zoom` in
 * styles.css: the chart drew 1.25x too wide and corrected itself only after
 * it was visible. clientWidth is the unzoomed width and is read before the
 * first paint, so the chart is drawn once, at its real size. */
function ChartBox({ height, children }: { height: number; children: ReactElement }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>()
  return (
    <div ref={ref} style={{ height }}>
      {width ? (
        <ResponsiveContainer width={width} height={height}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  )
}

// One-hue charts draw in the theme's data ink (a palette's accent); themes
// that don't set it keep the first categorical slot.
export const DATA_INK = 'var(--color-data-ink, var(--color-data-categorical-blue))'

const PALETTE = ['blue', 'orange', 'teal', 'purple', 'pink'].map((c) => `var(--color-data-categorical-${c})`)
const OTHER: Series = { key: 'other', label: 'Other', color: 'var(--color-text-secondary)' }

const SERIES: Series[] = [
  { key: 'ssh', label: 'SSH', color: 'var(--color-data-categorical-blue)' },
  { key: 'telnet', label: 'Telnet', color: 'var(--color-data-categorical-orange)' },
  { key: 'http', label: 'HTTP', color: 'var(--color-data-categorical-teal)' },
  { key: 'smb', label: 'SMB', color: 'var(--color-data-categorical-purple)' },
  { key: 'rdp', label: 'RDP', color: 'var(--color-data-categorical-pink)' },
  OTHER,
]

/** The fixed series, or this chart's own top protocols when those cover
 * less than half of its events. */
function seriesFor(buckets: TimeBucket[]): Series[] {
  const totals = new Map<string, number>()
  for (const bucket of buckets) for (const [protocol, count] of Object.entries(bucket.byProtocol)) totals.set(protocol, (totals.get(protocol) ?? 0) + count)
  const all = [...totals.values()].reduce((a, b) => a + b, 0)
  const named = SERIES.reduce((sum, s) => sum + (totals.get(s.key) ?? 0), 0)
  if (all === 0 || named * 2 >= all) return SERIES
  const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, PALETTE.length)
  return [...top.map(([key], i) => ({ key, label: key.length <= 4 ? key.toUpperCase() : key, color: PALETTE[i] })), OTHER]
}

const AXIS_TICK = { fontSize: 12, fill: 'var(--color-text-secondary)' }
const GRID_STROKE = 'var(--color-border)'

type TimelineRow = { time: string } & Record<string, number | string>

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
const drawn = (series: Series[], rows: TimelineRow[]) => series.filter((s) => rows.some((r) => Number(r[s.key] ?? 0) > 0))

/** A chart with nothing to draw: the space it would take, saying so,
 * instead of axes around nothing (or an SVG sized by Infinity). */
function ChartEmpty({ height, label = 'Nothing in this window.' }: { height: number; label?: string }) {
  return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'var(--color-background-muted)' }}>
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return <Icon icon={StopIcon} size="xsm" style={{ color }} />
}

function TimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0)
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting">
          {formatTime(label)} · {formatNumber(total)} events
        </Text>
        {[...payload].reverse().map((entry) => (
          <HStack key={entry.name} gap={2} vAlign="center">
            <Swatch color={entry.color} />
            <Text type="supporting" color="primary">
              {entry.name}: {formatNumber(entry.value || 0)}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Card>
  )
}

/** A y-axis tick as short text: 25000 reads "25K". */
export const yAxisLabel = (value: number): string => formatCompact(value)

/** The y axis's width: the widest label the scale can print, at the tick font,
 * plus padding. The stacked total's scale rounds up past the tallest bar, so
 * one more digit than the tallest bar's is allowed for (#288: the fixed 36 px
 * cut "20000" to "0000"). */
export function yAxisWidth(buckets: TimeBucket[]): number {
  const tallest = Math.max(0, ...buckets.map((b) => b.total))
  const chars = yAxisLabel(tallest * 1.25).length
  return Math.max(36, Math.ceil(chars * AXIS_TICK.fontSize * 0.62) + 12)
}

/** Hourly events stacked by protocol. */
export function ProtocolTimeline({ buckets }: { buckets: TimeBucket[] }) {
  if (!buckets.some((b) => b.total > 0)) return <ChartEmpty height={260} label="No events in this window." />
  const series = seriesFor(buckets)
  const rows = toRows(buckets, series)
  const axis = timelineAxis(buckets)
  return (
    <VStack gap={3}>
      <ChartBox height={260}>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="time"
            tickFormatter={axis.label}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={axis.interval}
          />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={yAxisWidth(buckets)} tickFormatter={yAxisLabel} />
          <Tooltip content={<TimelineTooltip />} cursor={{ fill: 'var(--color-background-muted)' }} />
          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="protocol"
              fill={s.color}
              stroke="var(--color-background-card)"
              strokeWidth={1}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartBox>
      <HStack gap={4} wrap="wrap">
        {drawn(series, rows).map((s) => (
          <HStack key={s.key} gap={1.5} vAlign="center">
            <Swatch color={s.color} />
            <Text type="supporting">{s.label}</Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  )
}

export function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) return <div style={{ height: 36 }} />
  const rows = data.map((value, index) => ({ index, value }))
  return (
    <ChartBox height={36}>
      <LineChart data={rows} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={DATA_INK}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartBox>
  )
}

export type LineSeries = { key: string; label: string }

// First slots of the validated categorical order; lines never exceed three.
const LINE_COLORS = [
  'var(--color-data-categorical-blue)',
  'var(--color-data-categorical-orange)',
  'var(--color-data-categorical-teal)',
]

function LinesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length || !label) return null
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting">{formatTime(label)}</Text>
        {payload.map((entry) => (
          <HStack key={entry.name} gap={2} vAlign="center">
            <Swatch color={entry.color} />
            <Text type="supporting" color="primary">
              {entry.name}: {entry.value.toFixed(2)}
            </Text>
          </HStack>
        ))}
      </VStack>
    </Card>
  )
}

/** Up to three series over hourly time buckets on one shared 0–1 axis. */
export function TimeLines<T extends { time: string }>({
  data,
  series,
  domain = [0, 1],
}: {
  data: T[]
  series: LineSeries[]
  domain?: [number, number]
}) {
  if (data.length === 0) return <ChartEmpty height={220} />
  return (
    <VStack gap={3}>
      <ChartBox height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="time"
            tickFormatter={(value: string) => formatTime(value).slice(0, 5)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis domain={domain} tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<LinesTooltip />} cursor={{ stroke: GRID_STROKE }} />
          {series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={LINE_COLORS[index]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-background-card)' }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartBox>
      <HStack gap={4} wrap="wrap">
        {series.map((s, index) => (
          <HStack key={s.key} gap={1.5} vAlign="center">
            <Swatch color={LINE_COLORS[index]} />
            <Text type="supporting">{s.label}</Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  )
}

// ---- Kill chain ------------------------------------------------------------

function ValueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <Card padding={3}>
      <Text type="supporting" color="primary">
        {payload[0].name}: {formatNumber(payload[0].value)}
      </Text>
    </Card>
  )
}

/** Left-to-right flow between named stages (kill-chain tactics, pipeline
 * components). Labels sit above each node so neighbours never collide. */
export function FlowSankey({ flow, height = 420 }: { flow: KillChainData['flow']; height?: number }) {
  if (flow.links.length === 0) return <ChartEmpty height={height} label="No flow to show in this window." />
  return (
    <ChartBox height={height}>
      <Sankey
        data={flow}
        nodePadding={28}
        nodeWidth={12}
        margin={{ top: 24, right: 8, bottom: 8, left: 8 }}
        link={{ stroke: DATA_INK, strokeOpacity: 0.25 }}
        node={({ x, y, width, height: nodeHeight, payload }: { x: number; y: number; width: number; height: number; payload: { name: string; value: number; targetLinks?: unknown[] } }) => (
          <g>
            <rect x={x} y={y} width={width} height={nodeHeight} rx={2} fill={DATA_INK} />
            {/* Terminal nodes sit on the right edge, so their label reads leftwards,
                under the bar, clear of the previous column's label.
                Recharts names a node's outgoing links `targetLinks`. */}
            <text
              x={payload.targetLinks?.length ? x : x + width}
              y={payload.targetLinks?.length ? y - 8 : y + nodeHeight + 16}
              textAnchor={payload.targetLinks?.length ? 'start' : 'end'}
              fontSize={12}
              fill="var(--color-text-primary)"
            >
              {payload.name}
              <tspan fill="var(--color-text-secondary)"> · {formatNumber(payload.value)}</tspan>
            </text>
          </g>
        )}
      >
        <Tooltip content={<ValueTooltip />} />
      </Sankey>
    </ChartBox>
  )
}

/** Each campaign as a bar from first to last observed activity. */
export function CampaignTimeline({ rows }: { rows: KillChainData['timeline'] }) {
  if (rows.length === 0) return <ChartEmpty height={160} label="No campaigns in this window." />
  const data = rows.map((row) => ({ ...row, span: [Date.parse(row.first), Date.parse(row.last)] as [number, number] }))
  const min = Math.min(...data.map((d) => d.span[0]))
  const max = Math.max(...data.map((d) => d.span[1]))
  return (
    <ChartBox height={Math.max(160, rows.length * 26 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
        <XAxis
          type="number"
          domain={[min, max]}
          tickFormatter={(value: number) => formatDay(new Date(value).toISOString())}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis type="category" dataKey="cidr" tick={AXIS_TICK} axisLine={false} tickLine={false} width={132} />
        <Tooltip
          cursor={{ fill: 'var(--color-background-muted)' }}
          content={({ active, payload }) => {
            const row = active && payload.length ? (payload[0].payload as (typeof data)[number]) : undefined
            if (!row) return null
            return (
              <Card padding={3}>
                <VStack gap={1}>
                  <Text type="supporting" color="primary">{row.cidr}</Text>
                  <Text type="supporting">
                    {formatDateTime(row.first)} → {formatDateTime(row.last)} · {formatNumber(row.events)} events
                  </Text>
                </VStack>
              </Card>
            )
          }}
        />
        <Bar dataKey="span" fill={DATA_INK} radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  )
}

const HEAT_STEPS = [18, 34, 52, 72, 92]

/** ATT&CK techniques grouped by tactic; darker = more observed events (one
 * hue, light to dark), never severity. */
export function CoverageHeatmap({ tactics, cells }: { tactics: string[]; cells: KillChainData['coverage'] }) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>()
  if (cells.length === 0 || tactics.length === 0) return <ChartEmpty height={160} label="No techniques observed in this window." />
  const max = Math.max(1, ...cells.map((c) => c.events))
  const step = (events: number) => HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.floor((Math.log2(events + 1) / Math.log2(max + 1)) * HEAT_STEPS.length))]
  const columns = tactics.map((tactic) => cells.filter((c) => c.tactic === tactic))
  // Columns share the panel's real width, never narrower than a technique
  // name needs (then the grid scrolls sideways); text keeps one size.
  const minCellW = 120
  const natural = tactics.length * (150 + 6)
  const width = Math.max(tactics.length * (minCellW + 6), measured ?? natural)
  const cellW = width / tactics.length - 6
  const nameChars = Math.floor((cellW - 16) / 5.6)
  const cellH = 44
  const headH = 36
  const rows = Math.max(...columns.map((c) => c.length))
  const height = headH + rows * (cellH + 6)
  return (
    <VStack gap={3}>
      {/* Scrolls sideways when narrow, so a keyboard can reach and scroll it. */}
      <div ref={ref} style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="ATT&CK technique coverage, scrollable">
      <svg viewBox={`0 0 ${width} ${height}`} width={measured ? width : '100%'} height={measured ? height : undefined} role="img" aria-label="ATT&CK technique coverage by tactic">
        {columns.map((column, ci) => (
          <g key={tactics[ci]} transform={`translate(${ci * (cellW + 6)}, 0)`}>
            <text x={0} y={22} fontSize={12} fontWeight={600} fill="var(--color-text-primary)">
              {tactics[ci]}
            </text>
            {column.map((cell, ri) => {
              const pct = step(cell.events)
              return (
                <g key={cell.technique} transform={`translate(0, ${headH + ri * (cellH + 6)})`}>
                  <rect
                    width={cellW}
                    height={cellH}
                    rx={4}
                    fill={`color-mix(in srgb, ${DATA_INK} ${pct}%, var(--color-background-card))`}
                  >
                    <title>{`${cell.technique} ${cell.name}: ${formatNumber(cell.events)} events`}</title>
                  </rect>
                  <text x={8} y={18} fontSize={11} fill={pct > 70 ? 'var(--color-background-card)' : 'var(--color-text-primary)'}>
                    {cell.technique}
                  </text>
                  <text x={8} y={34} fontSize={10} fill={pct > 70 ? 'var(--color-background-card)' : 'var(--color-text-primary)'}>
                    {cell.name.length > nameChars ? `${cell.name.slice(0, nameChars - 1)}…` : cell.name}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      </div>
      <HStack gap={2} vAlign="center">
        <Text type="supporting">Fewer events</Text>
        <svg width={HEAT_STEPS.length * 22} height={12} aria-hidden="true">
          {HEAT_STEPS.map((pct, i) => (
            <rect key={pct} x={i * 22} width={20} height={12} rx={2} fill={`color-mix(in srgb, ${DATA_INK} ${pct}%, var(--color-background-card))`} />
          ))}
        </svg>
        <Text type="supporting">More events</Text>
      </HStack>
    </VStack>
  )
}

// ---- Overview views --------------------------------------------------------

const HEAT = [12, 28, 46, 66, 88]

/** Sensors × hours, one hue light→dark; the exact count is in each cell's
 * tooltip. */
export function SensorHeatmap({ rows, startIso }: { rows: HeatmapRow[]; startIso: string }) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>()
  if (rows.length === 0) return <ChartEmpty height={160} label="No sensors reporting." />
  const max = Math.max(1, ...rows.flatMap((r) => r.cells))
  // Drawn at the panel's real width: hours stretch to fill it, rows keep
  // one height and the text one size, whatever the screen.
  const labelW = 132
  const cellH = 20
  const gap = 3
  // Never narrower than a readable cell; below that the grid scrolls.
  const width = Math.max(labelW + 24 * 12, measured ?? labelW + 24 * (26 + gap))
  const col = (width - labelW) / 24
  const cellW = Math.max(4, col - gap)
  const start = Date.parse(startIso)
  return (
    <VStack gap={2}>
      {/* Scrolls sideways when narrow, so a keyboard can reach and scroll it. */}
      <div ref={ref} style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Hourly events per sensor, scrollable">
      <svg viewBox={`0 0 ${width} ${rows.length * (cellH + gap) + 22}`} width={measured ? width : '100%'} role="img" aria-label="Hourly events per sensor, last 24 hours">
        {rows.map((row, ri) => (
          <g key={row.sensor} transform={`translate(0, ${ri * (cellH + gap)})`}>
            <text x={0} y={cellH / 2} dy="0.35em" fontSize={12} fill="var(--color-text-primary)">
              {row.sensor}
            </text>
            {row.cells.map((count, ci) => {
              const pct = count === 0 ? 0 : HEAT[Math.min(HEAT.length - 1, Math.floor((count / max) * HEAT.length))]
              const hour = new Date(start + ci * 3_600_000).toISOString()
              return (
                <rect
                  key={ci}
                  x={labelW + ci * col}
                  width={cellW}
                  height={cellH}
                  rx={3}
                  fill={pct ? `color-mix(in srgb, ${DATA_INK} ${pct}%, var(--color-background-card))` : 'var(--color-background-muted)'}
                >
                  <title>{`${row.sensor} · ${formatTime(hour)} · ${formatNumber(count)} events`}</title>
                </rect>
              )
            })}
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((ci) => (
          <text key={ci} x={labelW + ci * col + (ci === 23 ? cellW : 0)} y={rows.length * (cellH + gap) + 14} textAnchor={ci === 23 ? 'end' : 'start'} fontSize={11} fill="var(--color-text-secondary)">
            {formatTime(new Date(start + ci * 3_600_000).toISOString()).slice(0, 5)}
          </text>
        ))}
      </svg>
      </div>
      <Text type="supporting">Darker cells mean more events. Hover a cell for the exact count.</Text>
    </VStack>
  )
}

/** Horizontal bars for a leaderboard, largest first, one hue. */
export function RankBars({ rows, height }: { rows: CountRow[]; height?: number }) {
  if (rows.length === 0) return <ChartEmpty height={height ?? 140} />
  const h = height ?? Math.max(140, rows.length * 30 + 20)
  return (
    <ChartBox height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={230} />
        <Tooltip cursor={{ fill: 'var(--color-background-muted)' }} content={<ValueTooltip />} />
        <Bar
          dataKey="count"
          name="Events"
          fill={DATA_INK}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          label={{ position: 'right', fontSize: 11, fill: 'var(--color-text-secondary)', formatter: (v: unknown) => formatNumber(Number(v)) }}
        />
      </BarChart>
    </ChartBox>
  )
}

/** Up to three series over time with auto-scaled axis and value formatter. */
export function SeriesLines({
  data,
  series,
  format = formatNumber,
  dayTicks = false,
}: {
  data: SeriesPoint[]
  series: LineSeries[]
  format?: (value: number) => string
  dayTicks?: boolean
}) {
  if (data.length === 0) return <ChartEmpty height={240} />
  return (
    <VStack gap={3}>
      <ChartBox height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="time"
            tickFormatter={(value: string) => (dayTicks ? formatDay(value) : formatTime(value).slice(0, 5))}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => format(v)} />
          <Tooltip
            cursor={{ stroke: GRID_STROKE }}
            content={({ active, payload, label }) => {
              if (!active || !payload.length || typeof label !== 'string') return null
              return (
                <Card padding={3}>
                  <VStack gap={1}>
                    <Text type="supporting">{formatDateTime(label)}</Text>
                    {payload.map((entry) => (
                      <HStack key={String(entry.name)} gap={2} vAlign="center">
                        <Swatch color={String(entry.color)} />
                        <Text type="supporting" color="primary">
                          {entry.name}: {format(Number(entry.value))}
                        </Text>
                      </HStack>
                    ))}
                  </VStack>
                </Card>
              )
            }}
          />
          {series.map((s, index) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={LINE_COLORS[index]} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartBox>
      {series.length > 1 && (
        <HStack gap={4} wrap="wrap">
          {series.map((s, index) => (
            <HStack key={s.key} gap={1.5} vAlign="center">
              <Swatch color={LINE_COLORS[index]} />
              <Text type="supporting">{s.label}</Text>
            </HStack>
          ))}
        </HStack>
      )}
    </VStack>
  )
}

/** Vertical bars over ordered buckets (a histogram). */
export function Histogram({ rows }: { rows: CountRow[] }) {
  if (rows.length === 0) return <ChartEmpty height={240} />
  return (
    <ChartBox height={240}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <Tooltip cursor={{ fill: 'var(--color-background-muted)' }} content={<ValueTooltip />} />
        <Bar dataKey="count" name="Connections" fill={DATA_INK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  )
}

/** Why an identity merged: per fingerprint family, how many values its
 * members share. The shape says which signals did the joining. */
export function FusionRadar({ categories, values }: { categories: string[]; values: number[] }) {
  if (values.every((v) => v === 0)) return <ChartEmpty height={280} label="No values are shared: this identity has a single member address." />
  const data = categories.map((category, i) => ({ category, shared: values[i] }))
  return (
    <ChartBox height={300}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={GRID_STROKE} />
        <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} />
        <PolarRadiusAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} angle={90} />
        <Radar dataKey="shared" name="Shared values" stroke={DATA_INK} fill={DATA_INK} fillOpacity={0.25} isAnimationActive={false} />
        <Tooltip formatter={(value) => [`${String(value)} shared`, 'Values']} />
      </RadarChart>
    </ChartBox>
  )
}
