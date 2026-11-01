// The mock backend's scenarios: the rules that make the whole data seam
// behave like a backend in a given state (empty, failing, slow, a viewer's
// session), so every page's states can be seen and designed without
// touching code. Server-only: the scenario arrives with each call (see
// src/data/serverFn.ts), never as shared module state, so concurrent
// requests in different scenarios do not see each other's.
import { ApiError } from './errors'
import { CONFIG } from './mock/details'
import { enlargedRead, originalArgs } from './mock/large'
import type { MockScenario } from './scenarios'
import { READ_ONLY_EXEMPT, isRead } from './readOnly'

// The generator (scripts/gen-queries.ts) reads the read-only rule from here.
export { isRead }

const readOnly = () => CONFIG.behavior.readOnly

/** Controls of the mock itself, not backend calls. */
const MOCK_CONTROLS: ReadonlySet<string> = new Set(['simulateIncident', 'resolveIncidents'])

/** Catalogs are code, not data: an empty backend still ships them. */
const KEEP_WHEN_EMPTY: Record<string, readonly string[]> = {
  getReports: ['templates', 'elements'],
  getCanarytokens: ['types'],
  getAnalysisResults: ['analyzers', 'recipes'],
}

/** Fixed sets of measures: an empty backend reports each of them as zero
 * rather than dropping them (the KPI row still has its five tiles). */
const ZERO_ITEMS: Record<string, readonly string[]> = {
  getOverview: ['kpis'],
}

/** How long the "slow" scenario holds each call: 2.5 s, or APIARY_MOCK_SLOW_MS
 * (mock only). The smoke test raises it past Bun's old 10 s idle cut-off,
 * which emptied every slower answer (see server/idleTimeout.ts). */
function slowMs(): number {
  const configured = Number(process.env.APIARY_MOCK_SLOW_MS)
  return Number.isInteger(configured) && configured >= 0 ? configured : 2500
}

/** The same shape with nothing in it: arrays empty, numbers zero. */
function emptied<T>(value: T, keep: readonly string[] = [], zeroItems: readonly string[] = []): T {
  if (Array.isArray(value)) return [] as T
  if (typeof value === 'number') return 0 as T
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, keep.includes(key) ? v : zeroItems.includes(key) && Array.isArray(v) ? v.map((item: unknown) => emptied(item)) : emptied(v)]),
  ) as T
}

/** A stable third of the reads: the same calls fail on every visit. */
function failsPartly(name: string): boolean {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return hash % 3 === 0
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One query as the backend in `scenario` answers it. */
export function runScenario<TArgs extends unknown[], TResult>(name: string, query: (...args: TArgs) => Promise<TResult>, scenario: MockScenario): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    // The session comes from the sign-in cookie, not the backend: it
    // survives a backend outage, and only the role changes.
    // Cached configuration, like the session: it outlives a backend outage.
    if (name === 'getShellConfig' || name === 'getPreferences') return query(...args)
    // The Mock data menu's own controls work whatever the backend's state.
    if (MOCK_CONTROLS.has(name)) return query(...args)
    // The session is read from the sign-in cookie on every navigation, not
    // from the backend: a slow backend does not slow it.
    if (scenario === 'slow' && name !== 'getSessionUser') await wait(slowMs())
    if (scenario === 'unavailable' || (scenario === 'partial' && isRead(name) && failsPartly(name))) throw new ApiError('unavailable', name)
    if (scenario === 'overloaded') throw new ApiError('overloaded', name, { retryAfter: 30 })
    if (scenario === 'expired') throw new ApiError('expired', name)
    if (!isRead(name) && !READ_ONLY_EXEMPT.has(name) && readOnly()) throw new ApiError('locked', name)
    if (scenario === 'large' && isRead(name)) {
      const base = originalArgs(args) as TArgs
      return (await enlargedRead(await query(...base), base, (next) => query(...(next as TArgs)))) as TResult
    }
    const result = await query(...args)
    return scenario === 'empty' && isRead(name) ? emptied(result, KEEP_WHEN_EMPTY[name], ZERO_ITEMS[name]) : result
  }
}
