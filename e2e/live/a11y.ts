// Accessibility gate: axe-core (WCAG 2.1 A/AA) over every kind of page, the
// overview's views, the graphs, the dialogs, and the phone layout, on the
// live dashboard as the viewer sees it. Any violation not exempted, with a
// reason, in docs/baselines/accessibility.json fails the run.
//
// The sign-in page is the identity provider's on a live dashboard, and the
// report-a-problem dialog is not offered to a viewer: neither is checked here.
//
//   BETA_URL=… BETA_STORAGE_STATE=… bun e2e/live/a11y.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { devices } from 'playwright-core'
import type { Page } from 'playwright-core'
import { base, check, discover, done, info, launch, requireSession, signedIn } from './lib'

const root = join(import.meta.dirname, '..', '..')
const axeSource = readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8')
const baseline = JSON.parse(readFileSync(join(root, 'docs/baselines/accessibility.json'), 'utf8')) as { exemptions: Array<{ rule: string; match: string[]; reason: string }> }

const browser = await launch()
// A source and a payload of the live data, found from their lists.
const finder = await signedIn(browser)
const probe = await finder.newPage()
await probe.goto(`${base}/alerts`, { waitUntil: 'load', timeout: 90_000 })
await requireSession(probe, browser)
const [SOURCE = '/sources/192.0.2.1'] = await discover(probe, '/ips', /^\/sources\/[^/?]+$/, 1)
const [PAYLOAD_PAGE] = (await discover(probe, '/payloads', /^\/payloads\/[0-9a-f]{32,64}$/, 1)) as Array<string | undefined>
const PAYLOAD = PAYLOAD_PAGE?.split('/')[2] ?? '0'.repeat(64)
info(`a source and a payload: ${SOURCE.startsWith('/sources/') ? 'found' : '-'}, ${PAYLOAD_PAGE ? 'found' : '-'}`)
await finder.close()

type Visit = { path: string; then?: (page: Page) => Promise<void> }
/** Opens a dialog, menu or view by the control's name, whatever its role. */
const open = (name: string | RegExp) => async (page: Page) => {
  const control = page.getByRole('button', { name }).or(page.getByRole('radio', { name })).or(page.getByRole('tab', { name })).first()
  await control.click({ timeout: 10_000 })
  await page.waitForTimeout(800)
}

const DESKTOP: Visit[] = [
  { path: '/' },
  { path: '/?view=health' },
  { path: '/?view=threats' },
  { path: '/?view=behavior' },
  { path: '/?view=evidence' },
  { path: '/events' },
  { path: SOURCE },
  { path: SOURCE, then: open('Graph') },
  { path: '/attackers' },
  { path: '/kill-chain' },
  { path: '/campaigns' },
  { path: '/iocs' },
  { path: '/recordings' },
  { path: `/payloads/${PAYLOAD}` },
  { path: `/payloads/${PAYLOAD}`, then: open('Payload report') },
  { path: `/payloads/${PAYLOAD}/ghidra?section=code` },
  { path: `/payloads/${PAYLOAD}/sandbox` },
  { path: '/payload-workbench/results' },
  { path: '/alerts' },
  { path: '/ml-anomalies' },
  { path: '/source-health' },
  { path: '/topology' },
  { path: '/reports/generate' },
  { path: '/reports/history' },
  { path: '/canarytokens' },
  { path: '/events?settings=appearance' },
  { path: '/events?settings=behavior' },
  { path: '/auth/callback?code=expired' },
  { path: '/no-such-page' },
]
const PHONE: Visit[] = [{ path: '/' }, { path: '/events' }, { path: '/', then: open('Open navigation') }]

// An exemption names its rule and the substrings every exempted node shows.
const exempt = (rule: string, node: string) => baseline.exemptions.some((e) => e.rule === rule && e.match.every((part) => node.includes(part)))
const findings: string[] = []
let checked = 0
for (const [label, options, visits] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }, DESKTOP],
  ['phone', { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } }, PHONE],
] as const) {
  // axe is injected as an inline script, which the page's CSP refuses.
  const context = await signedIn(browser, { ...options, bypassCSP: true })
  const page = await context.newPage()
  for (const visit of visits) {
    await page.goto(base + visit.path, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    if (visit.then) await visit.then(page).catch((e: Error) => findings.push(`${label} ${visit.path}: could not open (${e.message.split('\n')[0]})`))
    await page.addScriptTag({ content: axeSource })
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[]; html: string }> }> }> } }).axe
      const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
      return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 120)}`) }))
    })
    checked++
    for (const v of violations) {
      const remaining = v.nodes.filter((node) => !exempt(v.id, node))
      if (remaining.length) findings.push(`${label} ${visit.path}${visit.then ? ' (opened)' : ''}: ${v.id} [${v.impact}] ${v.help}\n    ${remaining.slice(0, 3).join('\n    ')}`)
    }
  }
  await context.close()
}

info(`checked ${checked} views against WCAG 2.1 A/AA (${baseline.exemptions.length} documented exemption${baseline.exemptions.length === 1 ? '' : 's'})`)
check(findings.length === 0, 'no accessibility violation', findings.length ? `\n${findings.join('\n')}` : '')
await done(browser)
