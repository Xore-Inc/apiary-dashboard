// The shared read cache in front of the Rust tier (api.ts `get`).
//
// The regression this file exists for (2026-10-31, production): one page load
// fanned out a dozen slow aggregate reads, each operator's page asked again,
// the BFF limiter filled, and the page answered 503 `overloaded` and 502. The
// cache shares one in-flight read and keeps a good answer for the TTL, and it
// must never serve a failure. (Calls carrying an operator, `user`, bypass it
// by construction in `get`.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Backend } from './backend'
import wire from './__fixtures__/wire-operations.json'

const healthWire = wire.sourceHealth

async function freshApi(ttlMs: string) {
  process.env.BACKEND_READ_CACHE_TTL_MS = ttlMs
  vi.resetModules()
  return import('./api')
}

function stubFetch(answer: () => Response | Promise<Response>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(new URL(url).pathname)
      return answer()
    }),
  )
  return calls
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.SERVICE_TOKEN = 'test-token'
  process.env.BACKEND_URL = 'http://backend.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
  process.env.BACKEND_READ_CACHE_TTL_MS = '0'
})

describe('the shared read cache', () => {
  it('shares one in-flight source-health read between concurrent callers', async () => {
    const { liveQuery } = await freshApi('15000')
    const calls = stubFetch(() => json(healthWire))
    const health = liveQuery('getSourceHealth', undefined) as Backend['getSourceHealth']
    const [a, b, c] = await Promise.all([health(), health(), health()])
    expect(calls.filter((p) => p === '/api/v1/source-health')).toHaveLength(1)
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  it('serves a good answer again within the TTL and asks again after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { liveQuery } = await freshApi('15000')
    const calls = stubFetch(() => json(healthWire))
    const health = liveQuery('getSourceHealth', undefined) as Backend['getSourceHealth']
    await health()
    await health()
    expect(calls).toHaveLength(1)
    vi.setSystemTime(Date.now() + 16_000)
    await health()
    expect(calls).toHaveLength(2)
  })

  it('never serves a failure from the cache', async () => {
    const { liveQuery } = await freshApi('15000')
    let fail = true
    const calls = stubFetch(() => (fail ? new Response('down', { status: 502 }) : json(healthWire)))
    const health = liveQuery('getSourceHealth', undefined) as Backend['getSourceHealth']
    await expect(health()).rejects.toThrow()
    fail = false
    await expect(health()).resolves.toBeTruthy()
    expect(calls).toHaveLength(2)
  })

  it('is off when the TTL is zero', async () => {
    const { liveQuery } = await freshApi('0')
    const calls = stubFetch(() => json(healthWire))
    const health = liveQuery('getSourceHealth', undefined) as Backend['getSourceHealth']
    await health()
    await health()
    expect(calls).toHaveLength(2)
  })
})
