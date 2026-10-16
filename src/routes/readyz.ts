// GET /readyz — can this dashboard serve, given the backend it is deployed
// against? 200 when no backend is configured (mock) or every configured
// listener publishes a supported contract version; 503 with the reason
// otherwise (src/server/backendContract.ts).
//
// Distinct from /healthz on purpose: that is liveness, constant, and never
// touches the upstream, so a backend outage or an incompatible backend
// release cannot get a healthy dashboard container restarted. Wire this to
// a deploy gate or an operator, not to a restart policy. Unauthenticated
// like /healthz; the body names the listener and the reason, never a URL.
import { createFileRoute } from '@tanstack/react-router'
import { checkBackendContract } from '#/server/backendContract'

export const Route = createFileRoute('/readyz')({
  server: {
    handlers: {
      GET: async () => {
        const status = await checkBackendContract()
        return Response.json(status, { status: status.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } })
      },
    },
  },
})
