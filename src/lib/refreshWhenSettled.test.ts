import { describe, expect, it } from 'vitest'
import { refreshWhenSettled } from './refreshWhenSettled'

function fakeRouter() {
  const listeners = new Set<() => void>()
  const router = {
    state: { status: 'idle', isLoading: false },
    invalidations: 0,
    invalidate: async () => {
      router.invalidations++
    },
    subscribe: (_: 'onResolved', fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    resolve(stillLoading = false) {
      router.state = stillLoading ? { status: 'pending', isLoading: true } : { status: 'idle', isLoading: false }
      for (const fn of [...listeners]) fn()
    },
    listeners,
  }
  return router
}

describe('refreshWhenSettled', () => {
  it('refreshes at once when no load is running', () => {
    const router = fakeRouter()
    refreshWhenSettled(router)
    expect(router.invalidations).toBe(1)
  })

  it('never supersedes a running load, however often live events ask', () => {
    const router = fakeRouter()
    router.state = { status: 'pending', isLoading: true }
    for (let i = 0; i < 10; i++) refreshWhenSettled(router)
    expect(router.invalidations).toBe(0)
    router.resolve(true)
    expect(router.invalidations).toBe(0)
    router.resolve()
    expect(router.invalidations).toBe(1)
    expect(router.listeners.size).toBe(0)
  })

  it('defers again for the next load once the first deferred refresh ran', () => {
    const router = fakeRouter()
    router.state = { status: 'pending', isLoading: true }
    refreshWhenSettled(router)
    router.resolve()
    router.state = { status: 'pending', isLoading: true }
    refreshWhenSettled(router)
    expect(router.invalidations).toBe(1)
    router.resolve()
    expect(router.invalidations).toBe(2)
  })
})
