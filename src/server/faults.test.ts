// The failure paths production takes when the session store does not
// answer: nobody is signed in by accident, and the log is not flooded.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { warnThrottled } from './faults'
import { resolveUser } from './identity'
import { SESSION_COOKIE, sessions } from './session'

const account = { sub: 's', username: 'u', displayName: 'U', email: 'u@example.test', role: 'admin' as const }
const withCookie = (sid: string) => new Request('http://dashboard.example.test/', { headers: { cookie: `${SESSION_COOKIE}=${sid}` } })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dependency failures', () => {
  it('treats a request as signed out while the session store does not answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sid = await sessions.create(account)
    expect(await resolveUser(withCookie(sid))).toMatchObject({ roles: ['admin'] })
    // The store stops answering (Redis down): signed out, not an error page.
    const get = vi.spyOn(sessions, 'get').mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await resolveUser(withCookie(sid))).toBeNull()
    // Back up, the session is still there: an outage signs nobody out for good.
    get.mockRestore()
    expect(await resolveUser(withCookie(sid))).not.toBeNull()
  })

  it('throttles dependency warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnThrottled('a', new Error('x'), 1e14)
    warnThrottled('b', new Error('y'), 1e14 + 1000)
    warnThrottled('c', new Error('z'), 1e14 + 31_000)
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['a', 'c'])
  })
})
