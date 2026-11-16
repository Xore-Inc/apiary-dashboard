// The one funnel every server function (src/data/queries.ts) calls: the
// request's signed-in user, then the live adapter that answers the query
// (src/data/api.ts), behind the same authorization decision for every one.
// Server-only; the browser never loads it.
import { ApiError } from './errors'
import { liveQuery, liveQueryNames } from './api'
import type { Queries } from './queries.contract'
import type { SessionUser } from './types'

/** The queries, by name. */
export type QueryName = keyof Queries
/** What answers every query: the live adapters. */
export type Backend = Queries

/** Every query the pages can make. */
export const queryNames = (): QueryName[] => liveQueryNames() as QueryName[]

/** The caller: a signed-in user, nobody (null), or the trusted internal
 * caller (undefined: a route that checks its own token), which is not
 * checked. */
export type Caller = SessionUser | null | undefined

/** One call from a server function: by name, with its arguments, for the
 * request's signed-in user. */
export async function runForRequest(name: string, args: unknown[]): Promise<unknown> {
  const [{ getRequest, setResponseStatus }, { resolveUser }] = await Promise.all([import('@tanstack/react-start/server'), import('#/server/identity')])
  const request = getRequest()
  const user = await resolveUser(request)
  const live = liveQuery(name, user, request.headers.get('x-request-id') || undefined)
  if (!live) throw new Error(`unknown query ${name}`)
  try {
    return await live(...args)
  } catch (error) {
    // The refusal is the response's status too (401, 403, 502, …), as the
    // real backend answers it, not only a message in the payload.
    if (error instanceof ApiError) setResponseStatus(error.status)
    throw error
  }
}
