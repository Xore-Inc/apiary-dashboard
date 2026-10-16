// The BFF signs every call it makes on an operator's behalf (#249): the seam
// functions `request`, `raw` and `stream` attach `x-actor-assertion` for the
// explicit user or the request scope's caller, and nothing without a key or a
// caller. The signature is checked with the public key, as the backend does.
import { generateKeyPairSync, verify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRaw, liveQuery, openLiveStream } from './api'
import { rememberActor } from '#/server/actorAssertion'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const alice = rememberActor({ name: 'Alice Example', email: 'a@example.test', roles: ['admin'] }, { sub: 'sub-alice', username: 'alice' })
const verifier = rememberActor({ name: 'Vera Viewer', email: 'v@example.test', roles: ['viewer'] }, { sub: 'sub-vera', username: 'vera' })

type Sent = { url: URL; method: string; headers: Record<string, string> }
const sent: Sent[] = []

function stubFetch(status = 200, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      sent.push({ url: new URL(url), method: init.method ?? 'GET', headers: init.headers as Record<string, string> })
      // The read-only guard reads the config before every write.
      const answer = new URL(url).pathname === '/api/v1/config' ? { payload: { behavior: {} } } : body
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } })
    }),
  )
}

const claimsOf = (headers: Record<string, string>) => {
  const [head, body, signature] = headers['x-actor-assertion'].split('.')
  expect(verify(null, Buffer.from(`${head}.${body}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  return JSON.parse(Buffer.from(body, 'base64url').toString())
}

beforeEach(() => {
  sent.length = 0
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
  process.env.ACTOR_ASSERTION_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.ACTOR_ASSERTION_PRIVATE_KEY
})

describe('x-actor-assertion on the calls to the Rust tier', () => {
  it('signs a mounted mutation for the caller, matching the outgoing method and path', async () => {
    stubFetch(200, { ok: true, job_id: 'gj-1', abort_requested: true })
    await liveQuery('abortGpuJob', alice)!('gj-1')
    const call = sent.at(-1)!
    const claims = claimsOf(call.headers)
    expect(claims).toMatchObject({ sub: 'sub-alice', username: 'alice', role: 'admin', aud: 'apiary-backend', htm: call.method, htu: call.url.pathname })
    expect(claims.exp - claims.iat).toBe(60)
    expect(call.headers['x-service-token']).toBe('test-token')
  })

  it('signs a mutation that passes no explicit user, from the request scope', async () => {
    stubFetch()
    // setIpBlocked reads the config first (read-only guard), then POSTs with no `user`.
    await liveQuery('setIpBlocked', alice)!('203.0.113.9', true).catch(() => undefined)
    const post = sent.find((call) => call.method === 'POST')!
    expect(post.url.pathname).toBe('/api/v1/ip-block')
    expect(claimsOf(post.headers)).toMatchObject({ username: 'alice', htm: 'POST', htu: '/api/v1/ip-block' })
  })

  it('binds htu to the encoded path, query excluded: an IPv6 address', async () => {
    stubFetch(500)
    await liveQuery('getIpProfile', verifier)!('2001:db8::1').catch(() => undefined)
    const call = sent.find((c) => c.url.pathname.includes('/investigate/ip/'))!
    expect(call.url.pathname).toBe('/api/v1/investigate/ip/2001%3Adb8%3A%3A1')
    expect(claimsOf(call.headers)).toMatchObject({ role: 'viewer', username: 'vera', htm: 'GET', htu: call.url.pathname })
  })

  it('binds htu to the encoded path: a name with a space', async () => {
    stubFetch(200, { ok: true })
    await liveQuery('abortGpuJob', alice)!('gpu job 1').catch(() => undefined)
    const call = sent.at(-1)!
    expect(call.url.pathname).toBe('/api/v1/gpu-queue/gpu%20job%201/abort')
    expect(claimsOf(call.headers).htu).toBe('/api/v1/gpu-queue/gpu%20job%201/abort')
  })

  it('signs a file download (raw) with its encoded path and no query', async () => {
    stubFetch(200, {})
    await liveQuery('getArtifactFile', alice)!('malware', 'a b', 'file name.bin')
    const call = sent.at(-1)!
    expect(call.url.pathname).toBe('/api/v1/artifacts/malware/a%20b/file%20name.bin')
    expect(claimsOf(call.headers)).toMatchObject({ username: 'alice', htm: 'GET', htu: '/api/v1/artifacts/malware/a%20b/file%20name.bin' })
  })

  it('sends no assertion without a caller (a machine read)', async () => {
    stubFetch(404)
    await getRaw('getArtifactFile', '/api/v1/artifacts/x').catch(() => undefined)
    expect(sent.at(-1)!.headers['x-actor-assertion']).toBeUndefined()
    await liveQuery('getEvents', undefined)!({}).catch(() => undefined)
    await openLiveStream(new AbortController().signal).catch(() => undefined)
    expect(sent.length).toBeGreaterThan(2)
    for (const call of sent) expect(call.headers['x-actor-assertion']).toBeUndefined()
  })

  it('sends no assertion when no key is configured, and the plain headers still work', async () => {
    delete process.env.ACTOR_ASSERTION_PRIVATE_KEY
    stubFetch(200, { ok: true })
    await liveQuery('abortGpuJob', alice)!('gj-1')
    const headers = sent.at(-1)!.headers
    expect(headers['x-actor-assertion']).toBeUndefined()
    expect(headers['x-actor-role']).toBe('admin')
  })

  it('x-actor-username carries the username, matching the assertion, not the display name', async () => {
    stubFetch(200, { ok: true })
    await liveQuery('abortGpuJob', alice)!('gj-1')
    const headers = sent.at(-1)!.headers
    expect(headers['x-actor-username']).toBe('alice')
    expect(headers['x-actor-username']).toBe(claimsOf(headers).username)
  })

  it('falls back to the display name for a user with no known username', async () => {
    stubFetch(200, { ok: true })
    await liveQuery('abortGpuJob', { name: 'carol', email: '', roles: ['admin'] })!('gj-1')
    const headers = sent.at(-1)!.headers
    expect(headers['x-actor-username']).toBe('carol')
    expect(headers['x-actor-assertion']).toBeUndefined()
  })
})
