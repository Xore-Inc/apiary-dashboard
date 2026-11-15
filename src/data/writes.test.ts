// The dashboard's writes (#309) against the in-process mock backend:
// acknowledging shows at once in the alert list, the detail and the bell's
// count, is rolled back exactly when refused, and every write invalidates
// what it changes.
import { describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { createQueryClient } from '#/lib/query'
import { mutationOptions } from '#/lib/mutation'
import { alertKeyOf } from './shared'
import { alertDetailQuery, alertsQuery, openAlertCountQuery, preferencesQuery } from './resources'
import * as writes from './writes'

vi.mock('#/data/queries', () => import('#/test/queriesOnBackend').then((m) => m.queriesOnBackend()))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mounted() {
  const queryClient = createQueryClient()
  const groups = await queryClient.query(alertsQuery())
  const open = groups.find((g) => !g.acknowledged)!
  const detail = alertDetailQuery(alertKeyOf(open))
  const off = [new QueryObserver(queryClient, alertsQuery()), new QueryObserver(queryClient, detail), new QueryObserver(queryClient, openAlertCountQuery())].map((o) => o.subscribe(() => {}))
  await settle()
  return { queryClient, open, detail, off, reloadRoutes: vi.fn(async () => {}) }
}

describe('acknowledging an alert', () => {
  it('shows at once in the list, the detail and the bell, and holds once confirmed', async () => {
    const t = await mounted()
    const countBefore = t.queryClient.getQueryData(openAlertCountQuery().queryKey)!
    // The real write, held until the optimistic state has been looked at.
    let release: () => void = () => {}
    const real = writes.acknowledgeAlertsWrite()
    const held = { ...real, write: async (vars: { keys: string[]; acknowledged: boolean }) => (await new Promise<void>((resolve) => (release = resolve)), real.write(vars)) }
    const ack = new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, held))
    const done = ack.mutate({ keys: t.open.members.map((m) => m.key), acknowledged: true })
    await settle()
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)!.find((g) => g.id === t.open.id)?.acknowledged).toBe(true)
    expect(t.queryClient.getQueryData(t.detail.queryKey)?.group.acknowledged).toBe(true)
    expect(t.queryClient.getQueryData(openAlertCountQuery().queryKey)).toBe(countBefore - t.open.members.length)
    release()
    await done
    // The server's own answer, read again, agrees (its group id now says
    // acknowledged; the members are the same).
    const key = t.open.members[0].key
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)!.find((g) => g.members.some((m) => m.key === key))?.acknowledged).toBe(true)
    expect(t.reloadRoutes).toHaveBeenCalledTimes(1)
    // Reopen, for the next test's fixtures.
    await new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, writes.acknowledgeAlertsWrite())).mutate({ keys: t.open.members.map((m) => m.key), acknowledged: false })
    for (const off of t.off) off()
  })

  it('is rolled back when the backend refuses it (a viewer, 403)', async () => {
    const t = await mounted()
    const before = t.queryClient.getQueryData(alertsQuery().queryKey)
    const refused = { ...writes.acknowledgeAlertsWrite(), write: async () => Promise.reject(new Error('getAlerts: 403 forbidden')) }
    const ack = new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, refused))
    await expect(ack.mutate({ keys: t.open.members.map((m) => m.key), acknowledged: true })).rejects.toThrow('403')
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)).toEqual(before)
    expect(t.queryClient.getQueryData(t.detail.queryKey)?.group.acknowledged).toBe(false)
    for (const off of t.off) off()
  })
})

describe('saving a preference', () => {
  it('shows at once and is rolled back when refused', async () => {
    const queryClient = createQueryClient()
    const prefs = await queryClient.query(preferencesQuery())
    const off = new QueryObserver(queryClient, preferencesQuery()).subscribe(() => {})
    const next = { ...prefs, density: prefs.density === 'compact' ? ('comfortable' as const) : ('compact' as const) }
    let refuse: (error: Error) => void = () => {}
    const save = new MutationObserver(queryClient, mutationOptions(queryClient, async () => {}, { ...writes.savePreferencesWrite(), write: () => new Promise<void>((_, reject) => (refuse = reject)) }))
    const done = save.mutate(next)
    await settle()
    expect(queryClient.getQueryData(preferencesQuery().queryKey)?.density).toBe(next.density)
    refuse(new Error('403 forbidden'))
    await expect(done).rejects.toThrow()
    expect(queryClient.getQueryData(preferencesQuery().queryKey)?.density).toBe(prefs.density)
    off()
  })
})

describe('every write', () => {
  it('names what it changes', () => {
    for (const [name, make] of Object.entries(writes)) {
      const options = (make as () => { invalidates: unknown })()
      expect(options.invalidates, name).toBeDefined()
    }
  })
})
