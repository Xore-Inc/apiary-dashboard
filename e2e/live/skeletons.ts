// Every kind of page loads in a browser, on a full load: the page paints its
// own layout (its title), every skeleton placeholder is replaced by data,
// nothing shows an error state, nothing throws. One page per route shape,
// from the crawl (crawl.ts writes SHOTS_DIR/samples.json; SAMPLES names
// another file). A missing entity shows the not-found page.
//
// The mock's slow scenario also proved the skeleton paints before any data
// arrives; a live backend answers too fast to see that reliably, so this
// check proves the end state only (see README.md).
//
//   BETA_URL=… BETA_STORAGE_STATE=… SAMPLES=…/samples.json bun e2e/live/skeletons.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright-core'
import { ERROR_TITLES, SKELETON, base, check, done, info, launch, requireSession, shots, signedIn } from './lib'

const file = process.env.SAMPLES ?? join(shots, 'samples.json')
if (!existsSync(file)) {
  console.log(`SKIP no samples file (${file}): run crawl.ts first, or set SAMPLES`)
  process.exit(2)
}
const samples: string[] = JSON.parse(readFileSync(file, 'utf8'))
const SKIP = /^\/(api|auth|export)\//
const FIRST_PAINT_MS = 30_000
const LOADED_MS = 60_000

// One page per route, whatever its id.
const routeOf = (path: string) => {
  const segments = path.split('?')[0].split('/')
  return segments.map((segment, i) => (i === 2 && segments.length > 2 && segment ? ':id' : segment)).join('/')
}
const byRoute = new Map<string, string>()
for (const path of samples) if (!SKIP.test(path) && !byRoute.has(routeOf(path))) byRoute.set(routeOf(path), path)
const pages = [...byRoute.values()]

const browser = await launch()
const context = await signedIn(browser)
{
  const page = await context.newPage()
  await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
  await requireSession(page, browser)
  await page.close()
}

const findings: string[] = []
async function visit(ctx: BrowserContext, path: string) {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  await page.goto(base + path, { waitUntil: 'commit', timeout: 90_000 })
  try {
    await page.locator('h1').first().waitFor({ timeout: FIRST_PAINT_MS })
  } catch {
    findings.push(`${path}: no page title within ${FIRST_PAINT_MS / 1000} s`)
    await page.close()
    return
  }
  try {
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 0, SKELETON, { timeout: LOADED_MS })
  } catch {
    findings.push(`${path}: skeleton still showing after ${LOADED_MS / 1000} s`)
  }
  const text = await page.locator('main, body').first().innerText()
  for (const title of ERROR_TITLES) if (text.includes(title)) findings.push(`${path}: shows "${title}"`)
  for (const error of errors) findings.push(`${path}: ${error}`)
  await page.close()
}

const queue = [...pages]
await Promise.all(
  Array.from({ length: Number(process.env.PARALLEL ?? 2) }, async () => {
    for (let path = queue.shift(); path; path = queue.shift()) await visit(context, path)
  }),
)
info(`checked ${pages.length} kinds of page`)
check(findings.length === 0, 'every kind of page paints, then replaces its skeletons with data', findings.slice(0, 20).join('; '))

{
  const page = await context.newPage()
  await page.goto(`${base}/sources/10.0.0.1`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForTimeout(2000)
  check(await page.getByText('Nothing to show').first().isVisible().catch(() => false), 'a missing source shows the not-found page')
  await page.close()
}
await done(browser)
