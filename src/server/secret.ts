// One reader for a secret that may arrive inline (`<NAME>`) or as a file
// (`<NAME>_FILE`, the swarm secret form: a path under /run/secrets). Exactly
// one of the two; both set, or a file that cannot be read or holds nothing,
// is a refusal the caller turns into a boot failure or a closed door, never
// a silent run without the secret. Server-only.
import { readFileSync } from 'node:fs'

type Env = Record<string, string | undefined>
export type SecretResult = { kind: 'unset' } | { kind: 'value'; value: string; source: string } | { kind: 'refuse'; message: string }

// A file secret is a deployed value, replaced by a redeploy, never at
// runtime: read once per path. Refusals are not cached, so the boot check
// and tests always see the current state.
const fileCache = new Map<string, string>()

/** Reads `<name>` or `<name>_FILE` from `env`. Inline is returned as set; the
 * file's trailing newline is dropped; a file with no content refuses. The
 * message carries the variable names and path, never the secret. */
export function readSecret(name: string, env: Env = process.env, gateCode?: string): SecretResult {
  const lead = gateCode ? `[${gateCode}] refusing to start: ` : ''
  const refuse = (detail: string): SecretResult => ({ kind: 'refuse', message: `${lead}${detail}` })
  const inline = env[name]
  const path = env[`${name}_FILE`]?.trim()
  const hasInline = inline !== undefined && inline.trim() !== ''
  if (hasInline && path) return refuse(`both ${name} and ${name}_FILE are set. Set exactly one.`)
  if (!path) return hasInline ? { kind: 'value', value: inline, source: name } : { kind: 'unset' }
  let value = fileCache.get(path)
  if (value === undefined) {
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      return refuse(`${name}_FILE (${path}) cannot be read.`)
    }
    value = text.replace(/[\r\n]+$/, '')
    if (value.trim() === '') return refuse(`${name}_FILE (${path}) is empty.`)
    fileCache.set(path, value)
  }
  return { kind: 'value', value, source: `${name}_FILE` }
}

/** The secret's value, or '' when unset or refused: for the places that
 * compare or send it, where "" already means "no secret, no access". The boot
 * policy reports a refusal; this never throws. */
export const secretValue = (name: string, env: Env = process.env): string => {
  const result = readSecret(name, env)
  return result.kind === 'value' ? result.value : ''
}
