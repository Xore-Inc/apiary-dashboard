// The dashboard's side of the backend contract (#244). backend-service is
// released on its own schedule, so three things are checked here rather than
// in a deploy:
//
//   1. the pinned backend artifact (contracts/backend, refreshed with
//      `bun run contract:sync`) publishes a contract version this build
//      supports, and every backend call the dashboard makes is a route,
//      method and (for the store) name that artifact declares;
//   2. the hand-written wire types in contracts/*.ts accept representative
//      responses. The artifact leaves response bodies open (its own
//      description says so), so schema validation cannot prove them; the
//      captured fixtures in __fixtures__ do, by being assigned to the wire
//      types below under `tsc --noEmit`, and by driving the adapters in
//      api.entities.test.ts;
//   3. downloads and the live stream are declared with the content types
//      the dashboard's handlers rely on, and every UI path the backend emits
//      resolves to a dashboard route.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_API_VERSIONS } from '#/server/backendContract'
import type { EventsPage } from './contracts/events'
import type { IpProfileWire, SourcesPageWire } from './contracts/sources'
import entityReads from './__fixtures__/entity-reads.json'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

interface Operation {
  parameters?: { name: string; in: string; schema?: { enum?: string[] } }[]
  responses: Record<string, { content?: Record<string, unknown> }>
}
const pinned = JSON.parse(read('contracts/backend/openapi.json')) as {
  info: { 'x-api-version'?: number }
  paths: Record<string, Record<string, Operation | undefined>>
}
const source = JSON.parse(read('contracts/backend/SOURCE.json')) as { sha: string; apiVersion: number }

/** Stands for an interpolated path segment: matches an enum-valued parameter,
 * where a literal segment has to be one of its members. */
const VALUE = '\u0000'

/** The operation a concrete request path resolves to, as the backend's router
 * would: a `{param}` segment matches any single segment, but an enum-valued
 * one (the store's allowlist) only its members. */
function resolve(method: string, path: string): Operation | undefined {
  const segments = path.split('/')
  for (const [template, item] of Object.entries(pinned.paths)) {
    const op = item[method.toLowerCase()]
    const parts = template.split('/')
    if (!op || parts.length !== segments.length) continue
    const fits = parts.every((part, i) => {
      const name = /^\{(.+)\}$/.exec(part)?.[1]
      if (name === undefined) return part === segments[i]
      const allowed = op.parameters?.find((p) => p.in === 'path' && p.name === name)?.schema?.enum
      return !allowed || segments[i] === VALUE || allowed.includes(segments[i])
    })
    if (fits) return op
  }
  return undefined
}

/** Every `/api/v1` request the dashboard source makes: the helper called
 * (get/raw/stream are GET, post is POST, request names its method) and the
 * path literal, with `${...}` segments standing for a value. */
function dashboardCalls(): { method: string; path: string }[] {
  const calls = new Map<string, { method: string; path: string }>()
  for (const file of ['src/data/api.ts', 'src/routes/api.live.ts', 'src/routes/api.topology.flow.ts']) {
    const text = read(file)
    for (const m of text.matchAll(/\b(get|post|request|raw|stream)\s*(?:<[^()]*?>)?\s*\(\s*(?:'[A-Za-z]+'\s*,\s*)?([`'])(\/api\/v1[^`']*)\2([^\n]*)/g)) {
      const named = /method:\s*'([A-Z]+)'/.exec(m[4])?.[1]
      const method = m[1] === 'post' ? 'POST' : m[1] === 'request' && named ? named : 'GET'
      const path = m[3].split('?')[0].replace(/\$\{[^}]*\}/g, VALUE)
      calls.set(`${method} ${path}`, { method, path })
    }
  }
  return [...calls.values()]
}

describe('the pinned backend artifact', () => {
  it('records the commit it came from and a contract version this build supports', () => {
    expect(source.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(pinned.info['x-api-version']).toBe(source.apiVersion)
    expect(SUPPORTED_API_VERSIONS).toContain(source.apiVersion)
  })

  it('declares every route, method and store name the dashboard calls', () => {
    const calls = dashboardCalls()
    expect(calls.length).toBeGreaterThan(100) // the extraction found the calls, not nothing
    expect(calls.filter((c) => !resolve(c.method, c.path)).map((c) => `${c.method} ${c.path}`)).toEqual([])
  })
})

describe('wire types against representative responses', () => {
  // Compile-time proof: these assignments fail `tsc --noEmit` if a captured
  // response stops matching the hand-written type.
  it('accept the captured events, sources and profile responses', () => {
    const pages: EventsPage[] = [entityReads.eventsIp, entityReads.eventsSession]
    const sources: SourcesPageWire = entityReads.sources
    const profile: IpProfileWire = entityReads.ipProfile
    for (const page of pages) {
      expect(page.rows.length).toBeGreaterThan(0)
      for (const row of page.rows) expect(Object.keys(row)).toEqual(expect.arrayContaining(['id', 'time', 'sensor', 'src_ip', 'pivots']))
    }
    expect(sources.rows.length).toBeGreaterThan(0)
    expect(profile.ip).toBeTruthy()
  })
})

describe('downloads and the live stream', () => {
  it('are declared with the media types the handlers rely on', () => {
    const contentTypes = (path: string) => Object.keys(resolve('GET', path)?.responses['200']?.content ?? {})
    expect(contentTypes('/api/v1/live')).toEqual(['text/event-stream'])
    expect(contentTypes('/api/v1/artifacts/ghidra/key/file.bin')).toEqual(['application/octet-stream'])
    // The canarytoken download is a redirect to the token's file, not a body.
    expect(Object.keys(resolve('GET', '/api/v1/canarytokens/x/download')!.responses)).toContain('302')
  })

  it('are served by the dashboard with the same media types', () => {
    expect(read('src/routes/api.live.ts')).toContain("'content-type': 'text/event-stream'")
  })
})

// ---- UI paths the backend emits --------------------------------------------
//
// The backend builds dashboard paths itself (search hits, aggregation links,
// timeline hrefs, workbench result links, observation links). Rather than move
// every one to the client, this table names each shape with where APIARY
// emits it; the test resolves a sample of each against the route tree, so a
// dashboard route rename or removal fails here instead of leaving a dead link.
// A NEW backend-emitted path is not caught automatically: add it here in the
// change that adds it.
const EMITTED = [
  // backend-service/src/search.rs
  '/sessions/abc', '/investigate/ip/203.0.113.4', '/events?cmd=ls', '/events?kind=login', '/events?fingerprint=f', '/events?persona=p', '/events', '/sensors', '/history?q=x',
  // backend-service/src/dashboard.rs
  '/events?asn=1', '/events?shasum=ab', '/events?proto=tcp', '/events?port=22', '/events?country=NL', '/events?city=Rome', '/events?provider=p', '/events?ip=1.2.3.4', '/events?path=%2Fx', '/commands',
  // backend-service/src/detail.rs, events.rs, worker.rs
  '/events?sensor=cowrie&k=v', '/tty-replay/abc', '/events?cidr=203.0.113.0/24',
  // backend-service/src/entity_details.rs (timeline hrefs)
  '/events/abc', '/payloads/abc',
  // backend-service/src/workbench_domain.rs, workbench_orchestrator.rs, worker.rs
  '/ghidra/abc', '/sandbox/job1', '/cape/abc',
]

function routePatterns(): string[] {
  const tree = read('src/routeTree.gen.ts')
  const block = tree.slice(tree.indexOf('export interface FileRoutesByFullPath'))
  return [...block.slice(0, block.indexOf('\n}')).matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1].replace(/(.)\/$/, '$1'))
}

describe('backend-emitted UI paths', () => {
  it('each resolve to a dashboard route', () => {
    const patterns = routePatterns().map((p) => p.split('/'))
    const matches = (path: string) => {
      const segments = path.split(/[?#]/)[0].replace(/(.)\/$/, '$1').split('/')
      return patterns.some((p) => p.length === segments.length && p.every((part, i) => part.startsWith('$') || part === segments[i]))
    }
    expect(EMITTED.filter((p) => !matches(p))).toEqual([])
  })
})
