// GET /api/chart/$name — the Rust tier's chart payloads, passed through
// unchanged for a signed-in operator. Allowlisted: only chart names reach
// the backend (404 otherwise), and a chart the backend cannot answer is 502.
//
// The allowlist is the contract, and it is checked BEFORE the backend is
// called, so the browser can only ever reach one of the Rust tier's own 21
// chart routes (`isChartName`). Each name was confirmed to be a registered
// axum path, so an allowlisted name that the tier cannot answer is a real
// outage or a 404 from the tier — both 502 — never a wrong or default
// payload for some other chart.
import { createFileRoute } from '@tanstack/react-router'
import { isChartName } from '#/data/contracts/charts'
import { serveDownload } from '#/data/downloads'
import { ApiError } from '#/data/errors'
import { liveChart } from '#/data/api'

const plain = (status: number, message: string) => new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

export const Route = createFileRoute('/api/chart/$name')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        serveDownload(request, async (search) => {
          if (!isChartName(params.name)) return plain(404, 'unknown chart')
          try {
            const data = await liveChart(params.name, search)
            if (data === null) return plain(502, 'chart unavailable')
            return Response.json(data, { headers: { 'cache-control': 'no-store' } })
          } catch (error) {
            // Every refusal is one answer here, as canonical's chart proxy
            // makes it (`serviceJSON` collapses any failure to null, then
            // 502): this route exists to serve one named chart, so "the tier
            // will not give it to us" has one rendering — unavailable, never
            // a payload, and never a status the page would read as a
            // different fault. A 503 is included: the tier shedding is still
            // this chart being unavailable.
            if (error instanceof ApiError) return plain(502, 'chart unavailable')
            throw error
          }
        }),
    },
  },
})
