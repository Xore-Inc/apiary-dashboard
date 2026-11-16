// A viewer is strictly read-only (APIARY#3857), as the viewer sees it:
// no write control is on screen (alerts, alert detail, canarytokens, the
// report-a-problem button), Settings shows the read-only note with every
// setting disabled and a click sends nothing, the report wizard says it is
// read-only; and a refused write leaves the state as it was (the alert
// lists and the preferences read back the same after a reload).
// authorization.ts proves every write is refused; this proves the screens.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/viewer-readonly.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { base, callServerFn, check, discover, done, fail, info, launch, pass, queryData, requireSession, settle, shot, shots, signedIn } from './lib'

const browser = await launch()
const context = await signedIn(browser)
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
const posts: Array<{ url: string; status: number }> = []
page.on('response', (r) => {
  if (r.url().includes('/_serverFn/') && r.request().method() === 'POST') posts.push({ url: r.url(), status: r.status() })
})

await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await requireSession(page, browser)
await settle(page)
const me = (await queryData(page, 'getSessionUser')) as { roles?: string[] } | null
if (!me?.roles || me.roles.includes('admin')) {
  console.log(`SKIP the session is not a viewer (${JSON.stringify(me?.roles ?? null)}): nothing to prove read-only`)
  await browser.close()
  process.exit(2)
}

const visible = async (role: 'button', name: RegExp) => (await page.getByRole(role, { name }).count()) > 0
const WRITE = /^(Acknowledge( \d+)?|Acknowledge all|Reopen)$/
for (const [href, where, name] of [
  ['/alerts', 'alerts New', WRITE],
  ['/alerts?view=acknowledged', 'alerts Acknowledged', WRITE],
  ['/canarytokens', 'canarytokens', /^Create token$/],
] as const) {
  await page.goto(`${base}${href}`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  await page.waitForTimeout(1000)
  check(!(await visible('button', name)), `${where}: no ${name} control`)
  await page.screenshot({ path: shot(where) })
}

/** The first alert's link on a list, as the page writes it, and its key. */
const firstAlert = async (view: string) => {
  const [href] = (await discover(page, `/alerts${view}`, /^\/alerts\/[^/?]+$/, 1)) as Array<string | undefined>
  return { href, key: href ? decodeURIComponent(href.replace('/alerts/', '')) : undefined }
}
const { href: openHref, key: openKey } = await firstAlert('')
const { href: ackedHref, key: ackedKey } = await firstAlert('?view=acknowledged')
info(`an open alert: ${openKey ? 'found' : '-'}; an acknowledged alert: ${ackedKey ? 'found' : '-'}`)
if (openHref) {
  await page.goto(`${base}${openHref}`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  await page.waitForTimeout(1000)
  check(!(await visible('button', /^(Acknowledge( \d+)?|Reopen)$/)), 'alert detail: no Acknowledge or Reopen')
  await page.screenshot({ path: shot('alert detail') })
}
check(!(await page.getByRole('button', { name: 'Report a problem' }).count()), 'no Report a problem button')

await page.goto(`${base}/?settings=appearance`, { waitUntil: 'load', timeout: 90_000 })
const reduced = page.getByRole('radio', { name: 'Reduced' })
await reduced.waitFor({ timeout: 30_000 }).catch(() => fail('settings', 'the Appearance pane did not open'))
await page.waitForTimeout(1000)
const note = await page.getByText('Read-only for viewers').count()
const enabledRadios = await page.locator('[role="radiogroup"] [role="radio"]:not([disabled]):not([aria-disabled="true"])').count()
const enabledSwitches = await page.locator('[role="switch"]:not([disabled]):not([aria-disabled="true"])').count()
await page.screenshot({ path: shot('settings appearance') })
check(note > 0 && enabledRadios === 0 && enabledSwitches === 0, 'settings: read-only note, every radio and switch disabled', `note=${note} enabled radios=${enabledRadios} switches=${enabledSwitches}`)
const p0 = posts.length
await reduced.click({ force: true, timeout: 3000 }).catch(() => {})
await page.waitForTimeout(1500)
check(posts.length === p0, 'settings: clicking a disabled setting sends nothing', `${posts.length - p0} POST(s)`)

await page.goto(`${base}/reports/generate`, { waitUntil: 'load', timeout: 90_000 })
await settle(page)
await page.screenshot({ path: shot('reports generate') })
check((await page.getByText('Read-only for viewers').count()) > 0, 'report wizard: read-only note')

/** The alert lists and the stored preferences, as a fresh load shows them. */
const snapshot = async () => {
  const rows = async (href: string) => {
    await page.goto(`${base}${href}`, { waitUntil: 'load', timeout: 90_000 })
    await settle(page)
    return page.getByRole('row').count()
  }
  const newRows = await rows('/alerts')
  const ackedRows = await rows('/alerts?view=acknowledged')
  await page.goto(`${base}/?settings=appearance`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  const prefs = await queryData(page, 'getPreferences')
  const html = await page.evaluate(() => ({ motion: document.documentElement.getAttribute('data-motion'), theme: document.documentElement.getAttribute('data-theme') }))
  return { newRows, ackedRows, prefs, html }
}
const before = await snapshot()
info(`before: new rows ${before.newRows}, acknowledged rows ${before.ackedRows}`)
await page.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await settle(page)
// The writes a viewer's screens would make, refused: the state must hold.
// Inert first (an empty list, the stored preferences unchanged): if one of
// those is accepted the guard is broken and nothing that changes data is
// sent. Only then the changing ones, each undone at once should it ever be
// accepted.
const refusedCall = async (name: string, args: unknown[]) => {
  const r = await callServerFn(page, name, ...args)
  const ok = !r.ok && (r.status === 403 || /: 403 forbidden/.test(r.error ?? ''))
  check(ok, `${name} refused 403`, ok ? '' : JSON.stringify(r).slice(0, 200))
  return { ok, accepted: r.ok }
}
const prefs = (before.prefs ?? {}) as Record<string, unknown>
const inert: Array<[string, unknown[]]> = [
  ['setAlertsAcknowledged', [[], true]],
  ['savePreferences', [prefs]],
]
let allRefused = true
for (const [name, args] of inert) allRefused = (await refusedCall(name, args)).ok && allRefused
if (!allRefused) {
  fail('changing writes', 'not sent: a harmless write was not refused, so the guard is broken')
} else {
  const changing: Array<{ name: string; args: unknown[]; undo: unknown[] }> = []
  if (openKey) changing.push({ name: 'setAlertsAcknowledged', args: [[openKey], true], undo: [[openKey], false] })
  if (ackedKey) changing.push({ name: 'setAlertsAcknowledged', args: [[ackedKey], false], undo: [[ackedKey], true] })
  changing.push({ name: 'savePreferences', args: [{ ...prefs, motion: prefs.motion === 'reduced' ? 'system' : 'reduced' }], undo: [prefs] })
  for (const write of changing) {
    const r = await refusedCall(write.name, write.args)
    allRefused &&= r.ok
    if (r.accepted) {
      const undone = await callServerFn(page, write.name, ...write.undo)
      fail(`${write.name} was ACCEPTED`, `undone: ${undone.ok ? 'yes' : `NO (${undone.error ?? undone.status}), restore by hand`}`)
      break
    }
  }
}
const after = await snapshot()
info(`after reload: new rows ${after.newRows}, acknowledged rows ${after.ackedRows}`)
// Alerts come and go on a live dashboard: only the refused rows must hold.
for (const [label, href, view, other] of [
  ['open', openHref, '', '?view=acknowledged'],
  ['acknowledged', ackedHref, '?view=acknowledged', ''],
] as const) {
  if (!href) continue
  // It must not have moved to the other list. (A live alert can also age out
  // of its own list's first page, so absence there alone is no finding.)
  await page.goto(`${base}/alerts${other}`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  const moved = (await page.locator(`a[href="${href}"]`).count()) > 0
  await page.goto(`${base}/alerts${view}`, { waitUntil: 'load', timeout: 90_000 })
  await settle(page)
  const still = (await page.locator(`a[href="${href}"]`).count()) > 0
  check(!moved, `the ${label} alert is still ${label}`, still ? 'on its list' : 'not on the first page of its list, and not on the other one')
}
check(JSON.stringify(after.prefs) === JSON.stringify(before.prefs) && JSON.stringify(after.html) === JSON.stringify(before.html), 'preferences unchanged after reload')
if (!allRefused) fail('a write was not refused', 'see above')
check(posts.every((p) => p.status === 403), 'every server-function POST was refused', posts.map((p) => p.status).join(',') || 'none')
if (errors.length) fail('page errors', errors.join(' | '))
else pass('no page errors')
writeFileSync(join(shots, 'viewer-state.json'), JSON.stringify({ before, after, posts: posts.map((p) => p.status) }, null, 2))
await done(browser)
