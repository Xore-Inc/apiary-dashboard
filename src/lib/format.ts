// Number and time formatting. Times follow the operator's preferences (time
// zone, 12/24-hour clock, relative or absolute) set once per render by the
// root; server and client format identically. A "browser" time zone renders
// as UTC until the page is mounted, then switches (so hydration matches).

const numberFormat = new Intl.NumberFormat('en-US')
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export type TimeSettings = { timeZone: string; hour12: boolean; relative: boolean; now: () => number }

let settings: TimeSettings = { timeZone: 'UTC', hour12: false, relative: false, now: () => Date.now() }
let formats = build(settings)

function build(s: TimeSettings) {
  const base = { timeZone: s.timeZone, hour12: s.hour12 }
  return {
    time: new Intl.DateTimeFormat('en-GB', { ...base, hour: '2-digit', minute: '2-digit' }),
    dateTime: new Intl.DateTimeFormat('en-GB', { ...base, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    day: new Intl.DateTimeFormat('en-GB', { timeZone: s.timeZone, month: 'short', day: '2-digit' }),
    zone: s.timeZone === 'UTC' ? 'UTC' : (new Intl.DateTimeFormat('en-GB', { timeZone: s.timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? s.timeZone),
  }
}

/** Set how times read; called by the root with the operator's preferences. */
export function configureTime(next: Partial<TimeSettings>) {
  const merged = { ...settings, ...next }
  if (merged.timeZone === settings.timeZone && merged.hour12 === settings.hour12 && merged.relative === settings.relative && merged.now === settings.now) return
  settings = merged
  formats = build(settings)
}

/** The configured clock: the wall clock, or the mock tier's fixed one. */
export const now = () => settings.now()

/** The short name of the zone times are shown in, e.g. UTC or CEST. */
export const zoneLabel = () => formats.zone

export const formatNumber = (value: number) => numberFormat.format(value)
export const formatCompact = (value: number) => compactFormat.format(value)
export const formatTime = (iso: string) => `${formats.time.format(new Date(iso))} ${formats.zone}`
export const formatDay = (iso: string) => formats.day.format(new Date(iso))

/** Time of day only, for table cells whose header names the zone. */
export const formatClock = (iso: string) => formats.time.format(new Date(iso))

/** "5 min ago", or "in 3 h" for what is still to come (a scheduled run,
 * an expiry), from the (mock) clock, for the relative-timestamps preference. */
export function formatRelative(iso: string): string {
  const signed = Math.round((settings.now() - Date.parse(iso)) / 1000)
  const seconds = Math.abs(signed)
  if (seconds < 45) return 'just now'
  const say = (amount: string) => (signed < 0 ? `in ${amount}` : `${amount} ago`)
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return say(`${minutes} min`)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return say(`${hours} h`)
  const days = Math.round(hours / 24)
  return days < 30 ? say(`${days} d`) : formatDay(iso)
}

/** A full timestamp: relative or absolute, as the operator prefers. */
export const formatDateTime = (iso: string) => (settings.relative ? formatRelative(iso) : `${formats.dateTime.format(new Date(iso))} ${formats.zone}`)

/** Signed percentage change, e.g. "+12.4%". */
export function formatChange(value: number, previous: number): string {
  if (previous === 0) return value === 0 ? '0%' : 'new'
  const pct = ((value - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

/** An autonomous system as one label: `AS64512 · Example Hosting`. Either
 * half may be missing (no number known, no organization); both missing is ''. */
export const formatAs = (asn: string, org: string) => [asn, org].filter(Boolean).join(' · ')
