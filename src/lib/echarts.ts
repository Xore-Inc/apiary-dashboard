// The app's only ECharts entry point (dash#305), registered through
// echarts/core the way the old dashboard's lib/echarts.ts did (APIARY
// #1964): only the chart kinds and components the builders in
// chartOptions.ts ask for, so the chunk carries no treemap, gauge, map or
// GL code nobody draws. Adding a chart kind means one import here.
//
// Client only, and loaded lazily: components/EChart.tsx imports this module
// inside an effect, so ECharts is its own chunk that a page fetches when a
// chart first mounts, never part of the server render or the shared bundle.
import * as echarts from 'echarts/core'
import { BarChart, CustomChart, HeatmapChart, LineChart, RadarChart, SankeyChart } from 'echarts/charts'
import { AriaComponent, GridComponent, RadarComponent, TooltipComponent, VisualMapPiecewiseComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  // Stacked/vertical/horizontal bars, lines, the kill-chain and topology
  // flows, the two heatmaps, the fusion radar, and the campaign timeline's
  // custom series (one bar from first to last activity).
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  RadarChart,
  SankeyChart,
  // TooltipComponent installs the axis pointer trigger:'axis' needs; the
  // heatmaps colour by a piecewise VisualMap (only that half of it); Aria
  // writes each chart's spoken description onto its container.
  AriaComponent,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapPiecewiseComponent,
  // labelLayout's hideOverlap is a lifecycle feature, not a component: without
  // it the Sankey's dense columns print their labels over each other (#2130).
  LabelLayout,
  CanvasRenderer,
])

export { echarts }
