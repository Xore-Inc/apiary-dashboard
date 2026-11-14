// Every chart the dashboard draws, on ECharts (dash#305): the options live in
// #/lib/chartOptions (pure, tested), the painting in <EChart>, and the
// legends and empty states here, in Astryx, beside the canvas.
import { useCallback, useMemo } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { StopIcon } from '@heroicons/react/24/solid'
import { useNavigate } from '@tanstack/react-router'
import type { CountRow, HeatmapRow, KillChainData, SeriesPoint, TimeBucket } from '#/data/types'
import { formatNumber } from '#/lib/format'
import { entityHref } from '#/lib/entities'
import { useMeasuredWidth } from '#/lib/useMeasuredWidth'
import { inkShade } from '#/lib/chartTheme'
import type { ChartTheme } from '#/lib/chartTheme'
import {
  HEAT_LABEL_W,
  HEAT_STEPS,
  LINE_COLORS,
  campaignTimelineOption,
  coverageLayout,
  coverageOption,
  drawn,
  histogramOption,
  radarOption,
  rankBarsHeight,
  rankBarsOption,
  sankeyOption,
  sensorHeatmapOption,
  seriesFor,
  seriesLinesOption,
  sparklineOption,
  timeLinesOption,
  timelineOption,
  toRows,
} from '#/lib/chartOptions'
import type { LineSeries } from '#/lib/chartOptions'
import { EChart } from './EChart'
import { SkeletonBlock } from './EntityBlocks'
import { FlowZoom, useFlowZoom } from './FlowZoom'

export type { LineSeries }

/** A chart with nothing to draw: the space it would take, saying so,
 * instead of axes around nothing. */
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

function Legend({ items }: { items: Array<{ key: string; label: string; color: string }> }) {
  return (
    <HStack gap={4} wrap="wrap">
      {items.map((s) => (
        <HStack key={s.key} gap={1.5} vAlign="center">
          <Swatch color={s.color} />
          <Text type="supporting">{s.label}</Text>
        </HStack>
      ))}
    </HStack>
  )
}

/** Hourly events stacked by protocol. */
export function ProtocolTimeline({ buckets }: { buckets: TimeBucket[] }) {
  const build = useCallback((t: ChartTheme) => timelineOption(buckets, t), [buckets])
  if (!buckets.some((b) => b.total > 0)) return <ChartEmpty height={260} label="No events in this window." />
  const series = seriesFor(buckets)
  return (
    <VStack gap={3}>
      <EChart height={260} build={build} label="Hourly events stacked by protocol" />
      <Legend items={drawn(series, toRows(buckets, series))} />
    </VStack>
  )
}

export function Sparkline({ data }: { data: number[] }) {
  const build = useCallback((t: ChartTheme) => sparklineOption(data, t), [data])
  if (data.length === 0) return <div style={{ height: 36 }} />
  return <EChart height={36} build={build} label="Trend" />
}

/** Up to three series over hourly time buckets on one shared 0–1 axis. */
export function TimeLines<T extends { time: string }>({ data, series, domain = [0, 1] }: { data: T[] | undefined; series: LineSeries[]; domain?: [number, number] }) {
  const [lo, hi] = domain
  const build = useCallback((t: ChartTheme) => timeLinesOption(data ?? [], series, [lo, hi], t), [data, series, lo, hi])
  // Still loading (the page renders before its data): the chart's space.
  if (!data) return <SkeletonBlock height={220} />
  if (data.length === 0) return <ChartEmpty height={220} />
  return (
    <VStack gap={3}>
      <EChart height={220} build={build} label={series.map((s) => s.label).join(', ')} />
      <Legend items={series.map((s, i) => ({ ...s, color: LINE_COLORS[i] }))} />
    </VStack>
  )
}

/** Left-to-right flow between named stages (kill-chain tactics, pipeline
 * components). Nodes drag, the canvas pans, and the zoom row scales it. */
export function FlowSankey({ flow, height = 420 }: { flow: KillChainData['flow']; height?: number }) {
  const zoom = useFlowZoom(flow)
  const build = useCallback((t: ChartTheme) => sankeyOption(flow, height, t), [flow, height])
  const patch = useMemo(() => ({ series: [{ zoom: zoom.value }] }), [zoom.value])
  if (flow.links.length === 0) return <ChartEmpty height={height} label="No flow to show in this window." />
  return (
    <VStack gap={2}>
      <FlowZoom zoom={zoom} />
      <EChart key={zoom.resets} height={height} build={build} patch={patch} label={`Flow between ${flow.nodes.length} stages`} />
    </VStack>
  )
}

/** Each campaign as a bar from first to last observed activity; a click
 * opens the campaign. */
export function CampaignTimeline({ rows }: { rows: KillChainData['timeline'] }) {
  const navigate = useNavigate()
  const build = useCallback((t: ChartTheme) => campaignTimelineOption(rows, t), [rows])
  if (rows.length === 0) return <ChartEmpty height={160} label="No campaigns in this window." />
  return (
    <EChart
      height={Math.max(160, rows.length * 26 + 40)}
      build={build}
      label={`${rows.length} campaigns, first to last activity`}
      onItemClick={(e) => {
        const href = entityHref('campaign', rows[e.dataIndex]?.cidr ?? '')
        if (href) void navigate({ href })
      }}
    />
  )
}

function HeatScale({ steps }: { steps: number[] }) {
  return (
    <HStack gap={2} vAlign="center">
      <Text type="supporting">Fewer events</Text>
      <HStack gap={0.5}>
        {steps.map((pct) => (
          <span key={pct} aria-hidden="true" style={{ width: 20, height: 12, borderRadius: 2, backgroundColor: inkShade(pct) }} />
        ))}
      </HStack>
      <Text type="supporting">More events</Text>
    </HStack>
  )
}

/** ATT&CK techniques grouped by tactic; darker = more observed events (one
 * hue, light to dark), never severity. Columns share the panel's width, never
 * narrower than a technique name needs (then the grid scrolls sideways). */
export function CoverageHeatmap({ tactics, cells }: { tactics: string[]; cells: KillChainData['coverage'] }) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>()
  const width = Math.max(tactics.length * 126, measured ?? tactics.length * 156)
  const cellWidth = tactics.length ? width / tactics.length - 6 : 0
  const build = useCallback((t: ChartTheme) => coverageOption(tactics, cells, cellWidth, t), [tactics, cells, cellWidth])
  if (cells.length === 0 || tactics.length === 0) return <ChartEmpty height={160} label="No techniques observed in this window." />
  const { rows } = coverageLayout(tactics, cells)
  return (
    <VStack gap={3}>
      {/* Scrolls sideways when narrow, so a keyboard can reach and scroll it. */}
      <div ref={ref} style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="ATT&CK technique coverage, scrollable">
        <EChart height={30 + rows * 50} width={width} build={build} label="ATT&CK technique coverage by tactic" />
      </div>
      <HeatScale steps={HEAT_STEPS} />
    </VStack>
  )
}

/** Sensors × hours, one hue light→dark; the exact count is in each cell's
 * tooltip, and a click opens that sensor's events. */
export function SensorHeatmap({ rows, startIso }: { rows: HeatmapRow[]; startIso: string }) {
  const navigate = useNavigate()
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>()
  const build = useCallback((t: ChartTheme) => sensorHeatmapOption(rows, startIso, t), [rows, startIso])
  if (rows.length === 0) return <ChartEmpty height={160} label="No sensors reporting." />
  // Never narrower than a readable cell; below that the grid scrolls.
  const width = Math.max(HEAT_LABEL_W + 24 * 12, measured ?? HEAT_LABEL_W + 24 * 29)
  return (
    <VStack gap={2}>
      <div ref={ref} style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Hourly events per sensor, scrollable">
        <EChart
          height={rows.length * 23 + 22}
          width={width}
          build={build}
          label="Hourly events per sensor, last 24 hours"
          onItemClick={(e) => {
            const sensor = rows[(e.value as number[])[1]]?.sensor
            if (sensor) void navigate({ to: '/events', search: { sensor } as never })
          }}
        />
      </div>
      <Text type="supporting">Darker cells mean more events. Hover a cell for the exact count; click it for the sensor's events.</Text>
    </VStack>
  )
}

/** Horizontal bars for a leaderboard, largest first, one hue. Labels are cut
 * to fit, so a click copies the full value. */
export function RankBars({ rows, height }: { rows: CountRow[]; height?: number }) {
  const toast = useToast()
  const build = useCallback((t: ChartTheme) => rankBarsOption(rows, t), [rows])
  if (rows.length === 0) return <ChartEmpty height={height ?? 140} />
  return (
    <EChart
      height={height ?? rankBarsHeight(rows.length)}
      build={build}
      label={`${rows.length} values ranked by count. Click a bar to copy its value.`}
      onItemClick={(e) => {
        const label = rows[e.dataIndex]?.label
        if (!label) return
        navigator.clipboard.writeText(label).then(
          () => toast({ body: `Copied ${label.length > 60 ? `${label.slice(0, 59)}…` : label}` }),
          () => toast({ type: 'error', body: 'Could not copy: the browser refused clipboard access.' }),
        )
      }}
    />
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
  const build = useCallback((t: ChartTheme) => seriesLinesOption(data, series, format, dayTicks, t), [data, series, format, dayTicks])
  if (data.length === 0) return <ChartEmpty height={240} />
  return (
    <VStack gap={3}>
      <EChart height={240} build={build} label={series.map((s) => s.label).join(', ')} />
      {series.length > 1 && <Legend items={series.map((s, i) => ({ ...s, color: LINE_COLORS[i] }))} />}
    </VStack>
  )
}

/** Vertical bars over ordered buckets (a histogram). */
export function Histogram({ rows }: { rows: CountRow[] }) {
  const build = useCallback((t: ChartTheme) => histogramOption(rows, t), [rows])
  if (rows.length === 0) return <ChartEmpty height={240} />
  return <EChart height={240} build={build} label="Connections per bucket" />
}

/** Why an identity merged: per fingerprint family, how many values its
 * members share. The shape says which signals did the joining. */
export function FusionRadar({ categories, values }: { categories: string[]; values: number[] }) {
  const build = useCallback((t: ChartTheme) => radarOption(categories, values, t), [categories, values])
  if (values.every((v) => v === 0)) return <ChartEmpty height={280} label="No values are shared: this identity has a single member address." />
  return <EChart height={300} build={build} label="Shared values per fingerprint family" />
}
