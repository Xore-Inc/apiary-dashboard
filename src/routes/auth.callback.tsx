// /auth/callback: where the identity provider sends the browser back. A
// completed sign-in goes on to where the operator was; a failed one renders
// what went wrong, in the three ways production tells apart:
// - the provider refused the attempt (`?error=`, 400),
// - the attempt expired or was already used (400),
// - the token exchange failed (502).
// The server handler completes the flow with Keycloak and sends a failure
// here as `?code=expired|failed`. Answers 200: the router renders only 200,
// 404 and 500.
import { createFileRoute } from '@tanstack/react-router'
import { AuthProblem } from '#/components/auth/AuthFrame'

type CallbackSearch = { code?: string; error?: string; error_description?: string }

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/auth/callback')({
  validateSearch: (search: Record<string, unknown>): CallbackSearch => ({
    code: text(search.code),
    error: text(search.error),
    error_description: text(search.error_description),
  }),
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        const [{ oidcConfigured }, { recordNamedEvent }] = await Promise.all([import('#/server/policy'), import('#/server/obs')])
        const params = new URL(request.url).searchParams
        // Without Keycloak nothing signs in: only the failure pages render.
        if (!oidcConfigured()) return next()
        if (params.has('error')) {
          console.warn(`[auth] the identity provider refused a sign-in: ${params.get('error')}`, params.get('error_description') ?? '')
          recordNamedEvent('auth_callback_failed', { reason: `provider_${params.get('error')}` })
        }
        // No state: one of the failure pages below, rendered by the router.
        if (!params.has('state')) return next()
        const fail = (reason: string) => {
          recordNamedEvent('auth_callback_failed', { reason })
          return new Response(null, { status: 303, headers: { location: `/auth/callback?code=${reason}` } })
        }
        const [{ completeLogin }, { sessionCookie }, { returnAfterSignIn: serverReturnAfterSignIn }] = await Promise.all([
          import('#/server/oidc.server'),
          import('#/server/session'),
          import('#/lib/returnTo'),
        ])
        try {
          const done = await completeLogin(request)
          if (!done) return fail('expired')
          recordNamedEvent('auth_callback_completed', {})
          return new Response(null, { status: 303, headers: { location: serverReturnAfterSignIn(done.returnTo), 'set-cookie': sessionCookie(done.sid) } })
        } catch (error) {
          console.warn('[auth] sign-in could not be completed:', error instanceof Error ? error.message : error)
          return fail('failed')
        }
      },
    },
  },
  head: () => ({ meta: [{ title: 'Sign in · APIARY' }] }),
  component: Callback,
})

function Callback() {
  const { code, error } = Route.useSearch()
  if (error) {
    return <AuthProblem heading="Sign-in was not completed" detail={`The identity provider refused this sign-in attempt (${error}). This usually means the attempt expired or was already used.`} retryHref="/auth/login" />
  }
  if (code === 'failed') {
    return <AuthProblem heading="Sign-in could not be completed" detail="The identity provider did not accept the token exchange. If this keeps happening, the Keycloak tier may be degraded." retryHref="/auth/login" />
  }
  return <AuthProblem heading="Login attempt expired" detail="This sign-in took too long or was already completed. Start again to continue." retryHref="/auth/login" />
}
