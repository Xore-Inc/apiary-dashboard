import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendGapOf, isBackendGap } from '#/lib/backendGap'
import { resetReauth } from '#/lib/reauth'
import { CSRF_HEADER, crossOriginResponse, isSameOriginRequest } from '#/server/origin'
import { ApiError } from './errors'
import { announced, clockFor, guardedFetch } from './serverFn'

describe('clockFor', () => {
  // A live backend runs on the wall clock, whatever the dev scenario says.
  it('is the wall clock (null) when a live backend is configured', () => {
    expect(clockFor(true, 1_000)).toBeNull()
  })

  it('is the mock tier clock when no live backend is configured', () => {
    expect(clockFor(false, 1_000)).toBe(1_000)
  })
})

describe('guardedFetch (#284)', () => {
  const cloudflare = () =>
    new Response(JSON.stringify({ cloudflare_error: true, error_name: 'origin_bad_gateway' }), { status: 502, headers: { 'content-type': 'application/json' } })
  const serialized = () => new Response('{}', { status: 502, headers: { 'content-type': 'application/json', 'x-tss-serialized': 'true' } })

  it('turns a gateway 502 with a foreign body into the unavailable refusal', async () => {
    const error = await guardedFetch('getFacets', async () => cloudflare())('/_serverFn/x').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'unavailable', endpoint: 'getFacets' })
    // The page's gap handling reads it, as it reads the BFF's own refusal.
    expect(isBackendGap(await backendGapOf(Promise.reject(error)))).toBe(true)
  })

  it.each([500, 503, 504])('does the same for a gateway %i', async (status) => {
    await expect(guardedFetch('getSensorDetail', async () => new Response('<html>bad gateway</html>', { status, headers: { 'content-type': 'text/html' } }))('/x')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('lets the BFF’s own serialized refusal through, for Start to rebuild', async () => {
    const response = await guardedFetch('getFacets', async () => serialized())('/x')
    expect(response.status).toBe(502)
  })

  it('lets answers through', async () => {
    const response = await guardedFetch('getFacets', async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))('/x')
    expect(response.status).toBe(200)
  })

  it('treats an unreachable server as unavailable and leaves an abort alone', async () => {
    await expect(guardedFetch('getFacets', async () => Promise.reject(new TypeError('Failed to fetch')))('/x')).rejects.toMatchObject({ kind: 'unavailable', backendUnreachable: true })
    const abort = new DOMException('aborted', 'AbortError')
    await expect(guardedFetch('getFacets', async () => Promise.reject(abort))('/x')).rejects.toBe(abort)
  })
})

describe('announced (#284)', () => {
  it('hands the server function the guarded fetch', async () => {
    let seen: unknown
    await announced('getFacets', async (options) => {
      seen = options.fetch
      return {}
    })()
    expect(typeof seen).toBe('function')
  })
})

// #291: Start's client fetcher uses a call's own `fetch` in place of the
// Start instance's `serverFns.fetch` (start.ts), so the fetch `announced`
// hands every query is the one every browser call goes through. It has to
// be the dashboard's own fetch (lib/reauth.ts), or no call carries the CSRF
// header and every POST is refused by the same-origin rule.
describe('the fetch every server function call goes through (#291)', () => {
  const page = 'https://dash.example.test'
  // What reaches the server: the request the browser builds from the
  // fetch's arguments, with the Origin a same-origin page always sends.
  let received: Request[] = []

  beforeEach(() => {
    received = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(new URL(String(input), page), init)
      request.headers.set('origin', page)
      received.push(request)
      return isSameOriginRequest(request) ? new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) : crossOriginResponse()
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetReauth()
  })

  // The call as Start makes it: through the fetch the call carries.
  const post = (name: string) => announced(name, async (options) => (await options.fetch!('/_serverFn/abc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status)()

  it('carries the CSRF header, so the same-origin rule lets a POST through', async () => {
    expect(await post('savePreferences')).toBe(200)
    expect(received[0].headers.get(CSRF_HEADER)).toBe('1')
  })

  it('is refused without the header: the rule itself is unchanged', async () => {
    const bare = new Request(`${page}/_serverFn/abc`, { method: 'POST', headers: { origin: page } })
    expect(isSameOriginRequest(bare)).toBe(false)
    expect(crossOriginResponse().status).toBe(403)
  })

  it('still raises a gateway 5xx as unavailable (#284)', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
    await expect(post('savePreferences')).rejects.toMatchObject({ kind: 'unavailable', endpoint: 'savePreferences' })
  })

  it('sends an expired session to sign in again', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { pathname: '/events', search: '', hash: '', assign }, dispatchEvent: () => true })
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }))
    expect(await post('acknowledgeAlert')).toBe(401)
    expect(assign).toHaveBeenCalledWith('/auth/login?return_to=%2Fevents')
  })
})
