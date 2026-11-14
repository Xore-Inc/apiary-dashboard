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

/** Resolves colours inside `host`, so its theme scope and colour scheme
 * apply: a probe element takes the expression as its `color` (the browser
 * resolves var(), light-dark() and color-mix()), and a 1×1 canvas turns
 * whatever colour space that is into rgba(). Cached per resolver; make a new
 * one per paint. */
export function domResolver(host: HTMLElement): (css: string) => string {
  const cache = new Map<string, string>()
  const probe = document.createElement('span')
  probe.style.display = 'none'
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return (css) => {
    const hit = cache.get(css)
    if (hit) return hit
    probe.style.color = ''
    probe.style.color = css
    host.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    let out = computed || css
    if (ctx && computed) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = computed
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      out = `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`
    }
    cache.set(css, out)
    return out
  }
}

/** What a theme change looks like to a chart: the colours it would resolve
 * now. Two equal keys draw the same pixels, so no repaint is needed. */
export const themeKey = (t: ChartTheme) => [...Object.values(TOKENS), ...PALETTE].map(t.c).join('|') + t.fontFamily
