// The shell's one live switch, as the real dashboard has it: one paused
// state over every refresh path, one connection-health signal (the LIVE
// badge is the only indicator, no per-page pill), one shared stream, and one
// polling discipline. Paused persists in this browser, so the choice
// survives a reload.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from '@tanstack/react-router'
import { openLiveStream } from '#/data/liveStream'
import { refreshWhenSettled } from '#/lib/refreshWhenSettled'
import type { HoneypotEvent } from '#/data/types'

type LiveState = { paused: boolean; connectionHealthy: boolean }

const PAUSED_KEY = 'apiary-live-paused'
/** Fired when live resumes, so pages show current data at once. */
export const LIVE_RESUMED = 'apiary-live-resumed'

let state: LiveState = { paused: false, connectionHealthy: true }
const listeners = new Set<() => void>()

function set(next: Partial<LiveState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

let restored = false
function restorePaused(autoRefresh = true) {
  if (restored || typeof window === 'undefined') return
  restored = true
  let stored: string | null = null
  try {
    stored = localStorage.getItem(PAUSED_KEY)
  } catch {
    /* storage unavailable: the preference decides */
  }
  // The badge's own last choice wins; without one, "refresh automatically"
  // off means starting paused.
  if (stored === '1' || (stored === null && !autoRefresh)) {
    set({ paused: true })
    syncStream()
  }
}

export const isLivePaused = () => state.paused

export function toggleLive() {
  set({ paused: !state.paused })
  try {
    localStorage.setItem(PAUSED_KEY, state.paused ? '1' : '0')
  } catch {
    /* storage unavailable: the switch still works for this tab */
  }
  syncStream()
  if (!state.paused) window.dispatchEvent(new Event(LIVE_RESUMED))
}

// ---- The shared stream: open while anything listens and live is on --------

type Handler = (event: HoneypotEvent) => void
const handlers = new Set<Handler>()
let close: (() => void) | undefined

function syncStream() {
  if (typeof window === 'undefined') return
  const wanted = handlers.size > 0 && !state.paused
  if (wanted && !close) {
    close = openLiveStream({
      onEvent: (event) => {
        for (const handler of handlers) handler(event)
      },
      onHealth: (healthy) => {
        if (state.connectionHealthy !== healthy) set({ connectionHealthy: healthy })
      },
    })
  } else if (!wanted && close) {
    close()
    close = undefined
    // Closing on purpose is not a connection failure.
    if (!state.connectionHealthy) set({ connectionHealthy: true })
  }
}

/** Listen to live events while mounted (and live is on). */
export function useLiveEvents(handler: Handler) {
  useEffect(() => {
    handlers.add(handler)
    syncStream()
    return () => {
      handlers.delete(handler)
      syncStream()
    }
  }, [handler])
}

const serverSnapshot: LiveState = { paused: false, connectionHealthy: true }

export function useLiveState(autoRefresh?: boolean): LiveState {
  useEffect(() => restorePaused(autoRefresh), [autoRefresh])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => serverSnapshot,
  )
}

/** Run `fn` every `ms`, but only while the tab is visible and live is on,
 * plus once the moment live resumes. `fn` should be stable (useCallback). */
export function useLiveInterval(fn: () => void, ms: number, { leading = false, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return
    if (leading) fn()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLivePaused()) fn()
    }, ms)
    window.addEventListener(LIVE_RESUMED, fn)
    return () => {
      clearInterval(timer)
      window.removeEventListener(LIVE_RESUMED, fn)
    }
  }, [fn, ms, enabled, leading])
}

/** Reload the page's data as live events arrive, at most every `minMs`,
 * and at once when live resumes. Returns how many events arrived since the
 * page opened, for a quiet "N new" line. */
export function useLiveRefresh(minMs = 5000): number {
  const router = useRouter()
  const [arrived, setArrived] = useState(0)
  const last = useRef(0)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  const refresh = useCallback(() => {
    last.current = Date.now()
    pending.current = undefined
    // Never on top of a load still running: that would discard it (lib/refreshWhenSettled).
    refreshWhenSettled(router)
  }, [router])
  const onEvent = useCallback(() => {
    setArrived((n) => n + 1)
    if (Date.now() - last.current >= minMs) refresh()
    else pending.current ??= setTimeout(refresh, minMs - (Date.now() - last.current))
  }, [minMs, refresh])
  useLiveEvents(onEvent)
  useEffect(() => {
    window.addEventListener(LIVE_RESUMED, refresh)
    return () => {
      window.removeEventListener(LIVE_RESUMED, refresh)
      clearTimeout(pending.current)
    }
  }, [refresh])
  return arrived
}
