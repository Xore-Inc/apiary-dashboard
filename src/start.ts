// The Start instance: middleware every server function runs behind. The
// same-origin rule comes first (CSRF): a call that can change state must
// come from a page of this dashboard, through its own fetch (lib/reauth.ts),
// which also sends an expired session back to sign-in. A query's own call
// fetch (data/serverFn.ts `guardedFetch`) replaces this one in Start's client,
// so it wraps the same fetch (#291). Who may run which query is decided
// per call on the server (src/data/backend.ts, src/server/authorize.ts),
// where the query's name is known.
import { createMiddleware, createStart } from '@tanstack/react-start'
import { sessionAwareFetch } from './lib/reauth'

const sameOrigin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const [{ getRequest }, { crossOriginResponse, isSameOriginRequest }] = await Promise.all([import('@tanstack/react-start/server'), import('./server/origin')])
  if (!isSameOriginRequest(getRequest())) throw crossOriginResponse()
  return next()
})

// Every HTTP request runs inside its Content-Security-Policy nonce's scope
// (lib/cspNonce.server.ts), before anything renders, and is counted and
// timed for /metrics.
const csp = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const started = performance.now()
  const [{ withCspScope }, { recordRequest }] = await Promise.all([import('./lib/cspNonce.server'), import('./server/obs')])
  return withCspScope(next).finally(() => recordRequest(performance.now() - started))
})

export const startInstance = createStart(() => ({ requestMiddleware: [csp], functionMiddleware: [sameOrigin], serverFns: { fetch: sessionAwareFetch } }))
