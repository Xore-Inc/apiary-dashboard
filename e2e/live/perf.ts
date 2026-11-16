// Page weight on the live dashboard: per kind of page, the server-rendered
// HTML, the JavaScript and CSS it loads, how many requests, and the load
// timings, on a cold load. The JavaScript and CSS are gated: a page may not
// grow past its baseline in docs/baselines/performance.json by more than a
// quarter (and at least 5 KB). The HTML follows the live data and the timings
// follow the network, so both are recorded for trend but not gated.
//
//   BETA_URL=… BETA_STORAGE_STATE=… bun e2e/live/perf.ts            check
//   BETA_URL=… BETA_STORAGE_STATE=… bun e2e/live/perf.ts --update   record a new baseline
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { base, check, discover, done, info, launch, requireSession, signedIn } from './lib'

const update = process.argv.includes('--update')
const file = join(import.meta.dirname, '..', '..', 'docs/baselines/performance.json')
const GROWTH = 1.25

const browser = await launch()
const finder = await signedIn(browser)
const probe = await finder.newPage()
await probe.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await requireSession(probe, browser)
const [SOURCE] = await discover(probe, '/ips', /^\/sources\/[^/?]+$/, 1)
const [PAYLOAD] = await discover(probe, '/payloads', /^\/payloads\/[0-9a-f]{32,64}$/, 1)
await finder.close()

/** Kind of page → an address of it. Entity kinds use one found live. */
const PAGES: Record<string, string | undefined> = {
  '/': '/',
  '/events': '/events',
  '/sources/<ip>': SOURCE,
  '/payloads/<hash>': PAYLOAD,
  '/payloads/<hash>/ghidra?section=code': PAYLOAD && `${PAYLOAD}/ghidra?section=code`,
  '/kill-chain': '/kill-chain',
  '/alerts': '/alerts',
  '/reports/generate': '/reports/generate',
  '/source-health': '/source-health',
  '/auth/callback?code=expired': '/auth/callback?code=expired',
}

type Measure = { htmlKb: number; jsKb: number; cssKb: number; requests: number; domContentLoadedMs: number; loadMs: number }

const measured: Record<string, Measure> = {}
for (const [kind, path] of Object.entries(PAGES)) {
  if (!path) {
    info(`${kind}: none found live, not measured`)
    continue
  }
  // A fresh context per page: a cold load, nothing cached.
  const context = await signedIn(browser)
  const page = await context.newPage()
  await (await context.newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true })
  await page.goto(base + path, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForTimeout(500)
  measured[kind] = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const size = (r: PerformanceResourceTiming) => r.encodedBodySize || r.transferSize
    const sum = (test: (r: PerformanceResourceTiming) => boolean) => resources.filter(test).reduce((total, r) => total + size(r), 0)
    const kb = (bytes: number) => Math.round(bytes / 102.4) / 10
    return {
      htmlKb: kb(nav.encodedBodySize || nav.transferSize),
      jsKb: kb(sum((r) => r.initiatorType === 'script' || /\.m?js(\?|$)/.test(r.name))),
      cssKb: kb(sum((r) => /\.css(\?|$)/.test(r.name))),
      requests: resources.length + 1,
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
    }
  })
  await context.close()
}

info(`${'page'.padEnd(40)} html KB  js KB  css KB  req  DCL ms  load ms`)
for (const [kind, m] of Object.entries(measured)) info(`${kind.slice(0, 39).padEnd(40)} ${String(m.htmlKb).padStart(7)} ${String(m.jsKb).padStart(6)} ${String(m.cssKb).padStart(7)} ${String(m.requests).padStart(4)} ${String(m.domContentLoadedMs).padStart(7)} ${String(m.loadMs).padStart(8)}`)

if (update) {
  writeFileSync(file, `${JSON.stringify({ measuredOn: 'the live dashboard, cold load, 1440x900, as the viewer', gated: ['jsKb', 'cssKb'], growthAllowed: GROWTH, pages: measured }, null, 2)}\n`)
  info('baseline written to docs/baselines/performance.json')
  await done(browser)
}

const baseline = JSON.parse(readFileSync(file, 'utf8')) as { pages: Record<string, Measure> }
const findings: string[] = []
for (const [kind, m] of Object.entries(measured)) {
  const was = baseline.pages[kind] as Measure | undefined
  if (!was) {
    findings.push(`${kind}: no baseline (record one with --update)`)
    continue
  }
  for (const key of ['jsKb', 'cssKb'] as const) {
    if (m[key] > Math.max(was[key] * GROWTH, was[key] + 5)) findings.push(`${kind}: ${key} ${m[key]} > baseline ${was[key]} (+${Math.round((GROWTH - 1) * 100)} %)`)
  }
}
check(findings.length === 0, `every page's JavaScript and CSS within ${Math.round((GROWTH - 1) * 100)} % of the baseline`, findings.join('; '))
await done(browser)
