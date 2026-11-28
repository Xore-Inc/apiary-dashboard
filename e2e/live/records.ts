// The full-record fixes (dash#357 and #358), against the live dashboard.
//
// Event: the Suricata alert the page cites for its packet capture shows the
// decoded packet bytes (hex and printable) on the Overview, and the Raw tab
// holds the complete stored document, the packet's base64 included.
//
// Payload picker: the analysis dialog opened from a payload's own page keeps
// that sample selected and passes its first step (no "Pick a captured payload
// to analyze."), and the picker finds a sample by typing part of its hash, by
// kind in any case. The check never queues a run: it stops at the picker.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/run.ts
//   ONLY=records bun e2e/live/run.ts
import { SKELETON, base, check, done, fail, info, launch, requireSession, settle, shot, signedIn } from './lib'

const EVENT = 'v8i9IqIBRoScrgjujw8M'
const PACKET_B64 = 'AgGa81eUggGa81eUCABFYAAs1DEAAPgG2nqTuYWwV2qi69qFJwzL2gDLAAAAAGAC//+2LwAAAgQFtA=='
const PACKET_HEX = '02 01 9a f3 57 94 82 01  9a f3 57 94 08 00 45 60'
const PAYLOAD = '12013662c71da69de977c04cd7021f13a70cf7bed4ca6c82acbc100464d4b0ef'
const PAYLOAD_KIND = 'Linux ELF executable'

const browser = await launch()
const context = await signedIn(browser)
const page = await context.newPage()
const pageErrors: string[] = []
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)))

async function settledPage(label: string) {
  const t = Date.now()
  try {
    await page.waitForFunction((s) => document.querySelectorAll(s).length === 0, SKELETON, { timeout: 60_000 })
    check(true, `${label}: loaded`, `${Date.now() - t} ms`)
  } catch {
    fail(label, `${await page.locator(SKELETON).count()} skeletons after 60 s`)
  }
}

// ---- Event -----------------------------------------------------------------
await page.goto(`${base}/events/${EVENT}`, { waitUntil: 'domcontentloaded' })
await requireSession(page, browser)
await settledPage('event overview')
const overview = (await page.textContent('body')) ?? ''
check(overview.includes('Packet capture · 58 bytes'), 'event: packet capture section names the captured packet', 'Packet capture · 58 bytes')
check(overview.includes(PACKET_HEX), 'event: hex dump shows the decoded packet bytes', PACKET_HEX)
check(!overview.includes('full record on the event page'), 'event: the summary no longer points at a page that does not show the bytes')
await page.screenshot({ path: shot('event-overview-captured-bytes'), fullPage: true })

await page.goto(`${base}/events/${EVENT}/raw`, { waitUntil: 'domcontentloaded' })
await settledPage('event raw tab')
const raw = (await page.textContent('body')) ?? ''
check(raw.includes(`"packet": "${PACKET_B64}"`), 'event raw: the complete stored record shows the packet field', 'suricata.eve.packet')
check(raw.includes('"@timestamp": "2026-11-28T15:19:37.774Z"'), 'event raw: the stored @timestamp is in the record')
await page.screenshot({ path: shot('event-raw-record'), fullPage: true })

// ---- Payload picker --------------------------------------------------------
// The analysis dialog is administrator-only on both pages that open it
// (PayloadBlocks and the payload index use useIsAdmin). The uitest account is
// a viewer, so the picker runs only in an administrator session.
await page.goto(`${base}/payloads/${PAYLOAD}`, { waitUntil: 'domcontentloaded' })
await settledPage('payload page')
if ((await page.getByRole('button', { name: 'Operator actions' }).count()) === 0) {
  info('picker: SKIPPED, the analysis dialog is administrator-only and this session is a viewer; no administrator session is available to this run')
} else {
  await pickerChecks()
}

async function pickerChecks() {
  await page.getByRole('button', { name: 'Operator actions' }).click()
  await page.getByText('New analysis run', { exact: false }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 30_000 })
  await dialog.getByText(PAYLOAD_KIND).first().waitFor({ timeout: 30_000 })
  const opened = (await dialog.textContent()) ?? ''
  check(opened.includes(PAYLOAD), 'picker: opened from the payload page, its sample is selected')
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await dialog.getByText('Pick analyzers by hand').first().waitFor({ timeout: 30_000 }).catch(() => {})
  const stepped = (await dialog.textContent()) ?? ''
  check(!stepped.includes('Pick a captured payload to analyze.'), 'picker: the deep-linked sample passes the first step')
  check(stepped.includes('Analyzers'), 'picker: continues to the analyzers step')

  // Back to the sample step, then search the whole inventory by a hash prefix and by kind.
  await dialog.getByRole('button', { name: 'Back' }).click()
  await dialog.getByText(PAYLOAD_KIND).first().click()
  const search = page.getByPlaceholder('Hash prefix, kind, platform, MIME type, source')
  await search.waitFor({ timeout: 15_000 })
  await search.fill('elf')
  await page.waitForTimeout(1500)
  await settle(page)
  const byKind = (await page.textContent('body')) ?? ''
  check(byKind.includes(PAYLOAD.slice(0, 16)), 'picker: typing a kind (case-insensitive) finds the sample', 'elf')
  await search.fill('12013662c')
  await page.waitForTimeout(1500)
  await settle(page)
  const byPrefix = (await page.textContent('body')) ?? ''
  check(byPrefix.includes(PAYLOAD.slice(0, 16)) && byPrefix.includes('found'), 'picker: typing a hash prefix finds the sample', '12013662c')
  await page.screenshot({ path: shot('payload-picker-search'), fullPage: true })
}

// Close without queuing: Escape out of the picker and the dialog.
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
info(`page errors=${pageErrors.length}`)
for (const e of pageErrors) fail('uncaught page error', e)
await done(browser)
