// Who may run which query, enforced on the server for every call: no session
// may run only the public queries, a viewer only the reads, an admin
// everything (APIARY#3857: viewers are strictly read-only; canonical let them
// make a few writes, see docs/migration/server-functions.md). Pages only
// mirror it to hide what a role cannot do. The backend applies the same rule
// behind this one (backend-service trust.rs).
import type { SessionUser } from '#/data/types'

/** Needed before sign-in: the navigation guard asks who is signed in, and
 * the sign-in pages render with the (default) preferences. */
export const PUBLIC_QUERIES: ReadonlySet<string> = new Set(['getSessionUser', 'getPreferences'])

/** The reads: what the backend answers on GET. A viewer may make these and
 * nothing else (APIARY#3857): viewers are strictly read-only, so every other
 * query, a new one included, is admin-only by default. `previewReport` and
 * `validateConfig` change nothing but are POSTs the backend refuses to a
 * viewer, so they are not reads here. */
export const isRead = (query: string): boolean => /^(get|search|semanticSearch)/.test(query) || query === 'resolveHash'

/** Reads only an admin may make: watching a live detonation through its VNC
 * bridge (dash#305) is at least as sensitive as starting one. */
export const ADMIN_READS: ReadonlySet<string> = new Set(['getSandboxVncBridge'])

/** Controls of the mock itself (src/data/scenario.ts), never backend calls:
 * the mock's incident switch works in every role so the viewer's states can
 * be designed. Gone with the mock (dash#324). */
export const MOCK_CONTROLS: ReadonlySet<string> = new Set(['simulateIncident', 'resolveIncidents'])

/** Refused to anyone but an admin: every write, and the admin-only reads. */
export const isAdminOnly = (query: string): boolean => ADMIN_READS.has(query) || (!isRead(query) && !MOCK_CONTROLS.has(query))

export type Decision = 'allowed' | 'sign-in' | 'admin-only'

export function authorize(query: string, user: SessionUser | null): Decision {
  if (PUBLIC_QUERIES.has(query)) return 'allowed'
  if (!user) return 'sign-in'
  if (isAdminOnly(query) && !user.roles.includes('admin')) return 'admin-only'
  return 'allowed'
}
