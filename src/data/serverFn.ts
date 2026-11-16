// The browser side of the data seam's server functions: the fetch every
// call goes through, and the record of every call the report-a-problem
// capture keeps. Client-safe.
import { ApiError, asApiError } from './errors'
import { sessionAwareFetch } from '#/lib/reauth'

/** Every call, as the browser sees it: the fetch log the report-a-problem
 * capture keeps (name, outcome, status, duration). */
export const API_CALL = 'apiary-api-call'
export type ApiCallRecord = { name: string; ok: boolean; status: number; ms: number; error?: string }

/** What crosses the wire, as Start's serializer can prove: JSON. The
 * exports keep each query's own types; this is only the handler's side. */
export type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json }

function announce(record: ApiCallRecord) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ApiCallRecord>(API_CALL, { detail: record }))
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** The fetch a server function's browser call goes through (#284, #291).
 *
 * It wraps the dashboard's own fetch (lib/reauth.ts), the same one start.ts
 * registers as `serverFns.fetch`: Start's client uses a call's own `fetch`
 * in place of that one, not around it, so whatever this wraps is what every
 * query reaches the server through. Wrapping plain `fetch` here dropped the
 * CSRF header from every call (the same-origin rule, server/origin.ts,
 * refused every POST with a 403) and the 401 → sign-in handling with it.
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
export function guardedFetch(name: string, fetchImpl: Fetcher = sessionAwareFetch): Fetcher {
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
