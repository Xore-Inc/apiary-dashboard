// GET /auth/logout — ends the session and lands on the signed-out sign-in
// page. A GET that changes state, so it demands a same-origin Origin or
// Referer: a cross-site page loading this URL gets 403 instead of signing
// the operator out (canonical #3153). With Keycloak it also ends the SSO
// session there (RP-initiated logout), which lands back on the same page.
import { createFileRoute } from '@tanstack/react-router'
import { crossOriginResponse, hasSameOriginHeader } from '#/server/origin'
import { warnThrottled } from '#/server/faults'
import { logoutURL } from '#/server/oidc.server'
import { oidcConfigured } from '#/server/policy'
import { clearSessionCookie, sessions, sidFrom } from '#/server/session'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasSameOriginHeader(request)) return crossOriginResponse()
        // Best effort: a store that does not answer still lets the operator
        // out here (the cookie goes), and the session expires on its own.
        const sid = sidFrom(request)
        const session = await sessions.get(sid).catch(() => null)
        await sessions.destroy(sid).catch((error: unknown) => warnThrottled('[session] could not end a session:', error))
        const location = oidcConfigured() ? await logoutURL(request, session?.idToken).catch(() => '/auth/login?signed_out=1') : '/auth/login?signed_out=1'
        return new Response(null, { status: 303, headers: { location, 'set-cookie': clearSessionCookie() } })
      },
    },
  },
})
