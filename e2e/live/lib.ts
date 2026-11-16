// The live checks' shared harness: where the dashboard is, the signed-in
// session, a browser, and PASS / FAIL reporting with one exit code.
//
// Every check reads the same three variables, never a hard-coded address:
//   BETA_URL            the dashboard to check, e.g. the public dashboard URL
//   BETA_STORAGE_STATE  a Playwright storage-state file holding a signed-in
//                       session (the viewer account); read only, never written
//   SHOTS_DIR           where screenshots and result files go
//
// Exit codes, the same for every check: 0 every step passed, 1 a step
// failed, 2 the check could not run (no BETA_URL, no session file, no
// browser), 3 the session was not accepted (expired: refresh it).
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright-core'

export const EXIT = { pass: 0, fail: 1, skipped: 2, session: 3 } as const

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.log(`SKIP ${name} is unset (see e2e/live/README.md)`)
    process.exit(EXIT.skipped)
  }
  return value
}

/** The dashboard's origin, without a trailing slash. */
export const base = required('BETA_URL').replace(/\/+$/, '')
export const origin = new URL(base).origin
export const statePath = required('BETA_STORAGE_STATE')
if (!existsSync(statePath)) {
  console.log(`SKIP BETA_STORAGE_STATE names no file (${statePath})`)
  process.exit(EXIT.skipped)
}
export const shots = process.env.SHOTS_DIR?.trim() || join(process.cwd(), '.live-shots')
mkdirSync(shots, { recursive: true })
export const shot = (label: string) => join(shots, `${label.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.png`)

/** Chrome from CHROME_PATH, else the system's. */
export async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)
  try {
    return await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  } catch (error) {
    console.log(`SKIP no browser (set CHROME_PATH): ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    process.exit(EXIT.skipped)
  }
}

const VIEWPORT = { width: 1440, height: 900 }

/** A context carrying the signed-in session. */
export const signedIn = (browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> =>
  browser.newContext({ storageState: statePath, viewport: VIEWPORT, ...options })

/** A context with no session at all: what a stranger's browser sends. */
export const anonymous = (browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> => browser.newContext({ viewport: VIEWPORT, ...options })

/** The session cookie header from the storage state, for plain HTTP probes. */
export async function cookieHeader(): Promise<string> {
  const state = (await Bun.file(statePath).json()) as { cookies: Array<{ name: string; value: string; domain: string }> }
  const host = new URL(base).hostname
  return state.cookies
    .filter((c) => host === c.domain.replace(/^\./, '') || host.endsWith(c.domain.startsWith('.') ? c.domain : `.${c.domain}`))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}

let failed = false
export const pass = (label: string, detail = '') => console.log(`PASS ${label}${detail ? `: ${detail}` : ''}`)
export const fail = (label: string, detail = '') => {
  failed = true
  console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`)
}
export const info = (text: string) => console.log(`     ${text}`)
export const check = (ok: boolean, label: string, detail = '') => (ok ? pass(label, detail) : fail(label, detail))

/** Ends the check: closes the browser and exits with the outcome. */
export async function done(browser?: Browser): Promise<never> {
  await browser?.close().catch(() => {})
  console.log(failed ? 'RESULT FAIL' : 'RESULT PASS')
  process.exit(failed ? EXIT.fail : EXIT.pass)
}

/** Stops the run when the session was not accepted: the page went to sign-in. */
export async function requireSession(page: Page, browser?: Browser): Promise<void> {
  const url = new URL(page.url())
  if (url.origin !== origin || url.pathname.startsWith('/auth/')) {
    console.log(`STOP the session was not accepted (landed on ${url.origin === origin ? url.pathname : 'the identity provider'}); refresh BETA_STORAGE_STATE`)
    await browser?.close().catch(() => {})
    process.exit(EXIT.session)
  }
}

/** A skeleton placeholder: Astryx's Skeleton, or a region marked busy. */
export const SKELETON = '[class*="skeleton" i], [aria-busy="true"]'
/** Titles the error boundary shows (DefaultCatchBoundary). */
export const ERROR_TITLES = ['The backend did not answer', 'The backend is busy', 'Your session expired', 'This page failed to load']

/** Client-side navigation through the app's own router. */
export const navigate = (page: Page, href: string) => page.evaluate((h) => (window as unknown as { __TSR_ROUTER__: { navigate: (o: { href: string }) => Promise<void> } }).__TSR_ROUTER__.navigate({ href: h }), href)

export const settle = (page: Page, ms = 20_000) => page.waitForLoadState('networkidle', { timeout: ms }).catch(() => {})

/** The hrefs inside the page's main region matching `pattern`. */
export const linksIn = (page: Page, pattern: RegExp): Promise<string[]> =>
  page.evaluate(
    (source) => {
      const re = new RegExp(source)
      const region = document.querySelector('[role="main"], main') ?? document.body
      return [...new Set([...region.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '').filter((h) => re.test(h)))]
    },
    pattern.source,
  )

/** Opens `list` and returns the first links into it matching `pattern`. */
export async function discover(page: Page, list: string, pattern: RegExp, take = 3): Promise<string[]> {
  await page.goto(base + list, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction((s) => document.querySelectorAll(s).length === 0, SKELETON, { timeout: 45_000 }).catch(() => {})
  await settle(page)
  return (await linksIn(page, pattern)).slice(0, take)
}

export type ServerFnResult = { ok: boolean; status: number; value?: unknown; error?: string }

/** Installs window.__q(name, ...args): the dashboard's own server-function
 * client for `name`, found in the loaded chunks, so a call carries the same
 * CSRF header and goes through the same fetch as the pages' own calls. */
export async function installServerFns(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = window as unknown as { __q?: unknown; __fns?: string[]; __ids?: Record<string, string> }
    if (w.__q) return w.__fns ?? []
    const ids: Record<string, string> = {}
    const queue = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.endsWith('.js') && u.includes('/assets/')))]
    const seen = new Set<string>(queue)
    const found: Partial<Record<string, () => Promise<(...args: unknown[]) => Promise<unknown>>>> = {}
    while (queue.length) {
      const url = queue.shift()!
      const text = await fetch(url).then((r) => r.text())
      for (const m of text.matchAll(/["'`]((?:\.{1,2}\/|\/assets\/)[\w.-]+\.js)["'`]/g)) {
        const next = new URL(m[1], url).href
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
      for (const m of text.matchAll(/\(`(\w+)`,[\w$]+\(\{method:`(?:GET|POST)`\}\)\.middleware\(\[[\w$,]*\]\)\.handler\([\w$]+\(`([0-9a-f]{16,})`\)\)/g)) ids[m[2]] = m[1]
      const exported = text.match(/export\{([^}]*)\}\s*;?\s*(\/\/.*)?$/)?.[1]
      if (!exported) continue
      const alias = new Map(exported.split(',').map((p) => p.trim().split(/\s+as\s+/) as [string, string?]).map(([local, as]) => [local, as ?? local]))
      for (const m of text.matchAll(/([\w$]+)=[\w$]+\(`(\w+)`,[\w$]+\(\{method:`(?:POST|GET)`\}\)/g)) {
        const as = alias.get(m[1])
        if (as && !found[m[2]]) found[m[2]] = async () => ((await import(url)) as Record<string, (...args: unknown[]) => Promise<unknown>>)[as]
      }
    }
    w.__fns = Object.keys(found).sort()
    w.__ids = ids
    w.__q = async (name: string, ...args: unknown[]) => {
      if (!found[name]) return { ok: false, status: -1, error: 'not found in the loaded chunks' }
      const fn = await found[name]()
      try {
        return { ok: true, status: 200, value: await fn(...args) }
      } catch (e) {
        const error = e as { status?: number; message?: string }
        return { ok: false, status: error.status ?? 0, error: String(error.message ?? e).slice(0, 200) }
      }
    }
    return w.__fns
  })
}

/** Calls one server function the way the page would. */
export async function callServerFn(page: Page, name: string, ...args: unknown[]): Promise<ServerFnResult> {
  await installServerFns(page)
  return page.evaluate(([n, a]) => (window as unknown as { __q: (n: string, ...a: unknown[]) => Promise<ServerFnResult> }).__q(n, ...a), [name, args] as const)
}

/** The server function a /_serverFn/ request calls, by the id in its URL
 * (installServerFns reads the ids off the chunks). */
export async function serverFnIds(page: Page): Promise<Record<string, string>> {
  await installServerFns(page)
  return page.evaluate(() => (window as unknown as { __ids: Record<string, string> }).__ids)
}
export const nameOfRequest = (ids: Record<string, string>, url: string): string | undefined => {
  const id = Object.keys(ids).find((key) => url.includes(key))
  return id ? ids[id] : undefined
}

/** What the page's query cache holds for a read: its key is [name, ...args]. */
export const queryData = (page: Page, name: string): Promise<unknown> =>
  page.evaluate((n) => {
    const client = (window as unknown as { __TSR_ROUTER__: { options: { context: { queryClient: { getQueriesData: (f: { queryKey: unknown[] }) => Array<[unknown, unknown]> } } } } }).__TSR_ROUTER__.options.context.queryClient
    return client.getQueriesData({ queryKey: [n] }).map(([, data]) => data).find((d) => d !== undefined) ?? null
  }, name)
