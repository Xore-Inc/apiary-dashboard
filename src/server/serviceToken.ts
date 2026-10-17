// The machine credential: `X-Service-Token` equal to this process's
// SERVICE_TOKEN (or SERVICE_TOKEN_FILE, see secret.ts). Compared in constant time, and never matched while
// SERVICE_TOKEN is unset, so an instance without the secret has no machine
// access at all (the boot policy in policy.ts refuses that case anyway).
import { timingSafeEqual } from 'node:crypto'
import { secretValue } from './secret'

export function hasServiceToken(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  const expected = secretValue('SERVICE_TOKEN', env)
  if (!expected) return false
  const given = Buffer.from(request.headers.get('x-service-token') ?? '')
  const want = Buffer.from(expected)
  return given.length === want.length && timingSafeEqual(given, want)
}
