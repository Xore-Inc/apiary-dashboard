// The mock scenarios every page's states are designed against: the facade
// must wrap every query, and each scenario must behave like the backend
// state it names.
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError, asApiError } from './errors'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backend, queryNames } from './backend'
import type { Backend } from './backend'
import * as impl from './queries.impl'
import type { MockScenario } from './scenarios'
import { renderQueries } from '../../scripts/gen-queries'

// The backend each test talks to; switching scenario is a new backend, as a
// page with another ?mock= gets.
let q: Backend = backend()
const setMockScenario = (scenario: MockScenario) => {
  q = backend(scenario)
}

afterEach(() => setMockScenario('normal'))

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (e) {
    return asApiError(e)
  }
  return undefined
}

describe('mock scenarios', () => {
  it('the facade has a server function for every query, and is current', () => {
    const asyncImpl = Object.entries(impl).filter(([, v]) => typeof v === 'function' && v.constructor.name === 'AsyncFunction').map(([k]) => k)
    expect(asyncImpl.length).toBeGreaterThan(80)
    expect(queryNames().sort()).toEqual(asyncImpl.sort())
    const facade = readFileSync(join(import.meta.dirname, 'queries.ts'), 'utf8')
    for (const name of asyncImpl) expect(facade, name).toContain(`export const ${name} = announced('${name}'`)
    expect(facade).toBe(renderQueries())
  })

  it('empty: lists empty and counts zero, catalogs and fixed measures kept', async () => {
    setMockScenario('empty')
    const events = await q.getEvents({})
    expect(events.rows).toEqual([])
    expect(events.total).toBe(0)
    const overview = await q.getOverview()
    expect(overview.kpis.length).toBeGreaterThan(0)
    expect(overview.kpis.every((k) => k.value === 0)).toBe(true)
    expect((await q.getReports()).templates.length).toBeGreaterThan(0)
    expect((await q.getReports()).definitions).toEqual([])
  })

  it('outages fail every call with their own kind, the session survives', async () => {
    for (const [scenario, kind] of [['unavailable', 'unavailable'], ['overloaded', 'overloaded'], ['expired', 'expired']] as const) {
      setMockScenario(scenario)
      const error = await failure(() => q.getEvents({}))
      expect(error?.kind, scenario).toBe(kind)
      expect((await q.getSessionUser())?.name).toBeTruthy()
    }
    setMockScenario('overloaded')
    expect((await failure(() => q.getAlerts()))?.retryAfter).toBe(30)
  })

  it('partial: the same reads fail every time, the rest answer', async () => {
    setMockScenario('partial')
    const names = ['getEvents', 'getAlerts', 'getOverview', 'getSourceHealth', 'getTopology', 'getFacets', 'getPayloads', 'getReports', 'getSourceProfiles'] as const
    const outcome = async () => Promise.all(names.map(async (n) => (await failure(() => (q[n] as (...a: unknown[]) => Promise<unknown>)({}))) === undefined))
    const first = await outcome()
    expect(first).toEqual(await outcome())
    expect(first.some(Boolean) && first.some((ok) => !ok)).toBe(true)
  })

  it('viewer: any signed-in caller becomes a viewer; every write refused', async () => {
    q = backend('viewer', { name: 'Operator', email: 'operator@example.test', roles: ['admin'] })
    expect((await q.getSessionUser())?.roles).toEqual(['viewer'])
    expect((await failure(() => q.setIpBlocked('198.51.100.1', true)))?.kind).toBe('forbidden')
    // Viewers are read-only (APIARY#3857): acknowledging is a write too.
    expect((await failure(() => q.setAlertsAcknowledged([], true)))?.kind).toBe('forbidden')
    expect(await failure(() => q.getEvents({}))).toBeUndefined()
  })

  it('an ApiError survives being reduced to its message', () => {
    const original = new ApiError('overloaded', 'getEvents', { retryAfter: 30 })
    const rebuilt = asApiError(new Error(original.message))
    expect(rebuilt).toMatchObject({ kind: 'overloaded', endpoint: 'getEvents', status: 503, retryAfter: 30 })
    expect(asApiError(new Error('something else'))).toBeUndefined()
  })
})

describe('read-only mode', () => {
  it('freezes every write except turning it off and one’s own preferences', async () => {
    const { config, preferences } = await q.getSettings()
    expect((await q.saveConfigSection('behavior', { ...config.behavior, readOnly: true })).ok).toBe(true)
    try {
      expect((await q.getShellConfig()).behavior.readOnly).toBe(true)
      expect((await failure(() => q.setAlertsAcknowledged([], true)))?.kind).toBe('locked')
      expect((await failure(() => q.setIpBlocked('198.51.100.1', true)))?.kind).toBe('locked')
      // Reads, preferences and problem reports go through.
      expect((await q.getEvents({})).total).toBeGreaterThan(0)
      expect(await failure(() => q.savePreferences(preferences))).toBeUndefined()
    } finally {
      expect((await q.saveConfigSection('behavior', { ...config.behavior, readOnly: false })).ok).toBe(true)
    }
    expect(await failure(() => q.setAlertsAcknowledged([], true))).toBeUndefined()
  })
})
