/**
 * Run work when the browser is idle. `requestIdleCallback` is missing from
 * WebKit (Safari, and every browser on iOS), so call this instead of the
 * global: without it a missing callback throws inside an effect and the
 * error boundary replaces the page. Where the callback is absent the work
 * runs from a timer after `fallbackMs`.
 */
export type IdleHandle = { cancel: () => void }

export function whenIdle(run: () => void, { timeout = 2000, fallbackMs = 350 }: { timeout?: number; fallbackMs?: number } = {}): IdleHandle {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout })
    return {
      cancel: () => {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id)
      },
    }
  }
  const id = setTimeout(run, fallbackMs)
  return { cancel: () => clearTimeout(id) }
}
