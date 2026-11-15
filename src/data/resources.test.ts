// The resource reads (#309): each data class has its freshness, every page
// reads through them, and no loader keys its cache on search params it does
// not use.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRESHNESS, createQueryClient, refreshPageData } from '#/lib/query'
import * as resources from './resources'

const classOf = (make: (...args: never[]) => { meta: { freshness: string } }) => make().meta.freshness

describe('freshness by data class', () => {
  it('live views are asked again on every visit', () => {
    for (const read of [resources.alertsQuery, resources.eventsQuery, resources.sourceHealthQuery]) expect(classOf(read)).toBe('live')
  })
  it('lists and aggregates are reused for 30 s', () => {
    for (const read of [resources.sourceProfilesQuery, resources.networkCampaignsQuery, resources.attackersQuery, resources.overviewQuery, resources.payloadsQuery, resources.openAlertCountQuery]) expect(classOf(read)).toBe('normal')
    expect(FRESHNESS.normal.staleTime).toBe(30_000)
  })
  it('detail pages, catalogs, configuration and reports are reused for minutes', () => {
    for (const read of [resources.ipProfileQuery, resources.asnQuery, resources.campaignQuery, resources.clusterQuery, resources.payloadAnalysisQuery, resources.ghidraAnalysisQuery, resources.sensorCatalogQuery, resources.settingsQuery, resources.reportsQuery, resources.shellConfigQuery, resources.relatedQuery]) expect(classOf(read)).toBe('slow')
  })
  it('keys are the server function and its arguments, so pages share an entity', () => {
    expect(resources.ipProfileQuery('192.0.2.1').queryKey).toEqual(['getIpProfile', '192.0.2.1'])
    expect(resources.relatedQuery('asn', 'AS4134').queryKey).toEqual(['getRelated', 'asn', 'AS4134'])
  })
})

describe('refreshPageData', () => {
  it("asks the page's reads again, never the shell's, and joins a read still running", async () => {
    const client = createQueryClient()
    let page = 0
    let calls = 0
    let shell = 0
    let release: () => void = () => {}
    const pageRead = { queryKey: resources.alertsQuery().queryKey as readonly unknown[], meta: { freshness: 'live' }, staleTime: 0, queryFn: () => {
        calls++
        return new Promise<number>((resolve) => (release = () => resolve(++page)))
      } }
    const shellRead = { queryKey: resources.preferencesQuery().queryKey as readonly unknown[], meta: { freshness: 'normal' }, staleTime: 0, queryFn: async () => ++shell }
    // Observed, as a mounted page observes its reads.
    const { QueryObserver } = await import('@tanstack/react-query')
    const unsubscribe = [new QueryObserver(client, pageRead).subscribe(() => {}), new QueryObserver(client, shellRead).subscribe(() => {})]
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect([page, shell]).toEqual([1, 1])
    const running = refreshPageData(client)
    // A second refresh while the first read runs joins it.
    void refreshPageData(client)
    release()
    await running
    expect(page).toBe(2)
    expect(calls).toBe(2)
    expect(shell).toBe(1)
    for (const off of unsubscribe) off()
  })
})

const dir = join(import.meta.dirname, '../routes/_layout')
const routes = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
const source = (file: string) => readFileSync(join(dir, file), 'utf8')
const reads = [...readFileSync(join(import.meta.dirname, 'queries.ts'), 'utf8').matchAll(/const (\w+)Fn = createServerFn\(\{ method: 'GET' \}\)/g)].map((m) => m[1])

describe('page routes', () => {
  it('read the cache, not the loader data the router keeps', () => {
    expect(routes.filter((f) => /\b(Route|parent)\.useLoaderData\(\)/.test(source(f).replace(/ReturnType<typeof Route\.useLoaderData>/g, '')))).toEqual([])
  })
  it('call no read server function directly (a loader goes through ensure)', () => {
    const direct = routes.flatMap((f) => {
      const m = source(f).match(/import \{([^}]*)\} from '#\/data\/queries'/)
      const names = m ? m[1].split(',').map((n) => n.trim()) : []
      // A one-off read a page makes on demand (a search, a VNC bridge) is not a page read.
      return names.filter((n) => reads.includes(n) && !['semanticSearch', 'getSandboxVncBridge'].includes(n)).map((n) => `${f}: ${n}`)
    })
    expect(direct).toEqual([])
  })
  it('key their loaders on the search params they read, never the whole search', () => {
    expect(routes.filter((f) => /loaderDeps: \(\{ search \}\) => \(\{ \.\.\.search/.test(source(f)) || /loaderDeps: \(\{ search \}\) => search\b/.test(source(f)))).toEqual([])
  })
})
