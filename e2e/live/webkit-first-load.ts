// The first page after sign-in, in WebKit on a phone (dash#341).
//
// Safari and every browser on iOS lack requestIdleCallback. The root route
// used it unguarded, but only on the first visit: until the browser's time
// zone is in its cookie the server renders UTC, and the effect that leaves the
// zone behind reaches the call. After a reload the cookie is there and the call
// never runs, so nothing but a first load shows it, and Chromium never does.
//
// The session comes from BETA_STORAGE_STATE with the zone cookie dropped from
// an in-memory copy (the file is never written), the zone differs from UTC so
// the effect has something to refresh, and the callbacks are removed from the
// page whether or not this WebKit build has them. The page must not throw and
// must not show an error state, and the cookie must have been written, which
// proves the effect ran.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/webkit-first-load.ts
import { devices } from 'playwright-core'
import { ERROR_TITLES, SKELETON, base, check, done, fail, info, launchWebkit, requireSession, settle, shot, statePath } from './lib'

const ZONE_COOKIE = 'apiary.tz'
const state = (await Bun.file(statePath).json()) as { cookies: Array<{ name: string }> }
const storageState = { ...state, cookies: state.cookies.filter((c) => c.name !== ZONE_COOKIE) } as never

const browser = await launchWebkit()
const context = await browser.newContext({ ...devices['iPhone 13'], storageState, timezoneId: 'Pacific/Auckland' })
await context.addInitScript(() => {
  // Not every WebKit build is without them; the page must cope with none.
  Reflect.deleteProperty(window, 'requestIdleCallback')
  Reflect.deleteProperty(window, 'cancelIdleCallback')
})
check(!(await context.cookies()).some((c) => c.name === ZONE_COOKIE), 'the session has no zone cookie before the load')
const page = await context.newPage()
const pageErrors: string[] = []
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)))
// React catches a render error and shows the boundary: the console has it.
const consoleErrors: string[] = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
})

await page.goto(base + '/', { waitUntil: 'load', timeout: 90_000 })
await requireSession(page, browser)
check(
  await page.evaluate(() => typeof (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === 'undefined'),
  'the page has no requestIdleCallback',
)
try {
  await page.waitForFunction((s) => document.querySelectorAll(s).length === 0, SKELETON, { timeout: 60_000 })
} catch {
  fail('first load', `${await page.locator(SKELETON).count()} skeletons after 60 s`)
}
await settle(page, 15_000)
// The effect runs after hydration; give an idle callback's fallback time too.
await page.waitForTimeout(3000)

const text = await page.locator('main, body').first().innerText()
for (const title of [...ERROR_TITLES, 'Something went wrong']) check(!text.includes(title), `no "${title}" on the first load`)
check(pageErrors.length === 0, 'no uncaught page error', pageErrors.join(' | '))
check(!consoleErrors.some((e) => /idle ?callback/i.test(e)), 'no console error about the idle callback', consoleErrors.join(' | '))
const zone = (await context.cookies(base)).find((c) => c.name === ZONE_COOKIE)
check(zone !== undefined, 'the zone cookie was written, so the effect that needed the idle callback ran', zone ? decodeURIComponent(zone.value) : 'no cookie')
await page.screenshot({ path: shot('webkit first load') })
info(`engine ${browser.version()}, ${page.viewportSize()?.width}x${page.viewportSize()?.height}`)
await done(browser)
