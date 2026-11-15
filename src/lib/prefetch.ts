// Predictive prefetch: after each navigation settles, the likely next
// routes are preloaded while the browser is idle, so their data is in the
// cache by the time the click lands. The router's own preloading covers the
// links themselves: intent (hover, focus, touch) by default, and viewport
// for a list's first rows (components/RecordList.tsx). This layer adds what
// the router has no strategy for, pages one is likely to open next that no
// link on screen points at yet, through the router's own preloadRoute; so
// nothing here duplicates it (#309). A preload answers from the data cache
// when it can and never starts a slow panel (lib/query.ts), so a prediction
// of a page already cached costs no call. It can be switched off per
// browser (Settings → Navigation), with the same storage key as the
// canonical dashboard.
import { useEffect } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'

/** Where operators go next: sidebar neighbours and the investigation flow
 * (overview → events → sources; campaigns and clusters ↔ attackers). */
const PREDICTIONS: Record<string, string[]> = {
  '/': ['/events', '/ips', '/alerts'],
  '/events': ['/ips', '/campaigns', '/recordings'],
  '/ips': ['/events', '/campaigns', '/attackers'],
  '/campaigns': ['/clusters', '/attackers', '/kill-chain'],
  '/clusters': ['/attackers', '/campaigns', '/events'],
  '/attackers': ['/kill-chain', '/events', '/clusters'],
  '/kill-chain': ['/commands', '/campaigns'],
  '/commands': ['/recordings', '/events'],
  '/recordings': ['/events', '/commands'],
  '/alerts': ['/events', '/source-health'],
  '/source-health': ['/history', '/alerts'],
  '/payloads': ['/payload-workbench/results', '/events'],
}

const KEY = 'hp-prefetch'

export function prefetchEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setPrefetchEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    /* storage unavailable */
  }
}

export function usePredictivePrefetch() {
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    const targets = PREDICTIONS[pathname] as string[] | undefined
    if (!targets || !prefetchEnabled()) return
    let cancelled = false
    const run = () => {
      if (cancelled) return
      for (const href of targets) router.preloadRoute({ to: href as '/' }).catch(() => {
        /* a missed prediction costs nothing */
      })
    }
    const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 350)
    return () => {
      cancelled = true
      if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle)
      else clearTimeout(idle)
    }
  }, [router, pathname])
}
