// Readiness accepts a backend that publishes a supported contract version and
// rejects an intentionally incompatible one, on both listeners; liveness
// never depends on the upstream (#244).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkBackendContract, SUPPORTED_API_VERSIONS } from './backendContract'

/** What a backend's public /healthz returns, as the pinned artifact's
 * version would publish it. */
const pinnedVersion = (JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'contracts/backend/SOURCE.json'), 'utf8')) as { apiVersion: number }).apiVersion
const supported = { live: true, built: 'now', revision: 'abc', api_version: pinnedVersion }
const incompatible = { ...supported, api_version: Math.max(...SUPPORTED_API_VERSIONS) + 1 }
const predating = { live: true, built: 'now', revision: 'abc' }

/** A fetch that answers each base URL with its body (or status). */
const backends = (table: Record<string, unknown | number>): typeof fetch =>
  (async (url: string) => {
    const base = Object.keys(table).find((b) => url.startsWith(b))
    if (!base) throw new TypeError('connection refused')
    const answer = table[base]
    return typeof answer === 'number' ? new Response('no', { status: answer }) : Response.json(answer)
  }) as unknown as typeof fetch

describe('backend readiness', () => {
  it('accepts a backend that publishes a supported contract version', async () => {
    const status = await checkBackendContract({ BACKEND_URL: 'http://b.test' }, backends({ 'http://b.test': supported }))
    expect(status).toMatchObject({ ok: true, configured: true, listeners: [{ listener: 'standard', ok: true, apiVersion: pinnedVersion }] })
  })

  it('rejects an incompatible version, naming it', async () => {
    const status = await checkBackendContract({ BACKEND_URL: 'http://b.test' }, backends({ 'http://b.test': incompatible }))
    expect(status.ok).toBe(false)
    expect(status.listeners[0].reason).toMatch(/^unsupported backend API: version \d+ \(supported: /)
  })

  it('rejects a backend that predates the marker', async () => {
    const status = await checkBackendContract({ BACKEND_URL: 'http://b.test' }, backends({ 'http://b.test': predating }))
    expect(status.ok).toBe(false)
    expect(status.listeners[0].reason).toMatch(/^unsupported backend API: no api_version/)
  })

  it('checks the mounted listener too, and fails when only it is incompatible', async () => {
    const env = { BACKEND_URL: 'http://b.test', BACKEND_MOUNTED_URL: 'http://m.test/' }
    const status = await checkBackendContract(env, backends({ 'http://b.test': supported, 'http://m.test': incompatible }))
    expect(status.ok).toBe(false)
    expect(status.listeners.map((l) => [l.listener, l.ok])).toEqual([['standard', true], ['mounted', false]])
    expect(JSON.stringify(status)).not.toContain('m.test')
  })

  it('probes once when the mounted URL is unset or the same instance', async () => {
    for (const mounted of [undefined, '', ' http://b.test/ ']) {
      const probe = vi.fn(backends({ 'http://b.test': supported }))
      const status = await checkBackendContract({ BACKEND_URL: 'http://b.test', BACKEND_MOUNTED_URL: mounted }, probe)
      expect(status.ok).toBe(true)
      expect(probe).toHaveBeenCalledTimes(1)
    }
  })

  it('reports an unreachable or failing backend as not ready', async () => {
    expect((await checkBackendContract({ BACKEND_URL: 'http://down.test' }, backends({}))).listeners[0].reason).toBe('backend unreachable')
    expect((await checkBackendContract({ BACKEND_URL: 'http://b.test' }, backends({ 'http://b.test': 500 }))).ok).toBe(false)
  })

  it('is ready when no backend is configured', async () => {
    expect(await checkBackendContract({}, backends({}))).toEqual({ ok: true, configured: false, listeners: [] })
  })
})

describe('probe routes', () => {
  afterEach(() => vi.unstubAllGlobals())
  const handler = async (name: 'healthz' | 'readyz') => {
    const { Route } = name === 'healthz' ? await import('../routes/healthz') : await import('../routes/readyz')
    return (Route.options as unknown as { server: { handlers: { GET: () => Promise<Response> | Response } } }).server.handlers.GET
  }

  it('/readyz answers 200 for a supported backend and 503 for an incompatible one', async () => {
    vi.stubEnv('BACKEND_URL', 'http://b.test')
    vi.stubEnv('BACKEND_MOUNTED_URL', '')
    vi.stubGlobal('fetch', backends({ 'http://b.test': supported }))
    expect((await (await handler('readyz'))()).status).toBe(200)
    vi.stubGlobal('fetch', backends({ 'http://b.test': incompatible }))
    const refused = await (await handler('readyz'))()
    expect(refused.status).toBe(503)
    expect((await refused.json()).listeners[0].reason).toContain('unsupported backend API')
    vi.unstubAllEnvs()
  })

  it('/healthz is 200 and makes no upstream call, whatever the backend is', async () => {
    vi.stubEnv('BACKEND_URL', 'http://b.test')
    const upstream = vi.fn(backends({ 'http://b.test': incompatible }))
    vi.stubGlobal('fetch', upstream)
    const response = await (await handler('healthz'))()
    expect(response.status).toBe(200)
    expect(upstream).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
