// The dashboard's writes (#309), on a data cache holding literal answers:
// acknowledging shows at once in the alert list, the detail and the bell's
// count, holds once the write is confirmed, is rolled back exactly when
// refused, and every write invalidates what it changes. The write itself is
// a stand-in the test resolves or rejects; nothing reaches a backend.
import { describe, expect, it, vi } from 'vitest'
import { MutationObserver } from '@tanstack/react-query'
import { createQueryClient } from '#/lib/query'
import { mutationOptions } from '#/lib/mutation'
import { alertKeyOf } from './shared'
import { alertDetailQuery, alertsQuery, openAlertCountQuery, preferencesQuery } from './resources'
import type { AlertDetail } from './queries.contract'
import type { AlertGroup, AlertRecord, Preferences } from './types'
import * as writes from './writes'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const record = (key: string, acknowledged: boolean): AlertRecord => ({ key, kind: 'campaign', message: `Campaign ${key}`, severity: 'high', count: 1, firstSeen: '2026-11-15T10:00:00Z', lastSeen: '2026-11-15T11:00:00Z', acknowledged })
const group = (id: string, acknowledged: boolean, keys: string[]): AlertGroup => ({ id: `${id}|${acknowledged}`, kind: 'campaign', message: `Campaign ${id}`, severity: 'high', count: keys.length, firstSeen: '2026-11-15T10:00:00Z', lastSeen: '2026-11-15T11:00:00Z', acknowledged, members: keys.map((key) => record(key, acknowledged)) })

function mounted() {
  const queryClient = createQueryClient()
  const open = group('campaign|198.51.100.0/24', false, ['a-1', 'a-2'])
  const other = group('campaign|203.0.113.0/24', false, ['b-1'])
  const done = group('sensor|cowrie', true, ['c-1'])
  queryClient.setQueryData(alertsQuery().queryKey, [open, other, done])
  const detail = alertDetailQuery(alertKeyOf(open))
  const answer: AlertDetail = { group: open, sources: ['198.51.100.7'], hashes: [] }
  queryClient.setQueryData(detail.queryKey, answer)
  queryClient.setQueryData(openAlertCountQuery().queryKey, 3)
  return { queryClient, open, detail, reloadRoutes: vi.fn(async () => {}) }
}

describe('acknowledging an alert', () => {
  it('shows at once in the list, the detail and the bell, and holds once confirmed', async () => {
    const t = mounted()
    let release: () => void = () => {}
    const held = { ...writes.acknowledgeAlertsWrite(), write: () => new Promise<number>((resolve) => (release = () => resolve(t.open.members.length))) }
    const ack = new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, held))
    const done = ack.mutate({ keys: t.open.members.map((m) => m.key), acknowledged: true })
    await settle()
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)!.find((g) => g.members.some((m) => m.key === 'a-1'))?.acknowledged).toBe(true)
    expect(t.queryClient.getQueryData(t.detail.queryKey)?.group.acknowledged).toBe(true)
    expect(t.queryClient.getQueryData(openAlertCountQuery().queryKey)).toBe(3 - t.open.members.length)
    // The other open alert is untouched.
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)!.find((g) => g.members.some((m) => m.key === 'b-1'))?.acknowledged).toBe(false)
    release()
    await done
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)!.find((g) => g.members.some((m) => m.key === 'a-1'))?.acknowledged).toBe(true)
    expect(t.reloadRoutes).toHaveBeenCalledTimes(1)
    // What it changed is asked again.
    expect(t.queryClient.getQueryState(alertsQuery().queryKey)?.isInvalidated).toBe(true)
  })

  it('is rolled back when the backend refuses it (a viewer, 403)', async () => {
    const t = mounted()
    const before = t.queryClient.getQueryData(alertsQuery().queryKey)
    const refused = { ...writes.acknowledgeAlertsWrite(), write: async () => Promise.reject(new Error('setAlertsAcknowledged: 403 forbidden')) }
    const ack = new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, refused))
    await expect(ack.mutate({ keys: t.open.members.map((m) => m.key), acknowledged: true })).rejects.toThrow('403')
    expect(t.queryClient.getQueryData(alertsQuery().queryKey)).toEqual(before)
    expect(t.queryClient.getQueryData(t.detail.queryKey)?.group.acknowledged).toBe(false)
    expect(t.queryClient.getQueryData(openAlertCountQuery().queryKey)).toBe(3)
  })
})

describe('saving a preference', () => {
  it('shows at once and is rolled back when refused', async () => {
    const queryClient = createQueryClient()
    const prefs = { density: 'compact', theme: 'system', motion: 'system' } as Preferences
    queryClient.setQueryData(preferencesQuery().queryKey, prefs)
    const next = { ...prefs, density: prefs.density === 'compact' ? ('comfortable' as const) : ('compact' as const) }
    let refuse: (error: Error) => void = () => {}
    const save = new MutationObserver(queryClient, mutationOptions(queryClient, async () => {}, { ...writes.savePreferencesWrite(), write: () => new Promise<void>((_, reject) => (refuse = reject)) }))
    const done = save.mutate(next)
    await settle()
    expect(queryClient.getQueryData(preferencesQuery().queryKey)?.density).toBe(next.density)
    refuse(new Error('403 forbidden'))
    await expect(done).rejects.toThrow()
    expect(queryClient.getQueryData(preferencesQuery().queryKey)?.density).toBe(prefs.density)
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
