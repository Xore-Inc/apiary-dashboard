import { generateKeyPairSync, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { actorOf, htuOf, mintActorAssertion, readActorKey, rememberActor, signsActors } from './actorAssertion'
import { userOf } from './identity'
import { actorAssertionPolicy, assertBootPolicies } from './policy'
import type { Session } from './session'

const pair = () => generateKeyPairSync('ed25519')
const pem = (key: KeyObject) => key.export({ type: 'pkcs8', format: 'pem' }).toString()
const { publicKey, privateKey } = pair()
const env = { ACTOR_ASSERTION_PRIVATE_KEY: pem(privateKey) }
const alice = rememberActor({ name: 'Alice Example', email: 'a@example.test', roles: ['admin'] }, { sub: 'sub-alice', username: 'alice' })

/** What the backend does (trust.rs `verify`): signature first, then claims. */
function decode(token: string, key: KeyObject = publicKey) {
  const [head, body, signature] = token.split('.')
  const ok = verify(null, Buffer.from(`${head}.${body}`), key, Buffer.from(signature, 'base64url'))
  return { ok, header: JSON.parse(Buffer.from(head, 'base64url').toString()), claims: JSON.parse(Buffer.from(body, 'base64url').toString()) }
}

describe('mintActorAssertion', () => {
  it('signs the claims the backend requires, verifiable with the public key', () => {
    const token = mintActorAssertion(alice, 'POST', '/api/v1/ip-block', 1_760_000_000_500, env)!
    const { ok, header, claims } = decode(token)
    expect(ok).toBe(true)
    expect(header).toEqual({ alg: 'EdDSA', typ: 'JWT' })
    expect(claims).toEqual({ sub: 'sub-alice', username: 'alice', role: 'admin', aud: 'apiary-backend', iat: 1_760_000_000, exp: 1_760_000_060, htm: 'POST', htu: '/api/v1/ip-block' })
  })

  it('does not verify under another key, nor after a claim is altered', () => {
    const token = mintActorAssertion(alice, 'GET', '/api/v1/x', Date.now(), env)!
    expect(decode(token, pair().publicKey).ok).toBe(false)
    const [head, body, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...decode(token).claims, role: 'viewer' })).toString('base64url')
    expect(verify(null, Buffer.from(`${head}.${forged}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(false)
    expect(body).not.toBe(forged)
  })

  it('carries the username, never the display name', () => {
    expect(decode(mintActorAssertion(alice, 'GET', '/a', Date.now(), env)!).claims.username).toBe('alice')
  })

  it('signs nothing without a key, a caller, a known identity or a known role', () => {
    expect(mintActorAssertion(alice, 'GET', '/a', Date.now(), {})).toBeUndefined()
    expect(mintActorAssertion(undefined, 'GET', '/a', Date.now(), env)).toBeUndefined()
    expect(mintActorAssertion(null, 'GET', '/a', Date.now(), env)).toBeUndefined()
    expect(mintActorAssertion({ name: 'x', email: '', roles: ['admin'] }, 'GET', '/a', Date.now(), env)).toBeUndefined()
    expect(mintActorAssertion(rememberActor({ name: 'x', email: '', roles: ['root'] }, { sub: 's', username: 'u' }), 'GET', '/a', Date.now(), env)).toBeUndefined()
  })

  it('binds htu to the encoded path as sent, without the query', () => {
    const ipv6 = `/api/v1/investigate/ip/${encodeURIComponent('2001:db8::1')}`
    expect(ipv6).toBe('/api/v1/investigate/ip/2001%3Adb8%3A%3A1')
    expect(decode(mintActorAssertion(alice, 'GET', ipv6, Date.now(), env)!).claims.htu).toBe(ipv6)
    const spaced = `/api/v1/workbench/runs/${encodeURIComponent('run one')}/children/x/pause`
    expect(decode(mintActorAssertion(alice, 'POST', spaced, Date.now(), env)!).claims.htu).toBe('/api/v1/workbench/runs/run%20one/children/x/pause')
    expect(htuOf('/api/v1/events?limit=5')).toBe('/api/v1/events')
    // A name of ".." is resolved by fetch, so the backend sees the resolved path.
    expect(htuOf(`/api/v1/files/${encodeURIComponent('..')}/x`)).toBe('/api/v1/x')
  })
})

describe('the signing key', () => {
  it('is unset by default, and then signs nothing', () => {
    expect(readActorKey({}).kind).toBe('unset')
    expect(signsActors({})).toBe(false)
    expect(actorAssertionPolicy({}).kind).toBe('unsigned')
  })

  it('is read from the value, with \\n spelling newlines, or from a file', () => {
    expect(readActorKey({ ACTOR_ASSERTION_PRIVATE_KEY: pem(privateKey).trim().replace(/\n/g, '\\n') }).kind).toBe('key')
    const file = join(mkdtempSync(join(tmpdir(), 'actor-key-')), 'key')
    writeFileSync(file, pem(privateKey))
    expect(readActorKey({ ACTOR_ASSERTION_PRIVATE_KEY_FILE: file }).kind).toBe('key')
    expect(decode(mintActorAssertion(alice, 'GET', '/a', Date.now(), { ACTOR_ASSERTION_PRIVATE_KEY_FILE: file })!).ok).toBe(true)
  })

  it('refuses to boot when both forms are set, or the key is unparsable, public or not Ed25519', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    const bad = [
      { ACTOR_ASSERTION_PRIVATE_KEY: pem(privateKey), ACTOR_ASSERTION_PRIVATE_KEY_FILE: '/run/secrets/k' },
      { ACTOR_ASSERTION_PRIVATE_KEY: 'not a key' },
      { ACTOR_ASSERTION_PRIVATE_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      { ACTOR_ASSERTION_PRIVATE_KEY: pem(rsa) },
      { ACTOR_ASSERTION_PRIVATE_KEY_FILE: '/nonexistent/actor.key' },
    ]
    for (const e of bad) {
      const policy = actorAssertionPolicy(e)
      expect(policy.kind).toBe('refuse')
      if (policy.kind === 'refuse') {
        expect(policy.message).toContain('E-ACTOR-ASSERTION-KEY')
        expect(policy.message).not.toContain('PRIVATE KEY-----')
      }
      expect(() => assertBootPolicies({ SERVICE_TOKEN: 's', OIDC_ISSUER_URL: 'https://idp.test', ...e })).toThrow('E-ACTOR-ASSERTION-KEY')
    }
    expect(() => assertBootPolicies({ SERVICE_TOKEN: 's', OIDC_ISSUER_URL: 'https://idp.test', ...env })).not.toThrow()
  })
})

describe('the identity behind a session user', () => {
  const session = { sub: 'sub-bob', username: 'bob', displayName: 'Bob Builder', email: 'b@example.test', role: 'viewer' } as Session

  it('keeps sub and username server-side, off the object the browser gets', () => {
    const user = userOf(session)
    expect(user).toEqual({ name: 'Bob Builder', email: 'b@example.test', roles: ['viewer'] })
    expect(JSON.stringify(user)).not.toContain('sub-bob')
    expect(actorOf(user)).toEqual({ sub: 'sub-bob', username: 'bob' })
    expect(actorOf({ ...user })).toBeUndefined()
  })
})
