// How long the Bun server keeps a connection open while no bytes flow
// (Bun.serve `idleTimeout`, in seconds). Bun's default is 10 s, and it cuts
// a request whose answer has not started yet as readily as an idle
// keep-alive: the browser gets an empty response (ERR_EMPTY_RESPONSE).
//
// That default broke the 2026-11-01 beta check. A page's server functions
// wait on the backend, and the aggregate reads take 14-19 s on a cold
// cache; every one of them was cut at 10 s, so the page stayed on its
// skeleton. The backend calls still finished and filled the shared read
// cache, which is why a manual refresh then worked.
//
// So the window must outlast the slowest answer this process will still
// give: one backend call can take BACKEND_TIMEOUT_MS after waiting its turn
// in the limiter, and a server function may make more than one. The default
// is four backend timeouts, within Bun's 255 s ceiling. BFF_IDLE_TIMEOUT_S
// overrides it; a value below one backend timeout plus margin is refused,
// since it would bring this failure back.

type Env = Record<string, string | undefined>

export const IDLE_TIMEOUT_ENV = 'BFF_IDLE_TIMEOUT_S'
export const IDLE_TIMEOUT_GATE_CODE = 'E-IDLE-TIMEOUT'
/** Bun refuses anything above this. */
export const BUN_MAX_IDLE_TIMEOUT_S = 255
const DEFAULT_BACKEND_TIMEOUT_MS = 30_000
const MARGIN_S = 5

const positiveInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

export type IdleTimeoutPolicy = { kind: 'seconds'; seconds: number } | { kind: 'refuse'; message: string }

export function idleTimeoutPolicy(env: Env = process.env): IdleTimeoutPolicy {
  const backendS = Math.ceil((positiveInt(env.BACKEND_TIMEOUT_MS) ?? DEFAULT_BACKEND_TIMEOUT_MS) / 1000)
  const floor = backendS + MARGIN_S
  const raw = env[IDLE_TIMEOUT_ENV]
  if (raw === undefined || raw.trim() === '') {
    return { kind: 'seconds', seconds: Math.min(BUN_MAX_IDLE_TIMEOUT_S, Math.max(floor, backendS * 4)) }
  }
  const seconds = positiveInt(raw)
  if (seconds === undefined || seconds > BUN_MAX_IDLE_TIMEOUT_S) {
    return { kind: 'refuse', message: `[${IDLE_TIMEOUT_GATE_CODE}] ${IDLE_TIMEOUT_ENV}=${JSON.stringify(raw)}: use whole seconds from 1 to ${BUN_MAX_IDLE_TIMEOUT_S}` }
  }
  if (seconds < floor) {
    return {
      kind: 'refuse',
      message: `[${IDLE_TIMEOUT_GATE_CODE}] ${IDLE_TIMEOUT_ENV}=${seconds} is shorter than one backend call (BACKEND_TIMEOUT_MS ${backendS} s + ${MARGIN_S} s): slow pages would get an empty response and stay on their skeletons`,
    }
  }
  if (floor > BUN_MAX_IDLE_TIMEOUT_S) {
    return { kind: 'refuse', message: `[${IDLE_TIMEOUT_GATE_CODE}] BACKEND_TIMEOUT_MS ${backendS} s does not fit Bun's ${BUN_MAX_IDLE_TIMEOUT_S} s idle ceiling` }
  }
  return { kind: 'seconds', seconds }
}

/** The value for Bun.serve; exits like the other boot policies on a refusal. */
export function serverIdleTimeoutSeconds(env: Env = process.env): number {
  const policy = idleTimeoutPolicy(env)
  if (policy.kind === 'refuse') {
    console.error(policy.message)
    process.exit(1)
  }
  return policy.seconds
}
