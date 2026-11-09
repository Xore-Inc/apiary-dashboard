// A state-changing server function, called the way an operator calls it
// (#291): from a hydrated page, through Start's client, with the dashboard's
// own fetch. Saving a personal preference (Settings → Appearance) must reach
// the server with the CSRF header and be answered, and the same call without
// the header must still be refused by the same-origin rule (server/origin.ts).
// The original value is put back afterwards.
//
//   bun scripts/csrf.ts http://localhost:3000
//
// Uses Chrome (CHROME_PATH, else /usr/bin/google-chrome); exits 2 when no
// browser is available so callers can skip.
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import type { Browser, Request } from 'playwright-core'
import { signInContext } from './lib/signIn'

const base = process.argv[2] ?? 'http://localhost:3000'
const CSRF_HEADER = 'x-csrf-token'

async function launch(): Promise<Browser | undefined> {
  const executablePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)
  try {
    return await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  } catch {
    return undefined
  }
}

const browser = await launch()
if (!browser) {
  console.log('no browser available (set CHROME_PATH); CSRF round trip skipped')
  process.exit(2)
}

const failures: string[] = []
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await signInContext(context, base)
const page = await context.newPage()

interface Call {
  url: string
  status: number
  csrf: boolean
  /** The request as the browser sent it, to replay without the header. */
  headers: Record<string, string>
  body: string | null
}
const posts: Call[] = []
page.on('response', async (response) => {
  const request: Request = response.request()
  if (request.method() !== 'POST' || !response.url().includes('/_serverFn/')) return
  const headers = await request.allHeaders()
  posts.push({ url: response.url(), status: response.status(), csrf: CSRF_HEADER in headers, headers, body: request.postData() })
})

await page.goto(`${base}/?settings=appearance`, { waitUntil: 'load' })
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
const radios = page.getByRole('radio')
const count = await radios.count()
let original = -1
for (let i = 0; i < count && original < 0; i++) if (await radios.nth(i).isChecked()) original = i
if (original < 0) failures.push(`no checked radio in the Appearance pane (${count} radios)`)
else {
  const other = original === 0 ? 1 : 0
  const saved = async (from: number) => {
    const deadline = Date.now() + 10_000
    while (posts.length <= from && Date.now() < deadline) await page.waitForTimeout(100)
  }
  await radios.nth(other).check({ force: true })
  await saved(0)
  await radios.nth(original).check({ force: true })
  await saved(1)

  if (posts.length < 2) failures.push(`expected a save and a restore, saw ${posts.length} POST server function call(s)`)
  for (const call of posts) {
    if (!call.csrf) failures.push(`POST ${new URL(call.url).pathname} was sent without ${CSRF_HEADER}`)
    if (call.status !== 200) failures.push(`POST ${new URL(call.url).pathname} answered ${call.status}`)
  }
  console.log(`  ${posts.length} POST server function call(s): ${posts.map((c) => `${c.status}${c.csrf ? ' csrf' : ' no-csrf'}`).join(', ') || 'none'}`)

  // The same call, replayed from this origin without the header: still
  // refused by the same-origin rule, before the handler runs.
  if (posts[0]) {
    const { [CSRF_HEADER]: _dropped, cookie: _cookie, ...rest } = posts[0].headers
    const bare = await context.request.post(posts[0].url, { headers: { ...rest, origin: base }, data: posts[0].body ?? '' })
    const body = await bare.text()
    console.log(`  without ${CSRF_HEADER}: ${bare.status()} ${body.slice(0, 80)}`)
    if (bare.status() !== 403 || !body.includes('Cross-origin request rejected')) failures.push(`a POST without ${CSRF_HEADER} answered ${bare.status()}, not the same-origin refusal`)
  }
}

await browser.close()
if (failures.length) {
  for (const failure of failures) console.log(`  FAIL ${failure}`)
  process.exit(1)
}
console.log('  ok   a hydrated page saves a preference with the CSRF header; a call without it is refused')
