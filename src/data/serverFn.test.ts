import { describe, expect, it } from 'vitest'
import { backendGapOf, isBackendGap } from '#/lib/backendGap'
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
