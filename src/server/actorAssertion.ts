// The signed operator identity the BFF sends the backend (#249; backend side:
// APIARY docs/BACKEND-TRUST-BOUNDARY.md, `trust.rs::verify`).
//
// A compact JWS, `{"alg":"EdDSA","typ":"JWT"}`, signed with an Ed25519 key
// that is NOT `SERVICE_TOKEN`, minted per call and bound to one request by
// `htm`/`htu`. The backend holds only the public half, so neither the bearer
// token nor the backend's own environment can mint an operator. Server-only.
//
// Key: `ACTOR_ASSERTION_PRIVATE_KEY` (PEM; a single-line `.env` value may
// spell newlines as `\n`) or `ACTOR_ASSERTION_PRIVATE_KEY_FILE` (the swarm
// secret form, a path under /run/secrets). Both set, or a value that is not
// an Ed25519 private key, refuses to boot (`actorAssertionPolicy`). Neither
// set signs nothing, which the backend in `off`/`log` mode accepts.
import { createPrivateKey, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { readSecret } from './secret'
import type { SessionUser } from '#/data/types'

export const ACTOR_ASSERTION_HEADER = 'x-actor-assertion'
export const ACTOR_ASSERTION_KEY_GATE_CODE = 'E-ACTOR-ASSERTION-KEY'
/** What the backend checks `aud` against. */
export const ACTOR_ASSERTION_AUDIENCE = 'apiary-backend'
/** The backend accepts at most 300 s; the BFF mints one per call. */
export const ACTOR_ASSERTION_LIFETIME_SECS = 60

type Env = Record<string, string | undefined>
export type ActorIdentity = { sub: string; username: string }
export type KeyResult = { kind: 'unset' } | { kind: 'key'; key: KeyObject } | { kind: 'refuse'; message: string }

const refuse = (detail: string): KeyResult => ({ kind: 'refuse', message: `[${ACTOR_ASSERTION_KEY_GATE_CODE}] refusing to start: ${detail}` })

/** Parses the configured key. Never echoes key material in a message. */
export function readActorKey(env: Env = process.env): KeyResult {
  const secret = readSecret('ACTOR_ASSERTION_PRIVATE_KEY', env, ACTOR_ASSERTION_KEY_GATE_CODE)
  if (secret.kind !== 'value') return secret
  const pem = secret.source.endsWith('_FILE') ? secret.value : secret.value.trim().replace(/\\n/g, '\n')
  const source = secret.source
  try {
    const key = createPrivateKey(pem)
    if (key.asymmetricKeyType !== 'ed25519') return refuse(`${source} is a ${key.asymmetricKeyType ?? 'unknown'} key; the backend verifies Ed25519 only.`)
    return { kind: 'key', key }
  } catch {
    return refuse(`${source} is not a parsable PEM private key. Generate one with: openssl genpkey -algorithm ed25519`)
  }
}

// Parsed once per source: the key is a deployed secret, replaced by a
// redeploy, never at runtime. A refusal is not cached so the boot check and
// tests always see the current environment.
const parsed = new Map<string, KeyObject>()
function activeKey(env: Env): KeyObject | undefined {
  const source = `${env.ACTOR_ASSERTION_PRIVATE_KEY_FILE ?? ''}\u0000${env.ACTOR_ASSERTION_PRIVATE_KEY ?? ''}`
  const hit = parsed.get(source)
  if (hit) return hit
  const result = readActorKey(env)
  if (result.kind !== 'key') return undefined
  parsed.set(source, result.key)
  return result.key
}

/** Whether this process signs at all. */
export const signsActors = (env: Env = process.env): boolean => activeKey(env) !== undefined

// The OIDC subject and username behind a SessionUser, kept off the object
// itself: SessionUser is serialised to the browser and these are not for it.
// Keyed by identity, so only the object `userOf` built from the session
// resolves; a copy (JSON, spread) does not.
const identities = new WeakMap<SessionUser, ActorIdentity>()
export const rememberActor = (user: SessionUser, identity: ActorIdentity): SessionUser => {
  identities.set(user, identity)
  return user
}
export const actorOf = (user: SessionUser | null | undefined): ActorIdentity | undefined => (user ? identities.get(user) : undefined)

const b64 = (value: string | Buffer): string => Buffer.from(value).toString('base64url')
const HEADER = b64('{"alg":"EdDSA","typ":"JWT"}')

/** The request path exactly as it goes on the wire: the caller's
 * `encodeURIComponent`-ed segments, dot segments resolved the way `fetch`
 * resolves them, no query. This is the `htu` the backend compares with
 * `request.uri().path()`. */
export const htuOf = (path: string): string => new URL(path, 'http://backend.invalid').pathname

/** The assertion for `user` calling `method` `path`, or undefined when no key
 * is configured, there is no caller, the caller is not a session user (no
 * subject/username known), or its role is not one the backend knows. The
 * backend then sees an unsigned request, which `off`/`log` accept and
 * `enforce` refuses for mutations, which is the correct outcome for each. */
export function mintActorAssertion(user: SessionUser | null | undefined, method: string, path: string, nowMs: number = Date.now(), env: Env = process.env): string | undefined {
  const key = activeKey(env)
  const identity = actorOf(user)
  const role = user?.roles[0]
  if (!key || !identity || (role !== 'admin' && role !== 'viewer')) return undefined
  const iat = Math.floor(nowMs / 1000)
  const claims = { sub: identity.sub, username: identity.username, role, aud: ACTOR_ASSERTION_AUDIENCE, iat, exp: iat + ACTOR_ASSERTION_LIFETIME_SECS, htm: method, htu: htuOf(path) }
  const input = `${HEADER}.${b64(JSON.stringify(claims))}`
  return `${input}.${b64(sign(null, Buffer.from(input), key))}`
}
