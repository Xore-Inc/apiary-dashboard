// Operational toasts: something is wrong, or stopped being wrong. Not
// "new events arrived": that is the normal state, the LIVE badge already
// says the stream is up, and a toast that always fires trains the eye to
// ignore the corner where real problems appear.
//
// Edge-triggered: a condition raises one toast when it becomes true and
// one when it clears. The first poll only records what is already true;
// opening the dashboard mid-outage belongs on the source-health page, the
// toast is for changes since you looked.
import { useCallback, useEffect, useRef } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { HStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { useToast } from '@astryxdesign/core/Toast'
import { getSettings, getSourceHealth } from '#/data/queries'
import { HEALTH_CHANGED } from '#/data/incidents'
import type { SourceHealth } from '#/data/types'
import { conditionsFrom, transitions } from '#/lib/healthConditions'
import type { Condition, Severity } from '#/lib/healthConditions'
import { useLiveInterval } from '#/lib/live'

/** Health conditions move on the order of minutes; polling faster only
 * adds requests. The operator's toast interval can slow it, not speed it. */
const MIN_POLL_MS = 60_000
const TOAST_MS = 12_000

const DOT = { warning: 'warning', danger: 'error', success: 'success' } as const

export function LiveToasts() {
  const toast = useToast()
  const known = useRef<Map<string, Condition>>(new Map())
  const primed = useRef(false)
  const prefs = useRef({ enabled: true, seconds: 60 })

  useEffect(() => {
    void getSettings()
      .then((s) => {
        prefs.current = { enabled: s.preferences.liveToasts, seconds: s.preferences.liveToastSeconds }
      })
      .catch(() => {})
  }, [])

  const show = useCallback(
    (condition: Condition, message: string, severity: Severity) =>
      toast({
        body: (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={DOT[severity]} label={severity} />
            <Link href={condition.to}>{message}</Link>
          </HStack>
        ),
        type: severity === 'danger' ? 'error' : 'info',
        autoHideDuration: TOAST_MS,
        uniqueID: `${condition.key}:${severity}`,
      }),
    [toast],
  )

  const poll = useCallback(async () => {
    if (!prefs.current.enabled) return
    let health: SourceHealth
    try {
      health = await getSourceHealth()
    } catch {
      // The dashboard's own backend failing is the page's to show, not a
      // toast per blip.
      return
    }
    // An error response can resolve to nothing at all rather than throw;
    // treat it like the failure above, not as an empty fleet.
    if (!Array.isArray((health as Partial<SourceHealth> | undefined)?.feeds)) return
    const current = conditionsFrom(health)
    const { raised, cleared } = transitions(known.current, current)
    if (primed.current) {
      for (const condition of raised) show(condition, condition.message, condition.severity)
      for (const condition of cleared) show(condition, `Resolved: ${condition.message}`, 'success')
    }
    primed.current = true
    known.current = new Map(current.map((c) => [c.key, c]))
  }, [show])

  useLiveInterval(poll, Math.max(MIN_POLL_MS, prefs.current.seconds * 1000), { leading: true })

  // A simulated incident is a change worth seeing now, not in a minute.
  useEffect(() => {
    const now = () => void poll()
    window.addEventListener(HEALTH_CHANGED, now)
    return () => window.removeEventListener(HEALTH_CHANGED, now)
  }, [poll])

  return null
}
