// Live authorization matrix: the same role policy the unit tests and
// docs/migration/authorization-matrix.md describe, proven on the running
// dashboard.
//
// 1. Without a session (a fresh browser context, no storage state): every
//    generated route answers as its policy says. Pages go to sign-in with a
//    same-origin return path, direct handlers answer 401, the service-token
//    and same-origin routes refuse, and only the probes and sign-in pages
//    answer. Every server function except the public ones answers 401.
// 2. As the signed-in viewer: every admin-only server function (every write,
//    and the admin-only reads) is refused with 403, each call carrying the
//    CSRF header, so the refusal is the role's and not the same-origin rule's.
//    The admin page sends a viewer home; a payload download is 403.
// 3. CSRF: a captured write replayed without the header, or from another
//    origin, is refused by the same-origin rule before the handler runs.
// 4. Open redirect: a crafted `return_to=//…` never leaves this dashboard or
//    its identity provider. (The last hop, after a completed sign-in, needs a
//    real sign-in; src/server/oidc.server.test.ts covers it in CI.)
// 5. Sign-out from another site is refused (last: a regression would end the
//    session).
//
// Nothing here may write. The session must be a viewer: with an admin
// session the check stops before any write, because the writes would run.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/authorization.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { APIRequestContext, Page, Request } from 'playwright-core'
import { routeEntries, routePolicy } from '../../scripts/authorization-matrix'
import { PUBLIC_QUERIES, isAdminOnly } from '../../src/server/authorize'
import { EXIT, anonymous, base, callServerFn, check, discover, done, fail, info, installServerFns, launch, nameOfRequest, navigate, origin, pass, queryData, requireSession, serverFnIds, settle, shots, signedIn } from './lib'

const root = join(import.meta.dirname, '..', '..')
/** Every query the pages can call: the generated server-function facade. */
const QUERIES = [...readFileSync(join(root, 'src/data/queries.ts'), 'utf8').matchAll(/^export const (\w+) = announced\(/gm)].map((m) => m[1]).sort()
const ADMIN_ONLY = QUERIES.filter(isAdminOnly)
const ZERO_HASH = '0'.repeat(64)
const NONE = 'live-check-nonexistent'
const EVIL = 'https://evil.example.test'

/** A report draft as the wizard starts one; never saved (refused). */
const PROBE_REPORT = {
  id: '',
  name: 'live authorization probe',
  template: 'executive',
  theme: 'dark',
  elements: [],
  scope: { window: '24h', ip: [], sensor: [], port: [], signature: [] },
  branding: { title: 'probe', author: '', headerLeft: '', headerRight: '', footerLeft: '', classification: 'TLP:AMBER' },
  schedule: null,
  appendixLimit: 120,
  created: '',
}

/** Arguments for every admin-only call that would change nothing even if a
 * regression let it through: empty lists, ids that do not exist, the
 * caller's own preferences unchanged. These run first. */
const INERT: Record<string, (prefs: unknown) => unknown[]> = {
  acknowledgeAnomalies: () => [[]],
  setAnomalyDisposition: () => [[], 'open', 'live authorization probe'],
  setAlertsAcknowledged: () => [[], true],
  deleteReportDefinition: () => [NONE],
  generateReport: () => [NONE],
  deleteGeneratedReport: () => [NONE],
  generatePayloadReport: () => [ZERO_HASH],
  previewReport: () => [PROBE_REPORT],
  validateConfig: () => ['behavior', { defaultTimeWindow: '24h' }],
  rotateCredential: () => [NONE],
  linkCredentialToken: () => [NONE],
  setRunChild: () => [NONE, 'sandbox', 'cancel'],
  abortGpuJob: () => [NONE],
  setIpBlocked: () => ['192.0.2.1', false],
  setProblemStatus: () => [NONE, 'open'],
  savePreferences: (prefs) => [prefs],
  runServiceAction: () => [NONE, 'restart'],
  rollbackConfig: () => [NONE],
  queuePayloadAction: () => [ZERO_HASH, 'pdf'],
  getSandboxVncBridge: () => [],
}
/** Calls that would change something if let through: sent only once every
 * inert call above was refused, with arguments as harmless as each allows. */
const MATERIAL: Record<string, () => unknown[]> = {
  acknowledgeAllAnomalies: () => [],
  acknowledgeAllAlerts: () => [],
  saveReportDefinition: () => [PROBE_REPORT],
  generateReportFrom: () => [PROBE_REPORT, false],
  createCanarytoken: () => [{ type: 'ms_word', memo: 'live authorization probe' }],
  provisionCredential: () => [{ path: '/live-check', target: NONE, username: 'live-check', password: 'live-check', memo: 'live authorization probe', template: 'env' }],
  startAnalysisRun: () => [{ hash: ZERO_HASH, analyzers: [] }],
  purgeDeadLetters: () => [`id:${NONE}`],
  submitProblemReport: () => [{ page: '/alerts', expected: 'live authorization probe', actual: 'probe', actionTrail: [], consoleErrors: [], networkFailures: [], apiCalls: [], userAgent: 'live-check' }],
  saveConfigSection: () => ['live-check', {}],
}

const browser = await launch()

// ---- 2 (first: it captures the requests the other steps replay) -----------
const viewer = await signedIn(browser)
const page = await viewer.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
/** Every server-function request the pages make, for the anonymous replay. */
const pageCalls: Request[] = []
page.on('request', (r: Request) => {
  if (r.url().includes('/_serverFn/') && r.method() === 'GET') pageCalls.push(r)
})
await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await requireSession(page, browser)
await settle(page)

const me = (await queryData(page, 'getSessionUser')) as { roles?: string[]; name?: string } | null
info(`session user: ${me?.name ?? '?'} roles ${JSON.stringify(me?.roles ?? [])}`)
if (!me?.roles?.length) {
  console.log('STOP the session resolved no user')
  await browser.close()
  process.exit(EXIT.session)
}
if (me.roles.includes('admin')) {
  console.log('STOP this session is an admin: the write refusals cannot be proven, and the calls would run. Use the viewer session.')
  await browser.close()
  process.exit(EXIT.skipped)
}

type Captured = { method: string; url: string; headers: Record<string, string>; body: string | null; status: number }
/** Each server function's last request as the browser sent it, by name. */
const captured = new Map<string, Captured>()
let pendingName: string | undefined
const nameOf = new Map<Request, string>()
/** Ids read off the chunks once they are loaded; a request is tagged with
 * the call in flight only when it is that call's own function. */
let fnIds: Record<string, string> = {}
page.on('request', (r: Request) => {
  if (r.url().includes('/_serverFn/') && pendingName && nameOfRequest(fnIds, r.url()) === pendingName) nameOf.set(r, pendingName)
})
page.on('requestfinished', async (r: Request) => {
  const name = nameOf.get(r)
  if (!name) return
  const response = await r.response()
  captured.set(name, { method: r.method(), url: r.url(), headers: await r.allHeaders(), body: r.postData(), status: response?.status() ?? 0 })
})
const call = async (name: string, args: unknown[]) => {
  pendingName = name
  const result = await callServerFn(page, name, ...args)
  await page.waitForTimeout(300)
  pendingName = undefined
  return result
}

// The write functions live in the chunks of the pages that use them: visit
// those (client-side, one document) before reading the chunks.
for (const href of ['/reports/generate', '/reports/history', '/canarytokens', '/credentials', '/dead-letters', '/payloads', '/payload-workbench/results', '/ml-anomalies', '/problem-reports', '/settings', '/alerts']) {
  await navigate(page, href).catch(() => {})
  await page.waitForTimeout(1500)
}
await settle(page)
const found = await installServerFns(page)
const missing = QUERIES.filter((q) => !found.includes(q))
info(`${QUERIES.length} queries in the facade, ${ADMIN_ONLY.length} admin-only; ${found.length} server functions found in the loaded chunks`)
if (missing.length) info(`not in the loaded chunks (not checked through the browser): ${missing.join(', ')}`)
const uncovered = ADMIN_ONLY.filter((q) => !(q in INERT) && !(q in MATERIAL))
check(uncovered.length === 0, 'every admin-only query has probe arguments', uncovered.join(', ') || `${ADMIN_ONLY.length} covered`)

const prefs = await queryData(page, 'getPreferences')
check(prefs !== null, 'the preferences are in the page cache', prefs ? 'read' : 'missing')
const ids = await serverFnIds(page)
fnIds = ids
const idOf = (name: string) => Object.keys(ids).find((id) => ids[id] === name)
/** Captured requests by their arguments, to send the same body to a function
 * the chunks do not export (its id is known, its client is not). */
const byArgs = new Map<string, Captured>()
const refused = async (name: string, args: unknown[]) => {
  const key = JSON.stringify(args)
  if (!found.includes(name)) {
    const id = idOf(name)
    const same = byArgs.get(key)
    if (!id || !same) {
      fail(`viewer ${name}`, 'not found in the loaded chunks, so not proven refused')
      return false
    }
    // A GET carries its arguments in `?payload=`, a POST in its body: the
    // same serialization either way.
    const from = new URL(same.url)
    const body = same.method === 'GET' ? (from.searchParams.get('payload') ?? '') : (same.body ?? '')
    const url = `${from.origin}/_serverFn/${id}`
    const headers = Object.fromEntries(Object.entries(same.headers).filter(([k]) => !k.startsWith(':') && k !== 'cookie' && k !== 'accept-encoding'))
    const r = await viewer.request.post(url, { headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': headers['x-csrf-token'] ?? '1', origin }, data: body, maxRedirects: 0 })
    captured.set(name, { method: 'POST', url, headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': headers['x-csrf-token'] ?? '1', origin }, body, status: r.status() })
    check(r.status() === 403, `viewer ${name} refused 403`, `${r.status()} ${(await r.text()).slice(0, 120)} (sent by its id, as the browser sends a POST)`)
    return r.status() === 403
  }
  const result = await call(name, args)
  const sent = captured.get(name)
  if (sent) byArgs.set(key, sent)
  const ok = !result.ok && (result.status === 403 || /: 403 forbidden/.test(result.error ?? '')) && sent?.status === 403
  check(ok, `viewer ${name} refused 403`, ok ? `csrf header ${'x-csrf-token' in sent.headers ? 'sent' : 'MISSING'}` : `${JSON.stringify(result).slice(0, 200)} network ${sent?.status ?? 'none'}`)
  if (ok && !('x-csrf-token' in sent.headers) && sent.method === 'POST') fail(`viewer ${name}`, 'the refused POST did not carry x-csrf-token: the refusal may be the same-origin rule, not the role')
  return ok
}

let allInertRefused = true
for (const name of ADMIN_ONLY.filter((q) => q in INERT)) allInertRefused = (await refused(name, INERT[name](prefs))) && allInertRefused
if (allInertRefused) {
  for (const name of ADMIN_ONLY.filter((q) => q in MATERIAL)) await refused(name, MATERIAL[name]())
} else fail('viewer material writes', 'skipped: an inert write was not refused, so the ones that would change data were not sent')

// A viewer read the policy allows still answers: the refusals above are not
// a broken session.
await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await settle(page)
const alerts = await queryData(page, 'getAlerts')
check(Array.isArray(alerts), 'viewer getAlerts answers', Array.isArray(alerts) ? `${alerts.length} alert groups` : JSON.stringify(alerts).slice(0, 160))

// The admin page sends a viewer home; a payload download is refused.
const req = viewer.request
const status = async (ctx: APIRequestContext, path: string, headers: Record<string, string> = {}) => {
  const r = await ctx.get(base + path, { maxRedirects: 0, timeout: 60_000, headers }).catch((e: Error) => ({ status: () => -1, headers: (): Record<string, string> => ({}), text: async () => e.message }))
  return { code: r.status(), location: r.headers()['location'] ?? '', text: r.text }
}
{
  const admin = await status(req, '/admin')
  const home = admin.code >= 300 && admin.code < 400 && new URL(admin.location, base).pathname === '/'
  check(home, 'viewer /admin redirects home', `${admin.code} → ${admin.location || '-'}`)
  const hashes = (await discover(page, '/payloads', /^\/payloads\/[0-9a-f]{32,64}$/, 1)).map((h) => h.split('/')[2])
  for (const hash of [...hashes, ZERO_HASH]) {
    const d = await status(req, `/api/payload/${hash}/download`)
    check(d.code === 403, `viewer payload download refused 403 (${hash === ZERO_HASH ? 'unknown hash' : 'a real payload'})`, String(d.code))
  }
  if (!hashes.length) info('no payload linked from /payloads: only the unknown hash was tried')
}

// ---- 3. CSRF ---------------------------------------------------------------
{
  const write = [...captured.entries()].find(([name, c]) => c.method === 'POST' && isAdminOnly(name))
  if (!write) fail('csrf replay', 'no refused POST was captured to replay')
  else {
    const [name, c] = write
    const strip = (h: Record<string, string>, drop: string[]) => Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(':') && !drop.includes(k)))
    const post = async (headers: Record<string, string>) => {
      const r = await req.post(c.url, { headers, data: c.body ?? '', maxRedirects: 0 })
      return { code: r.status(), body: (await r.text()).slice(0, 120) }
    }
    const bare = await post({ ...strip(c.headers, ['x-csrf-token', 'cookie', 'origin', 'referer', 'accept-encoding']), origin })
    check(bare.code === 403 && bare.body.includes('Cross-origin request rejected'), `csrf: ${name} without x-csrf-token refused by the same-origin rule`, `${bare.code} ${bare.body}`)
    const foreign = await post({ ...strip(c.headers, ['cookie', 'origin', 'referer', 'accept-encoding']), origin: EVIL, referer: `${EVIL}/` })
    check(foreign.code === 403 && foreign.body.includes('Cross-origin request rejected'), `csrf: ${name} from another origin refused`, `${foreign.code} ${foreign.body}`)
    writeFileSync(join(shots, 'replay.json'), JSON.stringify({ name, url: c.url.replace(base, ''), method: c.method }, null, 2))
  }
}

// ---- 1. Without a session --------------------------------------------------
const stranger = await anonymous(browser)
const anon = stranger.request
const FILL: Record<string, string> = {
  $ip: '192.0.2.1',
  $cidr: '192.0.2.0%2F24',
  $hash: ZERO_HASH,
  $sha: ZERO_HASH,
  $shasum: ZERO_HASH,
  $asn: 'AS64496',
  $format: 'cast',
  $name: 'os-distribution',
  $filename: 'live-check.txt',
}
const fill = (path: string) => path.replace(/\$\w+/g, (p) => FILL[p] ?? 'live-check').replace(/\/$/, '') || '/'
const signInTarget = (location: string) => {
  const url = new URL(location, base)
  return url.origin === origin && url.pathname === '/auth/login' ? safePath(url.searchParams.get('return_to')) : undefined
}
const safePath = (value: string | null) => (value && value.startsWith('/') && !value.startsWith('//') ? value : undefined)

const routes = routeEntries()
const anonFindings: string[] = []
let anonChecked = 0
for (const { path, type } of routes) {
  const policy = routePolicy(path, type)
  const target = fill(path)
  // The live stream would hold the connection open: probed below with a
  // bounded read.
  if (target === '/api/live') continue
  let r = await status(anon, target)
  // A legacy address first redirects inside the dashboard; its target answers.
  if (policy === 'page' || policy === 'admin-page') {
    for (let hop = 0; hop < 3 && [301, 302, 308].includes(r.code) && new URL(r.location, base).origin === origin; hop++) {
      const next = new URL(r.location, base)
      r = await status(anon, next.pathname + next.search)
    }
  }
  anonChecked++
  const want = (() => {
    switch (policy) {
      case 'page':
      case 'admin-page':
        return r.code === 307 && signInTarget(r.location) !== undefined ? true : `${r.code} → ${r.location || '-'} (want 307 to /auth/login with a same-origin return_to)`
      case 'handler':
      case 'admin-handler':
      case 'session-or-token':
        return r.code === 401 ? true : `${r.code} (want 401)`
      case 'service-token':
        return r.code === 401 || r.code === 403 ? true : `${r.code} (want 401 or 403 without the token)`
      case 'same-origin':
        return r.code === 403 ? true : `${r.code} (want 403 without an Origin)`
      case 'public':
        if (target === '/auth/login') return r.code === 303 && new URL(r.location, base).origin !== origin ? true : `${r.code} → ${r.location} (want 303 to the identity provider)`
        return r.code === 200 ? true : `${r.code} (want 200)`
      default:
        return `no expectation for policy ${policy}`
    }
  })()
  if (want !== true) anonFindings.push(`${target} [${policy}]: ${want}`)
}
check(anonFindings.length === 0, `anonymous: ${anonChecked} routes answer as their policy says`, anonFindings.slice(0, 15).join('; '))

// The live stream, anonymous and signed in, read only as far as its status.
{
  const probe = async (p: Page) =>
    p.evaluate(async (u) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15_000)
      try {
        const r = await fetch(u, { signal: controller.signal, credentials: 'include' })
        controller.abort()
        return r.status
      } catch {
        return -1
      } finally {
        clearTimeout(timer)
      }
    }, `${base}/api/live`)
  const strangerPage = await stranger.newPage()
  await strangerPage.goto(`${base}/healthz`)
  const a = await probe(strangerPage)
  check(a === 401, 'anonymous /api/live refused 401', String(a))
  const v = await probe(page)
  check(v === 200, 'viewer /api/live opens (a read)', String(v))
  await strangerPage.close()
}

// Every server function captured above, sent without a session: 401, or the
// same-origin refusal for a POST; never an answer. The public ones answer.
{
  const findings: string[] = []
  // The reads the pages made, by name, plus the refused writes.
  for (const path of ['/', '/events', '/sensors', '/settings']) {
    await page.goto(base + path, { waitUntil: 'load', timeout: 90_000 })
    await settle(page)
  }
  const replays = new Map(captured)
  for (const r of pageCalls) {
    const name = nameOfRequest(ids, r.url())
    if (name && !replays.has(name)) replays.set(name, { method: 'GET', url: r.url(), headers: r.headers(), body: null, status: 0 })
  }
  info(`replaying without a session: ${[...replays.keys()].sort().join(', ')}`)
  let n = 0
  for (const [name, c] of replays) {
    const headers = Object.fromEntries(Object.entries(c.headers).filter(([k]) => !k.startsWith(':') && k !== 'cookie'))
    const r = c.method === 'GET' ? await anon.get(c.url, { headers, maxRedirects: 0 }) : await anon.post(c.url, { headers: { ...headers, origin }, data: c.body ?? '', maxRedirects: 0 })
    n++
    const code = r.status()
    if (PUBLIC_QUERIES.has(name)) {
      if (code !== 200) findings.push(`${name} (public) ${code}`)
    } else if (code !== 401) findings.push(`${name} ${c.method} ${code} (want 401) ${(await r.text()).slice(0, 100)}`)
  }
  check(findings.length === 0 && n > 0, `anonymous: ${n} server functions refused without a session (public ones answer)`, findings.join('; '))
}

// ---- 4. Open redirect ------------------------------------------------------
{
  for (const crafted of ['//evil.example.test', '/\\evil.example.test', `${EVIL}/`]) {
    const r = await status(anon, `/auth/login?return_to=${encodeURIComponent(crafted)}`)
    const to = r.location ? new URL(r.location, base) : undefined
    const leaves = !to || to.hostname.endsWith('evil.example.test') || r.location.includes('evil.example.test')
    check(r.code === 303 && !leaves, `open redirect: sign-in with return_to=${crafted} goes only to the identity provider`, `${r.code} → ${to ? to.origin : '-'}`)
    if (to && to.origin !== origin) {
      const back = to.searchParams.get('redirect_uri')
      check(!back || new URL(back).origin === origin, 'open redirect: the identity provider is told to come back here', back ? new URL(back).origin + new URL(back).pathname : 'no redirect_uri')
    }
  }
  // An unauthenticated page's own sign-in redirect keeps the path only.
  const r = await status(anon, '/events?kind=login')
  check(signInTarget(r.location) === '/events?kind=login', 'a page redirects to sign-in with its own path as return_to', r.location)
  // The failure pages render; nothing bounces to the crafted address.
  const cb = await status(anon, `/auth/callback?code=expired&return_to=${encodeURIComponent('//evil.example.test')}`)
  check(cb.code === 200 && !cb.location, 'open redirect: the failed-callback page renders, no redirect', `${cb.code} ${cb.location}`)
}

// ---- 5. Sign-out from another site ------------------------------------------
{
  const cross = await status(req, '/auth/logout', { referer: `${EVIL}/` })
  check(cross.code === 403, 'sign-out from another site refused 403', String(cross.code))
  const none = await status(req, '/auth/logout')
  check(none.code === 403, 'sign-out without Origin or Referer refused 403', String(none.code))
  await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
  check(!new URL(page.url()).pathname.startsWith('/auth/'), 'the session survived the refused sign-outs', page.url().replace(base, ''))
}

if (errors.length) fail('page errors', errors.join(' | '))
else pass('no page errors')
writeFileSync(join(shots, 'authorization.json'), JSON.stringify({ queries: QUERIES.length, adminOnly: ADMIN_ONLY, captured: [...captured.keys()], anonFindings }, null, 2))
await stranger.close()
await done(browser)
