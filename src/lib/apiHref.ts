// Links to the files the dashboard serves (/api/...), with their search
// built the way the download routes read it: empty values are left out.

export function apiHref(path: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value))
  const query = search.toString()
  return query ? `${path}?${query}` : path
}
