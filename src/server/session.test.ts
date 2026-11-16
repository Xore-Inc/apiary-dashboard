import { describe, expect, it, vi } from 'vitest'
import { fakeRedis } from './fakeRedis.test-util'
import { DEV_SESSION_COOKIE, MemorySessionStore, RedisSessionStore, SESSION_COOKIE, SESSION_TTL_SECONDS, clearSessionCookie, sessionCookie, sidFrom } from './session'

const account = { sub: 's', username: 'u', displayName: 'U', email: 'u@example.test', role: 'viewer' as const }

describe('sessions', () => {
  it('keeps a session in Redis under bff:session: with the 12-hour TTL', async () => {
    const redis = fakeRedis()
    const set = vi.spyOn(redis, 'set')
    const store = new RedisSessionStore(redis, () => 5)
    const sid = await store.create(account)
    expect(sid).toMatch(/^[\w-]{43}$/)
    expect(set).toHaveBeenCalledWith(`bff:session:${sid}`, expect.any(String), 'EX', SESSION_TTL_SECONDS)
    expect(SESSION_TTL_SECONDS).toBe(12 * 3600)
    expect(await store.get(sid)).toEqual({ ...account, createdAt: 5 })
    expect(await store.get('nope')).toBeNull()
    expect(await store.get(undefined)).toBeNull()
    await store.destroy(sid)
    expect(await store.get(sid)).toBeNull()
    expect(redis.keys.size).toBe(0)
  })

  it('keeps a session behind an opaque id until it expires', async () => {
    let now = 1_000_000
    const store = new MemorySessionStore(() => now)
    const sid = await store.create(account)
    expect(sid).toMatch(/^[\w-]{43}$/)
    expect(await store.get(sid)).toMatchObject(account)
    now += 12 * 3600 * 1000
    expect(await store.get(sid)).toBeNull()
  })

  it('forgets a destroyed or unknown id', async () => {
    const store = new MemorySessionStore()
    const sid = await store.create(account)
    await store.destroy(sid)
    expect(await store.get(sid)).toBeNull()
    expect(await store.get('x'.repeat(200))).toBeNull()
    expect(await store.get(undefined)).toBeNull()
  })

  it('uses the canonical cookie', () => {
    expect(sessionCookie('abc')).toBe(`${SESSION_COOKIE}=abc; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`)
    expect(clearSessionCookie()).toContain('Max-Age=0')
    expect(sidFrom(new Request('http://x/', { headers: { cookie: `other=1; ${SESSION_COOKIE}=abc` } }))).toBe('abc')
  })

  it('uses a plain-HTTP cookie for a development server reached by address', () => {
    vi.stubEnv('APIARY_DEV_HTTP_COOKIE', '1')
    try {
      expect(sessionCookie('abc')).toBe(`${DEV_SESSION_COOKIE}=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`)
      expect(clearSessionCookie()).toBe(`${DEV_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
      // Only the cookie in use counts.
      expect(sidFrom(new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=secure; ${DEV_SESSION_COOKIE}=dev` } }))).toBe('dev')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
