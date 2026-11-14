// Old entity tab paths whose content was folded into another tab. Their
// routes redirect in beforeLoad, but a browser's first load is rendered as a
// skeleton without loaders (lib/pageSsr), so the server painted the old path
// and the client redirected while hydrating: a hydration mismatch (#299).
// The production server answers these with a 301 before rendering anything.

/** A path parameter as typed: decoded once, whether or not the router did. */
const plain = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
const breakdown = ({ ip }: Record<string, string>) => `/sources/${encodeURIComponent(plain(ip))}/breakdown`

/** Bun route pattern → the path it moved to. */
export const FOLDED_TAB_ROUTES: Record<string, (params: Record<string, string>) => string> = {
  '/sources/:ip/alerts': breakdown,
  '/sources/:ip/commands': breakdown,
  '/sources/:ip/credentials': breakdown,
}

/** The 301 for a folded tab, keeping the query string. */
export function foldedTabRedirect(request: Request, target: string): Response {
  const { search } = new URL(request.url)
  return new Response(null, { status: 301, headers: { location: `${target}${search}` } })
}
