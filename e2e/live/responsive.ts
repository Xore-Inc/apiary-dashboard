// Every kind of page at phone, tablet, laptop and 4K widths, on the live
// dashboard: nothing may scroll sideways, no top-bar control may leave the
// screen or overlap another, the shell must fit the window, and no page may
// throw or log a console error.
//
//   BETA_URL=… BETA_STORAGE_STATE=… bun e2e/live/responsive.ts
import { devices } from 'playwright-core'
import { base, check, discover, done, info, launch, requireSession, signedIn } from './lib'

const browser = await launch()
const finder = await signedIn(browser)
const probe = await finder.newPage()
await probe.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await requireSession(probe, browser)
const [SOURCE = '/sources/192.0.2.1'] = await discover(probe, '/ips', /^\/sources\/[^/?]+$/, 1)
const [PAYLOAD = `/payloads/${'0'.repeat(64)}`] = await discover(probe, '/payloads', /^\/payloads\/[0-9a-f]{32,64}$/, 1)
await finder.close()

const PAGES = ['/', '/?view=behavior', '/events', SOURCE, `${PAYLOAD}/ghidra?section=code`, '/payload-workbench/results', '/kill-chain', '/alerts', '/reports/history', '/auth/callback?code=expired']

const SIZES = [
  { name: 'phone', options: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
  { name: 'tablet', options: { viewport: { width: 768, height: 1024 } } },
  { name: 'laptop', options: { viewport: { width: 1440, height: 900 } } },
  { name: '4k', options: { viewport: { width: 3840, height: 2160 } } },
]

const findings: string[] = []
let checked = 0
for (const size of SIZES) {
  const context = await signedIn(browser, size.options)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  // Every console error counts, 404s included: nothing is filtered out.
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`)
  })
  for (const path of PAGES) {
    errors.length = 0
    await page.goto(base + path, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    checked++
    const layout = await page.evaluate(() => {
      const doc = document.documentElement
      const bar = document.querySelector('nav[aria-label="Page header"]')
      const controls = bar
        ? [...bar.querySelectorAll('button, a, [role="combobox"]')]
            .filter((el) => el.closest('[aria-hidden="true"], [inert]') === null)
            .map((el) => ({ label: el.getAttribute('aria-label') ?? (el.textContent.trim().slice(0, 30) || el.tagName), box: el.getBoundingClientRect() }))
            .filter((c) => c.box.width > 0 && c.box.height > 0)
        : []
      const outside = controls.filter((c) => c.box.left < -1 || c.box.right > innerWidth + 1).map((c) => c.label)
      const overlaps: string[] = []
      controls.forEach((a, i) =>
        controls.slice(i + 1).forEach((b) => {
          // Nested controls (a button inside a link) are not an overlap.
          const nested = a.box.left <= b.box.left && a.box.right >= b.box.right && a.box.top <= b.box.top && a.box.bottom >= b.box.bottom
          const nestedB = b.box.left <= a.box.left && b.box.right >= a.box.right && b.box.top <= a.box.top && b.box.bottom >= a.box.bottom
          const x = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
          const y = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
          if (!nested && !nestedB && x > 2 && y > 2) overlaps.push(`${a.label} × ${b.label}`)
        }),
      )
      const shell = document.querySelector('.astryx-app-shell')?.getBoundingClientRect()
      return { scrollWidth: doc.scrollWidth, innerWidth, outside, overlaps, shellTaller: shell ? shell.height > innerHeight + 1 : false }
    })
    const where = `${size.name} ${path}`
    if (layout.scrollWidth > layout.innerWidth + 1) findings.push(`${where}: scrolls sideways (${layout.scrollWidth} > ${layout.innerWidth})`)
    if (layout.outside.length) findings.push(`${where}: top bar controls off screen: ${layout.outside.join(', ')}`)
    if (layout.overlaps.length) findings.push(`${where}: top bar controls overlap: ${layout.overlaps.join('; ')}`)
    if (layout.shellTaller) findings.push(`${where}: the shell is taller than the window`)
    if (errors.length) findings.push(`${where}: ${errors.join(' | ')}`)
  }
  await context.close()
}
info(`checked ${checked} pages at ${SIZES.map((s) => s.name).join(', ')}`)
check(findings.length === 0, 'every size fits', findings.length ? `\n${findings.join('\n')}` : '')
await done(browser)
