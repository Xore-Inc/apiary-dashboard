// Pure helpers both sides of the data seam use: the page (in the browser
// and during SSR) and the server. Nothing here holds or reads data.
import type { AlertGroup, ReportDefinition } from './types'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const RANGE_MS: Record<string, number> = { '1h': HOUR, '6h': 6 * HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }

/** Whether a timestamp falls inside an app-wide range (`all` for any), counted
 * back from `now`: the caller's clock, the wall clock unless a test fixes it. */
export function inRange(at: string, range?: string, now: number = Date.now()): boolean {
  if (range === 'all') return true
  return now - Date.parse(at) <= (RANGE_MS[range ?? '24h'] ?? DAY)
}

/** An alert group's key: its id without the acknowledged flag. */
export const alertKeyOf = (group: AlertGroup) => group.id.replace(/\|(true|false)$/, '')

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^&*'

/** A random password from an alphabet without look-alike characters. */
export function generatePassword(length = 16): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join('')
}

/** Credentials, tokens and cookies out of free text (problem reports). */
export function redact(text: string): string {
  return text
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[redacted jwt]')
    .replace(/\b(bearer)\s+[\w.~+/-]{8,}=*/gi, '$1 [redacted]')
    .replace(/\b(authorization|cookie|set-cookie|x-api-key|api[_-]?key|token|access_token|refresh_token|session|password|passwd|secret)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, '$1$2[redacted]')
}

/** The first time a report schedule fires strictly after `after` (UTC). */
export function nextScheduledRun(schedule: NonNullable<ReportDefinition['schedule']>, after: number): string {
  const t = new Date(after)
  t.setUTCHours(schedule.hour, schedule.minute, 0, 0)
  const matches = (d: Date) => (schedule.frequency === 'weekly' ? d.getUTCDay() === schedule.weekday : schedule.frequency === 'monthly' ? d.getUTCDate() === schedule.monthDay : true)
  while (t.getTime() <= after || !matches(t)) t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString()
}
