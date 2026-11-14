// One ECharts chart (dash#305). The page renders an empty box of the
// chart's height on the server; on the client this loads the tree-shaken
// ECharts chunk (#/lib/echarts), resolves the theme's colours inside the
// box, and paints the option the caller builds from them.
//
// The div ECharts draws into is never one React renders children into:
// ECharts adds and removes its own nodes there, and React reconciling the
// same parent crashed every chart that reached "empty" in the old dashboard
// (APIARY #1628). Anything React draws sits beside it.
import { useEffect, useRef } from 'react'
import type { EChartsOption, ECElementEvent } from 'echarts'
import type { EChartsType } from 'echarts/core'
import type * as EChartsLib from '#/lib/echarts'
import { usePreferences } from '#/lib/prefs'
import { THEME_ATTRIBUTES, domResolver, echartsTheme, themeKey } from '#/lib/chartTheme'
import type { ChartTheme } from '#/lib/chartTheme'
import { CHART_COLORS } from '#/lib/chartOptions'


type EChartsModule = typeof EChartsLib

let canvasSupport: boolean | undefined
const canvasWorks = () => (canvasSupport ??= (() => {
  try {
    return !!document.createElement('canvas').getContext('2d')
  } catch {
    return false
  }
})())

export type ChartBuild = (theme: ChartTheme) => EChartsOption

export function EChart({
  height,
  build,
  label,
  onItemClick,
  width,
  patch,
}: {
  height: number
  /** The chart's option from the resolved theme. Repaints when it changes,
   * so callers memoise it on their data. */
  build: ChartBuild
  /** What the chart shows, for screen readers (ECharts' aria description). */
  label: string
  /** A click on a bar, cell, node or link. */
  onItemClick?: (event: ECElementEvent) => void
  /** A fixed drawing width, for charts that scroll sideways when narrow. */
  width?: number
  /** Merged into the painted chart without rebuilding it (a zoom level),
   * so what the reader dragged stays where they left it. */
  patch?: EChartsOption
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const prefs = usePreferences()
  const reduced = prefs?.motion === 'on'
  // The effects below read the latest props through refs, so a new build
  // repaints without tearing the chart down.
  const latest = useRef({ build, label, onItemClick, reduced, patch })
  latest.current = { build, label, onItemClick, reduced, patch }
  const chartRef = useRef<EChartsType | null>(null)
  const paintRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    let disposed = false
    let chart: EChartsType | null = null
    let paintedKey = ''
    let echartsModule: EChartsModule | null = null

    const theme = (): ChartTheme | null => {
      const host = hostRef.current
      if (!host) return null
      const osReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      return { c: domResolver(host, CHART_COLORS), fontFamily: getComputedStyle(host).fontFamily, animate: !latest.current.reduced && !osReduced }
    }

    /** Paints the current option; re-creates the instance when the theme's
     * colours changed (ECharts binds a theme at init). `themeOnly` skips the
     * repaint when nothing a chart could show has changed. */
    const paint = async (themeOnly = false) => {
      // A DOM without canvas (the unit tests' jsdom) draws nothing.
      if (!canvasWorks()) return
      echartsModule ??= await import('#/lib/echarts')
      const box = boxRef.current
      const t = theme()
      if (disposed || !box || !t) return
      const key = themeKey(t) + String(t.animate)
      if (themeOnly && chart && key === paintedKey) return
      if (!chart || key !== paintedKey) {
        chart?.dispose()
        echartsModule.echarts.registerTheme('apiary', echartsTheme(t))
        chart = echartsModule.echarts.init(box, 'apiary', { renderer: 'canvas' })
        chart.on('click', (event) => latest.current.onItemClick?.(event))
        paintedKey = key
      }
      const option = latest.current.build(t)
      chart.setOption(
        { animation: t.animate, aria: { enabled: true, label: { description: latest.current.label } }, ...option },
        { notMerge: true },
      )
      if (latest.current.patch) chart.setOption(latest.current.patch)
      chartRef.current = chart
    }
    paintRef.current = () => paint()
    // The first paint is the effect below, which runs right after this one.
    const resize = new ResizeObserver(() => chart?.resize())
    if (boxRef.current) resize.observe(boxRef.current)
    // A theme, mode or palette change re-resolves the colours; the system
    // colour scheme matters when the mode follows it. Only the attributes
    // that carry them: <html>'s style changes whenever a drawer opens.
    let frame = 0
    const onTheme = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => void paint(true))
    }
    const mutations = new MutationObserver(onTheme)
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: [...THEME_ATTRIBUTES, 'data-motion'] })
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    scheme?.addEventListener('change', onTheme)
    return () => {
      disposed = true
      paintRef.current = null
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      scheme?.removeEventListener('change', onTheme)
      chart?.dispose()
      chartRef.current = null
    }
  }, [])

  // New data, or the motion preference changed: paint again.
  useEffect(() => {
    void paintRef.current?.()
  }, [build, reduced, label])

  useEffect(() => {
    if (patch) chartRef.current?.setOption(patch)
  }, [patch])

  return (
    <div ref={hostRef} style={{ position: 'relative', width: width ?? '100%', height }}>
      <div ref={boxRef} role="img" aria-label={label} style={{ width: '100%', height }} />
    </div>
  )
}
