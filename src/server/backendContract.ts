// Whether the backend(s) this process is configured against speak an HTTP
// contract this build understands (#244).
//
// The dashboard and backend-service are released and deployed
// independently, so "same git revision" is neither achievable nor
// meaningful. What a caller can rely on is the contract version the backend
// publishes: `api_version` on its public `/healthz` (backend-service
// `API_VERSION`, also `info.x-api-version` in its `openapi.json`). This
// build supports the versions below, and `contracts/backend/openapi.json`
// is the pinned artifact one of them was taken from (`src/data/contract.test.ts`
// keeps the two in step).
//
// Used by `/readyz` only. `/healthz` stays pure liveness and never calls
// the backend: a backend problem must not restart a healthy dashboard.

/** Backend contract versions this build is written against. Add a version
 * here only after the pin (`bun run contract:sync`) and the hand-written
 * contracts have moved to it; drop one when no deployed backend serves it. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [1]

export interface ListenerStatus {
  /** `standard` is BACKEND_URL; `mounted` is BACKEND_MOUNTED_URL. */
  listener: 'standard' | 'mounted'
  ok: boolean
  /** Why not ok. Never carries the upstream URL. */
  reason?: string
  apiVersion?: number
}

export interface BackendContractStatus {
  /** False only when a configured listener is unreachable or unsupported. */
  ok: boolean
  /** No BACKEND_URL: this process serves the mock and talks to nobody. */
  configured: boolean
  listeners: ListenerStatus[]
}

const PROBE_TIMEOUT_MS = 3_000

async function probe(listener: ListenerStatus['listener'], base: string, fetchImpl: typeof fetch): Promise<ListenerStatus> {
  let body: unknown
  try {
    const response = await fetchImpl(`${base.replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!response.ok) return { listener, ok: false, reason: `backend unreachable: /healthz answered ${response.status}` }
    body = await response.json()
  } catch {
    return { listener, ok: false, reason: 'backend unreachable' }
  }
  const version = (body as { api_version?: unknown } | null)?.api_version
  if (typeof version !== 'number') return { listener, ok: false, reason: `unsupported backend API: no api_version published (supported: ${SUPPORTED_API_VERSIONS.join(', ')})` }
  if (!SUPPORTED_API_VERSIONS.includes(version)) return { listener, ok: false, apiVersion: version, reason: `unsupported backend API: version ${version} (supported: ${SUPPORTED_API_VERSIONS.join(', ')})` }
  return { listener, ok: true, apiVersion: version }
}

/** Probes BACKEND_URL and, when it names a different instance,
 * BACKEND_MOUNTED_URL (which falls back to BACKEND_URL when unset, exactly
 * as `baseURL` in src/data/api.ts does). */
export async function checkBackendContract(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<BackendContractStatus> {
  const standard = env.BACKEND_URL?.trim()
  if (!standard) return { ok: true, configured: false, listeners: [] }
  const mounted = env.BACKEND_MOUNTED_URL?.trim()
  const probes = [probe('standard', standard, fetchImpl)]
  if (mounted && mounted.replace(/\/$/, '') !== standard.replace(/\/$/, '')) probes.push(probe('mounted', mounted, fetchImpl))
  const listeners = await Promise.all(probes)
  return { ok: listeners.every((l) => l.ok), configured: true, listeners }
}
