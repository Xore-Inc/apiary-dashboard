// /auth/login: where every sign-in starts. It redirects to Keycloak straight
// away, and this page never renders; when Keycloak or the session store does
// not answer, it renders "temporarily unavailable". On a development
// instance with OIDC_DISABLED=1 nobody signs in, and the page says so.
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { AuthFrame, AuthProblem } from '#/components/auth/AuthFrame'
import { returnAfterSignIn, safeReturnTo } from '#/lib/returnTo'

type LoginSearch = { return_to?: string; signed_out?: boolean; fail?: 'unavailable' }

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    return_to: typeof search.return_to === 'string' ? search.return_to : undefined,
    signed_out: search.signed_out === true || search.signed_out === 1 || search.signed_out === '1' || undefined,
    fail: search.fail === 'unavailable' ? 'unavailable' : undefined,
  }),
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        const [{ oidcConfigured }, { recordNamedEvent }] = await Promise.all([import('#/server/policy'), import('#/server/obs')])
        if (!oidcConfigured() || new URL(request.url).searchParams.has('fail')) return next()
        try {
          const { beginLogin } = await import('#/server/oidc.server')
          return new Response(null, { status: 303, headers: { location: await beginLogin(request) } })
        } catch (error) {
          // Keycloak or Redis did not answer: say so, never a bare 500.
          console.warn('[auth] sign-in could not start:', error instanceof Error ? error.message : error)
          recordNamedEvent('auth_callback_failed', { reason: 'login_unavailable' })
          return new Response(null, { status: 303, headers: { location: '/auth/login?fail=unavailable' } })
        }
      },
    },
  },
  head: () => ({ meta: [{ title: 'Sign in · APIARY' }] }),
  component: Login,
})

function Login() {
  const { return_to, signed_out, fail } = Route.useSearch()
  const returnTo = safeReturnTo(return_to)
  if (fail === 'unavailable') {
    return <AuthProblem heading="Sign-in is temporarily unavailable" detail="The identity provider or session store did not answer, so this sign-in could not start. Reload to retry; if it persists the Keycloak tier may be degraded." />
  }
  // Only reachable without Keycloak: a development instance (OIDC_DISABLED=1).
  return (
    <AuthFrame title="Sign in">
      {signed_out && <Banner status="success" title="You are signed out" description="Your session here has ended." />}
      <Text color="secondary">Sign-in is off on this development instance (OIDC_DISABLED=1): every request is the development operator. With Keycloak configured this step is its sign-in page, and the dashboard never sees a password.</Text>
      <Button label="Continue" variant="primary" href={returnAfterSignIn(returnTo)} width="100%" />
    </AuthFrame>
  )
}
