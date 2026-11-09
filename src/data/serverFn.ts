// The browser side of the data seam's server functions: which mock scenario
// a call runs in, and the record of every call the report-a-problem capture
// keeps. Client-safe.
import { createIsomorphicFn, createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { ApiError, asApiError } from './errors'
import { API_CALL, isScenario } from './scenarios'
import type { ApiCallRecord, MockScenario } from './scenarios'
import { mockScenariosAllowed } from '#/server/policy'

// The browser's scenario for the navigation in progress: the layout sets it
// before any loader runs, because the address bar only changes once the
// navigation commits.
let navigationScenario: MockScenario | undefined

/** Called by the layout's beforeLoad with the destination's `?mock=`. */
export function setNavigationScenario(scenario: MockScenario | undefined) {
  if (typeof window !== 'undefined') navigationScenario = scenario ?? 'normal'
}

const fromSearch = (search: URLSearchParams): MockScenario => {
  const mock = search.get('mock')
  return isScenario(mock) ? mock : 'normal'
}

/** On the server: the `?mock=` of the page request being rendered. Outside
 * a request (tests, scripts) there is none: the normal backend. */
const requestScenario = createIsomorphicFn()
  .server((): MockScenario => {
    try {
      return fromSearch(getRequestUrl().searchParams)
    } catch {
      return 'normal'
    }
  })
  .client((): MockScenario => 'normal')

/** The scenario of the page making the call: its `?mock=`, from the
 * navigation in progress (else the address bar) in the browser and from
 * the page request during SSR. */
export function pageScenario(): MockScenario {
  if (typeof window !== 'undefined') return navigationScenario ?? fromSearch(new URLSearchParams(window.location.search))
  return requestScenario()
}

/** Sends the page's scenario with every call; the handler reads it from
 * `context.mock`. A mock-only concern: the real backend has no scenarios. */
export const mockScenarioMiddleware = createMiddleware({ type: 'function' })
  .client(({ next }) => next({ sendContext: { mock: pageScenario() } }))
  .server(({ next, context }) => next({ context: { mock: mockScenariosAllowed() && isScenario(context.mock) ? context.mock : 'normal' } }))

/** Whether the Mock data menu may show: the server's policy, since only the
 * server knows whether a live backend is configured. */
export const getMockScenariosAllowed = createServerFn({ method: 'GET' }).handler(() => mockScenariosAllowed())

/** The clock the pages count times from: the mock tier's fixed clock when no
 * live backend answers (its fixtures are relative to it), else null, the
 * wall clock. Pure: the handler supplies both inputs. */
export const clockFor = (live: boolean, mockNow: number): number | null => (live ? null : mockNow)

/** The mock clock, decided by whether a live backend is configured (not by
 * the dev scenario override: a live backend always runs on the real clock).
 * The mock and live modules load only inside the handler, on the server. */
export const getMockClock = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ isLiveBackend }, { MOCK_NOW }] = await Promise.all([import('./api'), import('./mock/random')])
  return clockFor(isLiveBackend(), MOCK_NOW)
})

/** What crosses the wire, as Start's serializer can prove: JSON. The
 * exports keep each query's own types; this is only the handler's side. */
export type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json }

function announce(record: ApiCallRecord) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ApiCallRecord>(API_CALL, { detail: record }))
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** The fetch a server function's browser call goes through (#284).
 *
 * The BFF answers a refusal as a serialized `ApiError` with its HTTP status
 * (a 502 for `unavailable`). The Cloudflare zone in front of production
 * replaces a 502 or 504 body with its own JSON document, and Start's client
 * returns any JSON body without the `x-tss-serialized` marker as the call's
 * result, so the page received Cloudflare's document as if it were data and
 * crashed on it. A 5xx the BFF did not serialize is the same refusal as the
 * BFF's own `unavailable`, wherever it was produced (Cloudflare, Traefik, a
 * restarting container), so it is raised as that: the loaders' gap handling
 * and the error boundary already know what to do with it. A BFF answer
 * (marked) passes through untouched, and so does an abort. */
export function guardedFetch(name: string, fetchImpl: Fetcher = (input, init) => fetch(input, init)): Fetcher {
  return async (input, init) => {
    let response: Response
    try {
      response = await fetchImpl(input, init)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      if (error instanceof TypeError) throw new ApiError('unavailable', name, { detail: 'The dashboard server did not answer.', backendUnreachable: true })
      throw error
    }
    if (response.status >= 500 && !response.headers.get('x-tss-serialized') && !response.headers.get('x-tss-raw')) {
      void response.body?.cancel().catch(() => {})
      throw new ApiError('unavailable', name, { detail: `The gateway answered ${response.status} without the backend's response.` })
    }
    return response
  }
}

/** A server function called with the query's own arguments, timed and
 * announced, so pages keep calling `getEvents(filters)`. */
export function announced(name: string, fn: (options: { data: unknown[]; fetch?: Fetcher }) => Promise<unknown>) {
  const guarded = guardedFetch(name)
  return async (...args: unknown[]) => {
    const started = Date.now()
    try {
      const result = await fn({ data: args, fetch: guarded })
      announce({ name, ok: true, status: 200, ms: Date.now() - started })
      return result
    } catch (error) {
      const api = asApiError(error)
      announce({ name, ok: false, status: api ? api.status : error instanceof ApiError ? error.status : 500, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
}
