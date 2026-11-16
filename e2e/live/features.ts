// Feature check (dash#305): the charts, the map, the graphs, the recording
// player and the VNC page show real data.
// - ECharts: every chart canvas on a page is painted (a share of its pixels
//   is not transparent), in the light and the dark scheme.
// - Leaflet: the attack-origin map has markers and loaded tiles.
// - cytoscape: the identity graph, a source's related graph and a Ghidra call
//   graph are painted and keep their keyboard links.
// - xterm: a recording plays into the terminal.
// - noVNC: the sandbox VNC page loads.
// Per page: console errors, page errors, 5xx and BFF calls >= 400 fail.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/features.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import { SKELETON, base, check, done, fail, info, launch, linksIn, origin, requireSession, settle, shot, shots, signedIn } from './lib'

const browser = await launch()
const results: Record<string, unknown>[] = []

async function session(scheme: 'light' | 'dark') {
  const context = await signedIn(browser, { colorScheme: scheme })
  const page = await context.newPage()
  const cur = { bad: [] as string[], s5: [] as string[], console: [] as string[], errors: [] as string[], ok: 0, tileBad: 0 }
  page.on('console', (m) => {
    if (m.type() === 'error') cur.console.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => cur.errors.push(e.message.slice(0, 200)))
  page.on('response', (r) => {
    const u = r.url()
    if (/tile\.openstreetmap\.org|basemaps\.cartocdn/.test(u) && r.status() >= 400) cur.tileBad++
    if (!u.startsWith(origin)) return
    const path = u.replace(origin, '').split('?')[0]
    if (r.status() >= 500) cur.s5.push(`${r.status()} ${path.slice(0, 60)}`)
    if (path.startsWith('/_serverFn') || path.startsWith('/api/')) {
      if (r.status() < 400) cur.ok++
      else cur.bad.push(`${r.status()} ${path.slice(0, 60)}`)
    }
  })
  return { context, page, cur }
}
type Session = Awaited<ReturnType<typeof session>>

/** Every ECharts chart on the page with the share of its canvas painted. */
const charts = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[_echarts_instance_]')].map((el) => {
      const c = el.querySelector('canvas')
      let painted = 0
      if (c && c.width && c.height) {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        let n = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
        painted = n / (c.width * c.height)
      }
      return { label: el.getAttribute('aria-label') ?? '', w: c?.width ?? 0, h: c?.height ?? 0, painted: +painted.toFixed(4) }
    }),
  )

async function open(s: Session, label: string, href: string, expect: { charts?: number; map?: boolean } = {}) {
  const { page, cur } = s
  Object.assign(cur, { bad: [], s5: [], console: [], errors: [], ok: 0, tileBad: 0 })
  await page.goto(base + href, { waitUntil: 'load', timeout: 90_000 })
  await requireSession(page, browser)
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, SKELETON, { timeout: 60_000 }).catch(() => fail(label, 'skeletons left'))
  await settle(page)
  // Charts animate in; let them finish before measuring.
  await page.waitForTimeout(3500)
  const found = await charts(page)
  const blank = found.filter((c) => c.painted < 0.01)
  if ((expect.charts ?? 0) > found.length) fail(label, `expected >= ${expect.charts} charts, found ${found.length}`)
  if (blank.length) fail(label, `blank chart(s): ${blank.map((c) => `${c.label} ${c.painted}`).join('; ')}`)
  let map: { markers: number; tiles: number } | undefined
  if (expect.map) {
    const box = page.locator('[aria-label^="Map of attack origins"]').first()
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {})
    await page.waitForTimeout(2500)
    map = await page.evaluate(() => ({
      markers: document.querySelectorAll('.leaflet-interactive[tabindex="0"]').length,
      tiles: [...document.querySelectorAll('.leaflet-tile')].filter((t) => (t as HTMLImageElement).complete && (t as HTMLImageElement).naturalWidth > 0).length,
    }))
    if (!map.markers) fail(label, 'map has no markers')
    if (!map.tiles) fail(label, 'map has no loaded tiles')
    if (cur.tileBad) fail(label, `${cur.tileBad} tile request(s) failed`)
  }
  await page.screenshot({ path: shot(label), fullPage: true })
  const problems = [...cur.bad.map((b) => `BFF ${b}`), ...cur.s5.map((b) => `5xx ${b}`), ...cur.console.slice(0, 3).map((c) => `console ${c}`), ...cur.errors.slice(0, 3).map((e) => `pageerror ${e}`)]
  check(problems.length === 0 && (expect.charts ?? 0) <= found.length && !blank.length, `${label}`, problems.length ? problems.join(' | ') : `charts ${found.length} [${found.map((c) => c.painted).join(' ')}]${map ? ` map markers ${map.markers} tiles ${map.tiles}` : ''}`)
  results.push({ label, href, charts: found, map, bad: cur.bad, s5: cur.s5, console: cur.console, errors: cur.errors })
}

const first = async (s: Session, list: string, pattern: RegExp) => {
  await s.page.goto(base + list, { waitUntil: 'load', timeout: 90_000 })
  await s.page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, SKELETON, { timeout: 60_000 }).catch(() => {})
  await settle(s.page)
  return linksIn(s.page, pattern)
}

const light = await session('light')
await open(light, 'overview live', '/', { charts: 3, map: true })
await open(light, 'overview traffic', '/?view=threats&section=traffic', { charts: 1 })
await open(light, 'overview exploits', '/?view=threats&section=exploits', { charts: 1 })
await open(light, 'overview fingerprints', '/?view=behavior&section=fingerprints', { charts: 1 })
await open(light, 'overview decoys', '/?view=behavior&section=decoys', { charts: 1 })
await open(light, 'overview health', '/?view=health')
await open(light, 'kill chain', '/kill-chain', { charts: 3 })
await open(light, 'topology', '/topology', { charts: 1 })
await open(light, 'ml models', '/ml-anomalies?view=models', { charts: 1 })
await open(light, 'ips map', '/ips', { map: true })
// /sensors opens the first sensor's detail.
await open(light, 'sensor detail', '/sensors', { charts: 1 })
const [identity] = await first(light, '/attackers', /^\/identities\/[^/?]+$/)
if (identity) await open(light, 'identity why', `${identity}/why`)
else fail('identity why', 'no identity linked from /attackers')
{
  // The kill chain's Sankey zooms in steps.
  const page = light.page
  await page.goto(base + '/kill-chain', { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  await page.waitForTimeout(2500)
  await page
    .getByRole('button', { name: 'Zoom in' })
    .first()
    .click()
    .catch(() => fail('kill chain zoom', 'no zoom button'))
  const pct = await page
    .getByText(/^\d+%$/)
    .first()
    .innerText()
    .catch(() => '?')
  check(pct === '125%', 'kill chain zoom: one step is 125%', pct)
}
await light.context.close()
const dark = await session('dark')
await open(dark, 'dark overview', '/', { charts: 3, map: true })
await open(dark, 'dark kill chain', '/kill-chain', { charts: 3 })
await dark.context.close()

// ---- graphs, terminal, VNC -----------------------------------------------
const GRAPH = '[aria-label^="Attacker identity"], [aria-label^="Relationships of"], [aria-label="Call graph of the decompiled functions"]'
const graphs = (page: Page) =>
  page.evaluate(
    (selector) =>
      // The graph is the labelled element holding the canvas; its tab group
      // and its node list share the label's start.
      [...document.querySelectorAll(selector)].filter((el) => el.querySelector('canvas')).map((el) => {
        let painted = 0
        for (const c of el.querySelectorAll('canvas')) {
          if (!c.width || !c.height) continue
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
          let n = 0
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
          painted = Math.max(painted, n / (c.width * c.height))
        }
        const nav = el.parentElement?.parentElement?.querySelector('nav')
        return { label: el.getAttribute('aria-label') ?? '', painted: +painted.toFixed(4), links: nav ? nav.querySelectorAll('a, button').length : 0 }
      }),
    GRAPH,
  )

async function openGraph(s: Session, label: string, href: string, then?: (page: Page) => Promise<boolean>): Promise<boolean> {
  await open(s, label, href)
  if (then && !(await then(s.page))) return false
  await s.page.waitForTimeout(3000)
  const found = await graphs(s.page)
  const blank = found.filter((g) => g.painted < 0.002 || !g.links)
  check(found.length > 0 && !blank.length, `${label}: graph painted with keyboard links`, JSON.stringify(found))
  const el = s.page.locator(GRAPH).first()
  if (await el.count()) {
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
    await s.page.screenshot({ path: shot(`${label} graph`) })
  }
  return true
}

const g = await session('light')
if (identity) await openGraph(g, 'identity graph', `${identity}/members`)
{
  // The first sources are the busiest, whose related panel can time out in
  // the backend (APIARY#3856): try a few further down the list.
  const sources = (await first(g, '/ips', /^\/sources\/[0-9a-f.:]+$/)).slice(2, 6)
  let shown = false
  for (const src of sources) {
    shown = await openGraph(g, 'related graph', src, async (page) =>
      page
        .getByRole('radio', { name: 'Graph' })
        .or(page.getByRole('button', { name: 'Graph' }))
        .first()
        .click({ timeout: 30_000 })
        .then(() => true)
        .catch(() => (info(`related graph: no Graph toggle on one source (its related panel did not load); trying another`), false)),
    )
    if (shown) break
  }
  if (!shown) fail('related graph', `no Graph view on any of ${sources.length} sources`)
}
{
  const runs = await first(g, '/payload-workbench/results?tab=ghidra', /\/ghidra/)
  const sha = runs.map((h) => h.match(/[0-9a-f]{32,64}/)?.[0]).find(Boolean)
  if (sha) await openGraph(g, 'call graph', `/payloads/${sha}/ghidra?section=code`)
  else info('call graph: no Ghidra run linked from the results tab (skipped)')
}
{
  const [rec] = await first(g, '/recordings', /^\/recordings\/[0-9a-f]{16,}$/)
  if (rec) {
    await open(g, 'recording', rec)
    await g.page
      .getByRole('button', { name: /^Play$/ })
      .click()
      .catch(() => fail('recording', 'no Play button'))
    await g.page.waitForTimeout(6000)
    const rows = await g.page.evaluate(() => [...document.querySelectorAll('.xterm-rows > div')].map((d) => d.textContent ?? '').filter((t) => t.trim()).length)
    check(rows > 0, 'recording: the terminal plays', `${rows} non-empty rows after 6 s`)
    await g.page.screenshot({ path: shot('recording xterm') })
  } else fail('recording', 'no recording linked from /recordings')
}
await open(g, 'sandbox vnc', '/sandbox/vnc')
await g.context.close()
writeFileSync(join(shots, 'features.json'), JSON.stringify(results, null, 2))
await done(browser)
