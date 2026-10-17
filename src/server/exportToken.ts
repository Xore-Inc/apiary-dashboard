// The export-only machine credential: `X-Export-Token` equal to this
// process's EXPORT_TOKEN. It opens the blocklist export and nothing else, so
// the VPS job that pulls the list holds no secret that reaches the backend.
// Compared in constant time, and never matched while EXPORT_TOKEN is unset
// (the default: machine access to the export is then off).
import { timingSafeEqual } from 'node:crypto'

export function hasExportToken(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const expected = env.EXPORT_TOKEN ?? ''
  if (!expected) return false
  const given = Buffer.from(request.headers.get('x-export-token') ?? '')
  const want = Buffer.from(expected)
  return given.length === want.length && timingSafeEqual(given, want)
}
