// GET /export/portbridge-manual-blackhole.txt: the firewall puller's list.
// Who may read it: a machine client with X-Export-Token equal to
// EXPORT_TOKEN (SERVICE_TOKEN is refused here), or a signed-in session whose role the query policy allows.
// Nothing else, and the token is never taken from the URL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './export.portbridge-manual-blackhole[.]txt'
import type * as AuthorizeModule from '#/server/authorize'
import { authorize } from '#/server/authorize'
import { SESSION_COOKIE, sessions } from '#/server/session'

vi.mock('#/server/authorize', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthorizeModule>()
  return { ...actual, authorize: vi.fn(actual.authorize) }
})

type Handler = (ctx: { request: Request }) => Promise<Response> | Response
const get = (Route as unknown as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET

const URL_PATH = 'http://dashboard.example.test/export/portbridge-manual-blackhole.txt'
const LIST = '198.51.100.7\n203.0.113.4\n'
const SECRET = 'test-export-token'
const SERVICE_SECRET = 'test-service-token'

/** The backend's answer for the list, and the calls it received. */
function backend(body = LIST) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url))
      if (new URL(String(url)).pathname !== '/api/v1/ip-block-export') throw new TypeError(`no fixture for ${url}`)
      return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }),
  )
  return calls
}

const viewer = { sub: 'viewer', username: 'viewer', displayName: 'Viewer', email: 'viewer@example.test', role: 'viewer' as const }

let sid = ''
const request = (headers: Record<string, string> = {}, url = URL_PATH) => new Request(url, { headers })
const signedIn = (headers: Record<string, string> = {}) => request({ ...headers, cookie: `${SESSION_COOKIE}=${sid}` })

beforeEach(async () => {
  process.env.SERVICE_TOKEN = SERVICE_SECRET
  process.env.EXPORT_TOKEN = SECRET
  process.env.BACKEND_URL = 'http://backend.test'
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
  sid = await sessions.create(viewer)
  vi.mocked(authorize).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
  delete process.env.EXPORT_TOKEN
  process.env.APIARY_ALLOW_UNAUTH_DEV = '1'
})

describe('/export/portbridge-manual-blackhole.txt', () => {
  it('refuses an unauthenticated request with 401 and never calls the backend', async () => {
    const calls = backend()
    const response = await get({ request: request() })
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('unauthorized')
    expect(calls).toEqual([])
  })

  it('refuses a wrong export token with 401', async () => {
    const calls = backend()
    const response = await get({ request: request({ 'x-export-token': 'not-the-token' }) })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('refuses an empty export token header with 401', async () => {
    const response = await get({ request: request({ 'x-export-token': '' }) })
    expect(response.status).toBe(401)
  })

  it('does not accept the token in the URL', async () => {
    const calls = backend()
    const response = await get({ request: request({}, `${URL_PATH}?export_token=${SECRET}&token=${SECRET}`) })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('serves the list unchanged to a machine client with the correct export token', async () => {
    const calls = backend()
    const response = await get({ request: request({ 'x-export-token': SECRET }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe(LIST)
    expect(calls.map((url) => new URL(url).pathname)).toEqual(['/api/v1/ip-block-export'])
  })

  it('never echoes the token in the response', async () => {
    backend()
    const response = await get({ request: request({ 'x-export-token': SECRET }) })
    expect(JSON.stringify([...response.headers.entries()])).not.toContain(SECRET)
    expect(await response.text()).not.toContain(SECRET)
  })

  it('serves the list to a signed-in session whose role the policy allows', async () => {
    const calls = backend()
    const response = await get({ request: signedIn() })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(LIST)
    expect(authorize).toHaveBeenCalledWith('getBlockedIps', expect.objectContaining({ roles: ['viewer'] }))
    expect(calls).toHaveLength(1)
  })

  it('refuses a signed-in session whose role the policy refuses with 403', async () => {
    const calls = backend()
    vi.mocked(authorize).mockReturnValueOnce('admin-only')
    const response = await get({ request: signedIn() })
    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('refuses SERVICE_TOKEN on this route, in either header', async () => {
    const calls = backend()
    for (const headers of [{ 'x-service-token': SERVICE_SECRET }, { 'x-export-token': SERVICE_SECRET }] as Record<string, string>[]) {
      const response = await get({ request: request(headers) })
      expect(response.status).toBe(401)
    }
    expect(calls).toEqual([])
  })

  it('does not take the export token in the service-token header', async () => {
    const calls = backend()
    const response = await get({ request: request({ 'x-service-token': SECRET }) })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('refuses every machine caller when EXPORT_TOKEN is unset', async () => {
    delete process.env.EXPORT_TOKEN
    const calls = backend()
    for (const headers of [{ 'x-export-token': '' }, { 'x-export-token': SECRET }, { 'x-service-token': SERVICE_SECRET }] as Record<string, string>[]) {
      expect((await get({ request: request(headers) })).status).toBe(401)
    }
    expect(calls).toEqual([])
  })

  it('still serves a signed-in session when EXPORT_TOKEN is unset', async () => {
    delete process.env.EXPORT_TOKEN
    backend()
    const response = await get({ request: signedIn() })
    expect(response.status).toBe(200)
  })
})
