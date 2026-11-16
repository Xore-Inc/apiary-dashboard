import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runForRequest } from './backend'
import { ApiError } from './errors'

const responseStatus = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('http://dashboard.test/events'),
  setResponseStatus: responseStatus,
}))

vi.mock('#/server/identity', () => ({
  resolveUser: vi.fn(async () => undefined),
}))

const blocked = { total: 1, rows: [{ IP: 'live-source.example', Blocked: true }] }

beforeEach(() => {
  process.env.BACKEND_URL = 'http://backend.test'
  process.env.SERVICE_TOKEN = 'test-token'
  responseStatus.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BACKEND_URL
  delete process.env.SERVICE_TOKEN
})

describe('request routing', () => {
  it('answers every query through the live adapter', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        return Response.json(blocked)
      }),
    )

    expect(await runForRequest('getBlockedIps', [])).toEqual(['live-source.example'])
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0]).pathname).toBe('/api/v1/investigate/blocked-ips')
  })

  it('returns the backend ApiError, with its status on the response, when a read cannot connect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('ECONNREFUSED')
      }),
    )

    const error = await runForRequest('getBlockedIps', []).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'unavailable', status: 502, backendUnreachable: true })
    expect(responseStatus).toHaveBeenCalledWith(502)
  })

  it('refuses a name that is not a query', async () => {
    await expect(runForRequest('getReplay', [])).rejects.toThrow('unknown query getReplay')
  })
})
