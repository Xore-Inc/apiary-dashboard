// GET /metrics: this tier's Prometheus series (src/server/obs.ts). The
// tier faces the internet through Traefik, so the exposition needs the
// shared service token in `x-service-token`; only an instance that booted
// with the explicit development override (no token at all) serves it open.
import { timingSafeEqual } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { serviceTokenPolicy } from '#/server/policy'
import { secretValue } from '#/server/secret'

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const Route = createFileRoute('/metrics')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const open = serviceTokenPolicy().kind === 'dev-override'
        const expected = secretValue('SERVICE_TOKEN')
        if (!open && !(expected && sameSecret(request.headers.get('x-service-token') ?? '', expected))) return new Response('unauthorized', { status: 401 })
        const { renderMetrics } = await import('#/server/obs')
        return new Response(renderMetrics(), { headers: { 'content-type': 'text/plain; version=0.0.4', 'cache-control': 'no-store' } })
      },
    },
  },
})
