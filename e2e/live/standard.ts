// The standard check, run before and after every release:
// 1. A first load, then client-side navigation through the main pages: each
//    page's skeletons are replaced by data without a reload, no page shows an
//    error state, no BFF call answers >= 400, no 5xx, no console error, no
//    uncaught page error. /payloads makes no console 400 (#290).
// 2. A full load makes no browser call for what the server already read
//    (session, preferences, shell configuration): those reach the browser's
//    cache with the HTML (#309).
// 3. A live page asks its live read again when it is revisited (#309).
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/standard.ts
import { ERROR_TITLES, SKELETON, base, check, discover, done, fail, info, launch, navigate, requireSession, settle, shot, signedIn } from './lib'

const browser = await launch()
const context = await signedIn(browser)
// Announced calls (src/data/serverFn.ts) carry their names.
await context.addInitScript(() => {
  const w = window as unknown as { __calls: string[] }
  w.__calls = []
  window.addEventListener('apiary-api-call', (e) => w.__calls.push((e as CustomEvent<{ name: string }>).detail.name))
})
const page = await context.newPage()
const pageErrors: string[] = []
const consoleErrors: string[] = []
const server5xx: string[] = []
let bff = { ok: 0, bad: [] as string[] }
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`${m.text().slice(0, 200)} @ ${m.location().url.replace(base, '')}`)
})
page.on('response', (r) => {
  if (!r.url().startsWith(base)) return
  const path = r.url().replace(base, '').split('?')[0]
  if (r.status() >= 500) server5xx.push(`${r.status()} ${r.request().method()} ${path}`)
  if (path.startsWith('/_serverFn') || path.startsWith('/api/')) {
    if (r.status() < 400) bff.ok++
    else bff.bad.push(`${r.status()} ${path.slice(0, 60)}`)
  }
})
let loads = 0
page.on('load', () => loads++)

async function landed(label: string) {
  const t = Date.now()
  try {
    await page.waitForFunction((s) => document.querySelectorAll(s).length === 0, SKELETON, { timeout: 60_000 })
    check(true, `${label}: data replaced the skeletons`, `${Date.now() - t} ms`)
  } catch {
    fail(label, `${await page.locator(SKELETON).count()} skeletons after 60 s`)
  }
  const text = await page.locator('main, body').first().innerText()
  for (const title of ERROR_TITLES) if (text.includes(title)) fail(label, `shows "${title}"`)
  await settle(page, 15_000)
  if (bff.bad.length) fail(label, `BFF call(s) answered >= 400: ${bff.bad.join(', ')}`)
  info(`${label}: BFF calls ok=${bff.ok} bad=${bff.bad.length}`)
  bff = { ok: 0, bad: [] }
  await page.screenshot({ path: shot(label) })
}

// ---- 1 ----------------------------------------------------------------------
await page.goto(`${base}/`, { waitUntil: 'commit', timeout: 90_000 })
await page.waitForLoadState('domcontentloaded')
await requireSession(page, browser)
await landed('first load overview')
{
  // The attack-vectors panel shows one sensor: opening the overview reads that
  // one, not one per sensor (up to forty, dash#337). A live refresh may read it
  // again, so allow a few.
  const calls = await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)
  const vectors = calls.filter((name) => name === 'getAttackVectors').length
  check(vectors >= 1 && vectors <= 3, 'overview: the attack-vectors panel makes one read, not one per sensor (#337)', `${vectors} read(s)`)
  check(!calls.includes('getFilterValues'), 'overview: no filter-vocabulary read')
}
for (const [label, href] of [
  ['events', '/events'],
  ['attackers', '/attackers'],
  ['sensors', '/sensors'],
  ['source health', '/source-health'],
  ['live feed', '/?view=live'],
  ['alerts', '/alerts'],
  ['overview again', '/'],
] as const) {
  await navigate(page, href)
  await landed(`nav ${label}`)
}
{
  const [sensor] = await linksFrom('/sensors', /^\/sensors\/[^/?]+$/)
  if (sensor) {
    await navigate(page, sensor)
    await landed('nav sensor detail')
    const text = await page.locator('main, body').first().innerText()
    const window = text.match(/Events \/ (\S+)/)?.[1]
    check(window === '7d', 'sensor detail header names the 7d window (#286)', window ?? 'not found')
  } else fail('sensor detail', 'no sensor linked from /sensors')
}
{
  const before = consoleErrors.length
  await navigate(page, '/payloads')
  await landed('nav payloads')
  check(!consoleErrors.slice(before).some((c) => c.includes('400')), 'payloads: no console 400 (#290)')
}
check(loads === 1, 'navigation never reloaded the document', `${loads} load(s)`)

/** The links on `list`, reached by client-side navigation. */
async function linksFrom(list: string, pattern: RegExp): Promise<string[]> {
  await navigate(page, list)
  await page.waitForFunction((s) => document.querySelectorAll(s).length === 0, SKELETON, { timeout: 45_000 }).catch(() => {})
  bff = { ok: 0, bad: [] }
  return page.evaluate((source) => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '').filter((h) => new RegExp(source).test(h)))], pattern.source)
}

// ---- 2 ----------------------------------------------------------------------
{
  const SHELL = ['getSessionUser', 'getPreferences', 'getShellConfig']
  const fresh = await signedIn(browser)
  await fresh.addInitScript(() => {
    try {
      localStorage.setItem('hp-prefetch', 'off')
    } catch {
      // storage blocked: prefetch stays as it is
    }
    const w = window as unknown as { __calls: string[] }
    w.__calls = []
    window.addEventListener('apiary-api-call', (e) => w.__calls.push((e as CustomEvent<{ name: string }>).detail.name))
  })
  const [source] = await discover(page, '/ips', /^\/sources\/[^/?]+$/, 1)
  for (const path of ['/alerts', '/ips', '/', ...(source ? [source] : [])]) {
    const p = await fresh.newPage()
    await p.goto(`${base}${path}`, { waitUntil: 'load', timeout: 90_000 })
    await settle(p)
    await p.waitForTimeout(1500)
    const calls = await p.evaluate(() => (window as unknown as { __calls: string[] }).__calls)
    const shell = calls.filter((c) => SHELL.includes(c))
    check(shell.length === 0, `full load ${path.startsWith('/sources/') ? '/sources/<ip>' : path}: no shell read asked again (#309)`, shell.join(',') || `announced [${calls.join(',')}]`)
    await p.close()
  }
  await fresh.close()
}

// ---- 3 ----------------------------------------------------------------------
for (const [href, read] of [
  ['/alerts', 'getAlerts'],
  ['/events', 'getEvents'],
] as const) {
  await page.goto(`${base}${href}`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page, 15_000)
  await navigate(page, '/kill-chain')
  await page.waitForTimeout(6000)
  await page.evaluate(() => ((window as unknown as { __calls: string[] }).__calls = []))
  await navigate(page, href)
  await page.waitForTimeout(3000)
  const calls = await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)
  check(calls.includes(read), `revisit ${href} revalidates ${read} (#309)`, `[${calls.join(',')}]`)
}

if (pageErrors.length) fail('uncaught page errors', pageErrors.join(' | '))
for (const c of consoleErrors) fail('console error', c)
for (const c of server5xx) fail('5xx', c)
info(`console errors=${consoleErrors.length} 5xx=${server5xx.length} page errors=${pageErrors.length}`)
await done(browser)
