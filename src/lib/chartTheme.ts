// The charts' colours, read from the vendored theme's tokens (dash#305).
//
// ECharts paints on a canvas, and a canvas cannot resolve `var(--…)`, nor
// the `light-dark()` and `color-mix()` values the Astryx themes declare. So
// every colour a chart uses is resolved to a literal rgba() at paint time,
// inside the element the chart sits in (so a scoped theme applies), and the
// chart repaints when the theme, mode or palette changes. This module holds
// the token names, the resolver and the ECharts theme built from them; the
// option builders (chartOptions.ts) take a ChartTheme and stay pure.

/** One-hue charts draw in the theme's data ink (a palette's accent); themes
 * that don't set it keep the first categorical slot. */
export const DATA_INK = 'var(--color-data-ink, var(--color-data-categorical-blue))'

/** The validated categorical order (blue, orange, teal, purple, pink). */
export const PALETTE = ['blue', 'orange', 'teal', 'purple', 'pink'].map((c) => `var(--color-data-categorical-${c})`)

export const TOKENS = {
  text: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  border: 'var(--color-border)',
  card: 'var(--color-background-card)',
  muted: 'var(--color-background-muted)',
  ink: DATA_INK,
} as const

/** A shade of the data ink over the card: `pct` percent ink. */
export const inkShade = (pct: number) => `color-mix(in srgb, ${DATA_INK} ${pct}%, var(--color-background-card))`

export interface ChartTheme {
  /** Any CSS colour expression, as a literal the canvas can paint. */
  c: (css: string) => string
  fontFamily: string
  /** False when the operator asked for reduced motion. */
  animate: boolean
}

/** The ECharts theme: what every chart shares, so the builders only say what
 * is particular to them. Axis styles reach all four axis types. */
export function echartsTheme(t: ChartTheme) {
  const axis = {
    axisLine: { show: false, lineStyle: { color: t.c(TOKENS.border) } },
    axisTick: { show: false },
    axisLabel: { color: t.c(TOKENS.textSecondary), fontSize: 12, fontFamily: t.fontFamily },
    splitLine: { lineStyle: { color: t.c(TOKENS.border) } },
  }
  return {
    color: PALETTE.map(t.c),
    backgroundColor: 'transparent',
    textStyle: { color: t.c(TOKENS.text), fontFamily: t.fontFamily },
    tooltip: {
      backgroundColor: t.c(TOKENS.card),
      borderColor: t.c(TOKENS.border),
      textStyle: { color: t.c(TOKENS.text), fontFamily: t.fontFamily, fontSize: 12 },
      extraCssText: 'border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    },
    categoryAxis: axis,
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
  }
}

/** Text from the data (fingerprints, paths, user agents: attacker bytes)
 * going into a tooltip, which ECharts renders as HTML. */
export function escapeHtml(text: unknown): string {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

/** A colour swatch for a tooltip row. */
export const swatch = (color: string) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:${escapeHtml(color)}"></span>`

/** What the resolved colours depend on: the theme, mode and palette Astryx
 * syncs onto <html>, and the system scheme (for a mode that follows it). */
export const THEME_ATTRIBUTES = ['data-theme', 'data-astryx-theme', 'class']

function themeSignature(): string {
  const html = document.documentElement
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  return [...THEME_ATTRIBUTES.map((a) => html.getAttribute(a) ?? ''), dark].join('|')
}

// One resolution per theme, shared by every chart on the page: resolving
// costs a style recalculation, and doing that per colour per chart froze a
// phone for seconds whenever <html> changed.
const caches = new Map<string, Map<string, string>>()
let pixel: CanvasRenderingContext2D | null | undefined

/** Any colour the browser computed, as rgba() the canvas can paint. */
function toRgba(computed: string): string {
  pixel ??= (() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    return canvas.getContext('2d', { willReadFrequently: true })
  })()
  if (!pixel) return computed
  pixel.clearRect(0, 0, 1, 1)
  pixel.fillStyle = '#000'
  pixel.fillStyle = computed
  pixel.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`
}

/** Resolves colours inside `host`, so its colour scheme applies: probe
 * elements take the expressions as their `color` (the browser resolves
 * var(), light-dark() and color-mix()), all read after one recalculation,
 * and a 1×1 canvas turns whatever colour space that is into rgba().
 * `prefetch` is resolved up front in that one batch. */
export function domResolver(host: HTMLElement, prefetch: readonly string[] = []): (css: string) => string {
  const signature = themeSignature()
  let cache = caches.get(signature)
  if (!cache) caches.set(signature, (cache = new Map()))
  const known = cache
  const resolve = (list: readonly string[]) => {
    const missing = [...new Set(list)].filter((css) => !known.has(css))
    if (!missing.length) return
    const box = document.createElement('div')
    box.style.display = 'none'
    const probes = missing.map((css) => {
      const probe = document.createElement('span')
      probe.style.color = css
      return box.appendChild(probe)
    })
    host.appendChild(box)
    const computed = probes.map((probe) => getComputedStyle(probe).color)
    box.remove()
    missing.forEach((css, i) => known.set(css, computed[i] ? toRgba(computed[i]) : css))
  }
  resolve([...Object.values(TOKENS), ...PALETTE, ...prefetch])
  return (css) => {
    if (!known.has(css)) resolve([css])
    return known.get(css) ?? css
  }
}

/** What a theme change looks like to a chart: the colours it would resolve
 * now. Two equal keys draw the same pixels, so no repaint is needed. */
export const themeKey = (t: ChartTheme) => [...Object.values(TOKENS), ...PALETTE].map(t.c).join('|') + t.fontFamily
