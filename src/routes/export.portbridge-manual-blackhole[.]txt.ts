// GET /export/portbridge-manual-blackhole.txt — the manual blackhole list the
// VPS firewall puller reads (every five minutes; the body must stay
// byte-identical across the cutover).
//
// Two callers may read it, and nobody else:
// - a machine client sending `X-Export-Token` equal to EXPORT_TOKEN (the VPS
//   job, vps/portbridge-manual-blackhole-refresh.sh). SERVICE_TOKEN is not
//   accepted here: it reaches the whole backend, and the VPS must not hold it;
// - a signed-in session whose role the query policy allows for `getBlockedIps`.
// Anything else is 401 (no credentials) or 403 (signed in, role refused).
import { createFileRoute } from '@tanstack/react-router'
import { blackholeExport, serveDownload } from '#/data/downloads'
import { authorize } from '#/server/authorize'
import { resolveUser } from '#/server/identity'
import { hasExportToken } from '#/server/exportToken'

const text = (status: number, message: string) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })

export const Route = createFileRoute('/export/portbridge-manual-blackhole.txt')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasExportToken(request)) {
          const user = await resolveUser(request)
          if (!user) return text(401, 'unauthorized')
          if (authorize('getBlockedIps', user) !== 'allowed') return text(403, 'forbidden')
        }
        return serveDownload(request, blackholeExport(), { session: false })
      },
    },
  },
})
