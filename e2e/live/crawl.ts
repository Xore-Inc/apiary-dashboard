// Live SSR link crawl and route matrix, signed in as the viewer.
//
// 1. Fixed answers: addresses whose status is the route's own decision (a
//    legacy path redirects, an unknown id or name is 404, the static assets
//    and probes answer 200).
// 2. The crawl: every page route without parameters (from the generated route
//    tree) and everything linked from them, a few instances of each route
//    shape, plus every tab of each entity page it meets (tabs are buttons:
//    `sources.$ip.timeline.tsx` means every /sources/<ip> has /timeline).
//    Any link answering 4xx/5xx fails, and so does a page that renders an
//    outage, overload, expiry or crash state.
// 3. One page per route shape is written to SHOTS_DIR/samples.json for the
//    browser check (skeletons.ts).
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/crawl.ts [maxPerShape]
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { APIRequestContext } from 'playwright-core'
import { routeEntries, routePolicy } from '../../scripts/authorization-matrix'
import { base, check, done, fail, info, launch, origin, shots, signedIn } from './lib'

const maxPerShape = Number(process.argv[2] ?? 2)
const browser = await launch()
const context = await signedIn(browser)
const http: APIRequestContext = context.request

const get = async (path: string) => {
  const r = await http.get(base + path, { maxRedirects: 0, timeout: 90_000 }).catch((e: Error) => ({ status: () => -1, headers: (): Record<string, string> => ({}), text: async () => e.message }))
  return { status: r.status(), location: r.headers()['location'] ?? '', text: () => r.text() }
}

{
  const r = await get('/alerts')
  if (r.status === 307 && r.location.includes('/auth/login')) {
    console.log('STOP the session was not accepted; refresh BETA_STORAGE_STATE')
    await browser.close()
    process.exit(3)
  }
}

// ---- 1 ----------------------------------------------------------------------
const FIXED: Array<[string, number | number[]]> = [
  ['/healthz', 200],
  ['/favicon.ico', 200],
  ['/favicon-32x32.png', 200],
  ['/site.webmanifest', 200],
  ['/brand/apiary-compact-mark-for-light.png', 200],
  ['/brand/apiary-compact-mark-for-dark.png', 200],
  ['/no-such-page', 404],
  ['/sources/10.0.0.1', 404],
  ['/dead-letters/live-check-nonexistent', 404],
  ['/api/export/nope', 404],
  ['/api/chart/nope', 404],
  ['/api/report/live-check-nonexistent/pdf', 404],
  ['/investigate/ip/192.0.2.1', 301],
  ['/investigate/cidr/192.0.2.0%2F24', 301],
  ['/investigate/lookup', 301],
  ['/reports?step=library', 301],
  ['/tty-replay/' + '0'.repeat(64), 301],
  ['/settings?pane=services', 307],
  ['/auth/callback?code=expired', 200],
  ['/auth/callback?error=invalid_request', 200],
  ['/auth/callback?code=failed', 200],
]
{
  const findings: string[] = []
  for (const [path, want] of FIXED) {
    const { status } = await get(path)
    const ok = Array.isArray(want) ? want.includes(status) : status === want
    if (!ok) findings.push(`${status} ${path} (want ${want})`)
  }
  check(findings.length === 0, `${FIXED.length} fixed answers`, findings.join('; '))
}

// ---- 2 ----------------------------------------------------------------------
// "<prefix>|<param count>" → tab segments, from src/routes/_layout.
const tabs = new Map<string, string[]>()
for (const file of readdirSync(join(import.meta.dirname, '../../src/routes/_layout'))) {
  const parts = file.replace(/\.tsx$/, '').split('.')
  const params = parts.filter((p) => p.startsWith('$')).length
  const last = parts.at(-1)!
  if (!params || last.startsWith('$') || last === 'index' || parts.length < 3) continue
  const key = `${parts[0]}|${params}`
  tabs.set(key, [...(tabs.get(key) ?? []), last])
}

/** Every page route without a parameter: the crawl's seeds. A legacy
 * address that only redirects with its search (checked in FIXED) is not. */
const LEGACY = new Set(['/investigate/cluster', '/investigate/lookup'])
const seeds = routeEntries()
  .filter(({ path, type }) => !path.includes('$') && routePolicy(path, type) === 'page' && !LEGACY.has(path))
  .map(({ path }) => (path.length > 1 ? path.replace(/\/$/, '') : path))

/** Collapses ids so a few instances of each route pattern are visited. */
const shape = (path: string) =>
  path
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ':uuid')
    .replace(/[0-9a-f]{10,}/g, ':h')
    .replace(/\d+\.\d+\.\d+\.\d+(%2F\d+)?/g, ':ip')
    .replace(/[0-9a-f:]{6,}(%2F\d+)?/gi, (m) => (m.includes(':') ? ':ip6' : m))
    .replace(/\/(ioc\/[^/]+|alerts|clusters\/[^/]+|sensors|asn|identities|sessions|events)\/[^/]+/, '/$1/:v')

// A viewer's refusals and the live stream are proven by authorization.ts.
// `/cdn-cgi/` is the CDN's own (its e-mail obfuscation), not the dashboard's.
const NOT_CRAWLED = [/^\/api\/payload\/[^/]+\/download/, /^\/api\/live/, /^\/auth\//, /^\/export\//, /^\/admin(\/|$|\?)/, /^\/cdn-cgi\//]
// The error boundary's titles (DefaultCatchBoundary), by failure kind.
const BOUNDARY = { unavailable: 'The backend did not answer', overloaded: 'The backend is busy', expired: 'Your session expired', crash: 'This page failed to load' } as const
const FORBIDDEN = 'Not available to your role'

const seen = new Set<string>()
const perShape = new Map<string, number>()
const broken: string[] = []
const refusedForViewer: string[] = []
const transient: string[] = []
const samples = new Map<string, string>()
const queue = [...seeds]
let fetched = 0
let slowest = { ms: 0, path: '' }
const started = Date.now()
/** One address: fetched, its links and tabs queued. */
async function visit(path: string) {
  const t = Date.now()
  let res = await get(path)
  // A 5xx once can be the backend shedding under the crawl itself (heavy
  // entity pages time out upstream, APIARY#3856): asked again after a pause,
  // only an answer that fails twice is a finding.
  if (res.status >= 500 || res.status < 0) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const again = await get(path)
    if (again.status < 500 && again.status >= 0) transient.push(`${res.status} ${path}`)
    res = again
  }
  const ms = Date.now() - t
  fetched++
  if (ms > slowest.ms) slowest = { ms, path }
  if (process.env.CRAWL_VERBOSE) console.log(`     ${res.status} ${ms} ms ${path}`)
  else if (fetched % 50 === 0) info(`${fetched} fetched, ${queue.length} queued, ${Math.round((Date.now() - started) / 1000)} s`)
  if (res.status < 0 || res.status >= 400) {
    broken.push(`${res.status} ${path}`)
    return
  }
  if (res.status >= 300) {
    if (res.location) {
      const to = new URL(res.location, base)
      if (to.origin === origin) queue.push(to.pathname + to.search)
      else broken.push(`${res.status} ${path} → leaves the dashboard`)
    }
    return
  }
  // A download is checked for answering, not read for links or states.
  if (path.startsWith('/api/')) return
  const html = await res.text()
  const key = shape(path)
  for (const [kind, title] of Object.entries(BOUNDARY)) if (html.includes(title)) broken.push(`${path}: renders the ${kind} state`)
  if (html.includes(FORBIDDEN)) refusedForViewer.push(path)
  if (!samples.has(key)) samples.set(key, path)
  for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
    const href = match[1].replaceAll('&amp;', '&')
    if (/^\/(assets|@[\w-]+|node_modules|src)\//.test(href) || /\.(css|svg|ico|png|webmanifest|woff2?)$/.test(href.split('?')[0])) continue
    queue.push(href)
  }
  const segments = path.split('?')[0].split('/').filter(Boolean)
  const entityTabs = tabs.get(`${segments[0]}|${segments.length - 1}`)
  if (entityTabs) for (const tab of entityTabs) queue.push(`${path.split('?')[0]}/${tab}`)
}
/** The next address worth fetching: not seen, not excluded, its shape not full. */
function next(): string | undefined {
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (seen.has(path) || NOT_CRAWLED.some((re) => re.test(path))) continue
    seen.add(path)
    const key = shape(path)
    if ((perShape.get(key) ?? 0) >= maxPerShape) continue
    perShape.set(key, (perShape.get(key) ?? 0) + 1)
    return path
  }
  return undefined
}
// A few requests at a time; a worker that finds the queue empty waits for
// the others, whose pages may still add to it.
let busy = 0
await Promise.all(
  Array.from({ length: Number(process.env.PARALLEL ?? 2) }, async () => {
    for (;;) {
      const path = next()
      if (path === undefined) {
        if (busy === 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
        continue
      }
      busy++
      try {
        await visit(path)
      } finally {
        busy--
      }
    }
  }),
)
info(`slowest page: ${slowest.ms} ms (${shape(slowest.path)})`)
if (transient.length) info(`failed once, answered on a second try (${transient.length}): ${transient.slice(0, 10).join('; ')}`)
info(`crawled ${fetched} pages across ${perShape.size} route shapes from ${seeds.length} seeds`)
if (refusedForViewer.length) info(`pages that show the viewer "${FORBIDDEN}" (an admin-only part): ${refusedForViewer.slice(0, 10).join(', ')}`)
check(fetched > seeds.length, 'the crawl followed links beyond its seeds', `${fetched} fetched`)
check(broken.length === 0, 'no broken link and no error state', broken.slice(0, 25).join('; ') + (broken.length > 25 ? ` … +${broken.length - 25}` : ''))
if (!samples.size) fail('samples', 'no page rendered')
writeFileSync(join(shots, 'samples.json'), JSON.stringify([...samples.values()], null, 2))
info(`${samples.size} samples written to ${join(shots, 'samples.json')}`)
await done(browser)
