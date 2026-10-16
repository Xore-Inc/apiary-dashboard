// Who is asking: the session behind the request's cookie, as the pages know
// a user. With OIDC_DISABLED=1 (development only, see policy.ts) everyone is
// the fixture admin, as in the canonical dev mode.
import type { SessionUser } from '#/data/types'
import { rememberActor } from './actorAssertion'
import { warnThrottled } from './faults'
import { oidcDisabled } from './policy'
import { sessions, sidFrom } from './session'
import type { Session } from './session'

export const FIXTURE_ADMIN: SessionUser = rememberActor({ name: 'Dev Operator', email: 'operator@example.test', roles: ['admin'] }, { sub: 'dev-operator', username: 'dev-operator' })

/** The page-facing user. `Session.sub` and `Session.username` ride along
 * server-side only (`actorOf`), for the signed actor assertion (#249): the
 * username claim is the OIDC username, not the display name. */
export const userOf = (session: Session): SessionUser =>
  rememberActor({ name: session.displayName, email: session.email, roles: [session.role] }, { sub: session.sub, username: session.username })

/** A store that does not answer signs nobody in: the request is treated
 * as signed out (sign-in, 401), never as an error page or a guess. */
export async function resolveUser(request: Request): Promise<SessionUser | null> {
  const session = await sessions.get(sidFrom(request)).catch((error: unknown) => {
    warnThrottled('[session] store did not answer:', error)
    return null
  })
  if (session) return userOf(session)
  return oidcDisabled() ? FIXTURE_ADMIN : null
}

export const isAdmin = (user: SessionUser | null) => !!user?.roles.includes('admin')
