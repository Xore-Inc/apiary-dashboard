// Where sign-in sends the operator back to. Only a path on this dashboard is
// accepted: anything that could leave it (another origin, a protocol-relative
// `//host`, a backslash that browsers read as a slash) falls back to the
// overview, so a crafted link cannot bounce a fresh session elsewhere.

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/'
  if (value.startsWith('//') || value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 0x20)) return '/'
  return value
}

/** Where a fresh sign-in lands: the safe return path, normalized as a URL
 * path on this dashboard. */
export function returnAfterSignIn(returnTo: string): string {
  const url = new URL(safeReturnTo(returnTo), 'http://dashboard.invalid')
  return `${url.pathname}${url.search}${url.hash}`
}
