// Failures of the tiers the dashboard depends on but does not own (the
// session store, the identity provider), logged without flooding the log.
let lastWarning = 0

/** Logs a dependency failure at most every 30 s, so a flapping store
 * cannot flood the log (canonical throttles its Redis errors the same). */
export function warnThrottled(message: string, error: unknown, now = Date.now()) {
  if (now - lastWarning < 30_000) return
  lastWarning = now
  console.warn(message, error instanceof Error ? error.message : error)
}
