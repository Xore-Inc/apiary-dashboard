// Writes (#309): the changed resources are asked again once the write
// lands, an optimistic change shows at once and is rolled back exactly when
// the server refuses, and the write stays pending until the refresh is in.
import { describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryObserver } from '@tanstack/react-query'
import { createQueryClient, resource } from './query'
import { mutationOptions } from './mutation'

type Alert = { id: string; acknowledged: boolean }

function setup() {
  const queryClient = createQueryClient()
  let server: Alert[] = [{ id: 'a', acknowledged: false }, { id: 'b', acknowledged: false }]
  const reads = { alerts: 0, other: 0 }
  const alerts = resource('readAlerts', async () => {
    reads.alerts++
    return server.map((a) => ({ ...a }))
  }, 'live')
  const other = resource('readOther', async () => ++reads.other, 'normal')
  // Mounted pages observe their reads.
  const off = [new QueryObserver(queryClient, alerts()).subscribe(() => {}), new QueryObserver(queryClient, other()).subscribe(() => {})]
  const reloadRoutes = vi.fn(async () => {})
  return { queryClient, alerts, other, reads, reloadRoutes, off, setServer: (next: Alert[]) => (server = next), getServer: () => server }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('a write', () => {
  it('asks the resources it changed again, not the others, then re-runs the loaders', async () => {
    const t = setup()
    await settle()
    const ack = new MutationObserver(
      t.queryClient,
      mutationOptions(t.queryClient, t.reloadRoutes, {
        write: async (id: string) => {
          t.setServer(t.getServer().map((a) => (a.id === id ? { ...a, acknowledged: true } : a)))
        },
        invalidates: [t.alerts.key],
      }),
    )
    await ack.mutate('a')
    expect(t.reads).toEqual({ alerts: 2, other: 1 })
    expect(t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)?.find((a) => a.id === 'a')?.acknowledged).toBe(true)
    expect(t.reloadRoutes).toHaveBeenCalledTimes(1)
    for (const off of t.off) off()
  })

  it('stays pending until the changed reads have answered again', async () => {
    const t = setup()
    await settle()
    let release: () => void = () => {}
    const slow = resource('readSlowAfterWrite', () => new Promise<number>((resolve) => (release = () => resolve(1))), 'normal')
    const off = new QueryObserver(t.queryClient, slow()).subscribe(() => {})
    release()
    await settle()
    const write = new MutationObserver(t.queryClient, mutationOptions(t.queryClient, t.reloadRoutes, { write: async (_: void) => 'ok', invalidates: [slow.key] }))
    let done = false
    void write.mutate(undefined).then(() => (done = true))
    await settle()
    await settle()
    expect(done).toBe(false)
    release()
    await vi.waitFor(() => expect(done).toBe(true))
    off()
    for (const o of t.off) o()
  })
})

describe('an optimistic write', () => {
  const optimisticAck = (t: ReturnType<typeof setup>, write: (id: string) => Promise<void>) =>
    new MutationObserver(
      t.queryClient,
      mutationOptions(t.queryClient, t.reloadRoutes, {
        write,
        invalidates: [t.alerts.key],
        optimistic: (queryClient, id: string) => queryClient.setQueryData<Alert[]>(t.alerts().queryKey, (rows) => rows?.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))),
      }),
    )

  it('shows at once, before the server answers', async () => {
    const t = setup()
    await settle()
    let answer: () => void = () => {}
    const ack = optimisticAck(t, () => new Promise<void>((resolve) => (answer = resolve)))
    const pending = ack.mutate('b')
    await settle()
    expect(t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)?.find((a) => a.id === 'b')?.acknowledged).toBe(true)
    t.setServer(t.getServer().map((a) => (a.id === 'b' ? { ...a, acknowledged: true } : a)))
    answer()
    await pending
    expect(t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)?.find((a) => a.id === 'b')?.acknowledged).toBe(true)
    for (const off of t.off) off()
  })

  it('is rolled back exactly when the server refuses', async () => {
    const t = setup()
    await settle()
    const before = t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)
    const seen: boolean[] = []
    const unsubscribe = t.queryClient.getQueryCache().subscribe(() => {
      const row = t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)?.find((a) => a.id === 'a')
      if (row) seen.push(row.acknowledged)
    })
    const ack = optimisticAck(t, async () => {
      await settle()
      throw new Error('403 forbidden')
    })
    await expect(ack.mutate('a')).rejects.toThrow('403')
    unsubscribe()
    // It was shown, then restored, and the server's own answer read again.
    expect(seen).toContain(true)
    expect(t.queryClient.getQueryData<Alert[]>(t.alerts().queryKey)).toEqual(before)
    expect(t.reads.alerts).toBe(2)
    for (const off of t.off) off()
  })
})
