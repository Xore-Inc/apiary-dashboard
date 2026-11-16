// @vitest-environment jsdom
// Every pre-epic-#25 URL lands on its entity page (and tab), through the real
// route tree, so a route rename cannot silently strand an old link.
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '#/routeTree.gen'
import { createQueryClient } from '#/lib/query'
import { DEFAULT_PREFERENCES_WIRE, preferences } from '#/data/adapters/settings'
import { preferencesQuery, sessionUserQuery } from '#/data/resources'
import type { SessionUser } from '#/data/types'

// The navigation guard's two reads, answered from the cache: a signed-in
// operator with the default preferences. The redirects decide before any
// page reads data; whatever a landed page then asks for is not looked at.
const ip = '198.51.100.13'
const hash = '0'.repeat(64)
const cidr = '198.51.100.0/24'
const shasum = 'f'.repeat(64)

const operator: SessionUser = { name: 'Operator', email: 'operator@example.test', roles: ['admin'] }

async function land(path: string): Promise<string> {
  const queryClient = createQueryClient()
  queryClient.setQueryData(sessionUserQuery().queryKey, operator)
  queryClient.setQueryData(preferencesQuery().queryKey, preferences(DEFAULT_PREFERENCES_WIRE))
  const router = createRouter({ routeTree, context: { queryClient }, history: createMemoryHistory({ initialEntries: [path] }) })
  await router.load()
  return decodeURIComponent(router.state.location.pathname)
}

describe('old URLs redirect to entity pages', () => {
  it('source, event, session and payload detail routes', async () => {
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
