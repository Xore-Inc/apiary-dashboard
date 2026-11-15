// @vitest-environment jsdom
// Every pre-epic-#25 URL lands on its entity page (and tab), through the real
// route tree, so a route rename cannot silently strand an old link.
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '#/routeTree.gen'
import { createQueryClient } from '#/lib/query'
import { backend } from '#/data/backend'

// The mock backend itself: tests and scripts call it directly; the routes'
// own queries go to it in-process too.
const q = backend()
vi.mock('#/data/queries', () => import('#/test/queriesOnBackend').then((m) => m.queriesOnBackend()))

async function land(path: string): Promise<string> {
  const router = createRouter({ routeTree, context: { queryClient: createQueryClient() }, history: createMemoryHistory({ initialEntries: [path] }) })
  await router.load()
  return decodeURIComponent(router.state.location.pathname)
}

describe('old URLs redirect to entity pages', () => {
  it('source, event, session and payload detail routes', async () => {
    const { sources } = await q.getSourceProfiles()
    const ip = sources[0].ip
    const hash = (await q.getPayloads()).payloads[0].hash
    expect(await land(`/investigate/ip/${ip}`)).toBe(`/sources/${ip}`)
    expect(await land(`/investigate/ip/${ip}?tab=indicators`)).toBe(`/sources/${ip}/payloads`)
    expect(await land(`/investigate/ip/${ip}?tab=correlation`)).toBe(`/sources/${ip}/network`)
    expect(await land('/event/evt-1')).toBe('/events/evt-1')
    expect(await land(`/payload-analysis/${hash}`)).toBe(`/payloads/${hash}`)
    expect(await land(`/sandbox/${hash}`)).toBe(`/payloads/${hash}/sandbox`)
    expect(await land(`/ghidra/${hash}`)).toBe(`/payloads/${hash}/ghidra`)
    expect(await land(`/cape/${hash}`)).toBe(`/payloads/${hash}/cape`)
    expect(await land(`/revdeck/${hash}`)).toBe(`/payloads/${hash}/revdeck`)
    expect(await land(`/github-analysis/${hash}`)).toBe(`/payloads/${hash}/github`)
  })

  it('correlation, recording and lookup routes', async () => {
    const { campaigns } = await q.getNetworkCampaigns()
    const cidr = campaigns[0].cidr
    const shasum = (await q.getRecordings())[0].shasum
    expect(await land(`/investigate/cidr/${encodeURIComponent(cidr)}`)).toBe(`/networks/${cidr}`)
    expect(await land('/investigate/cluster?kind=credential&value=root%3Atoor')).toBe('/clusters/credential/root:toor')
    expect(await land('/investigate/cluster?kind=asn&value=AS9009')).toBe('/asn/AS9009')
    expect(await land(`/tty-replay/${shasum}`)).toBe(`/recordings/${shasum}`)
    expect(await land(`/tty-replay/${shasum}?tab=attacker`)).toBe(`/recordings/${shasum}/attacker`)
    expect(await land('/investigate/lookup')).toBe('/iocs')
    expect(await land('/reports')).toBe('/reports/generate')
    expect(await land('/reports?step=library')).toBe('/reports/library')
    expect(await land('/settings?pane=services')).toBe('/')
  })
})
