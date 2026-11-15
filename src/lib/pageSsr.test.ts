// Every page loads skeleton first: each route under the shell renders on the
// server through pageSsr (its own skeleton for a browser), unless it only
// redirects, which stays a real server redirect. A new page that forgets it
// would block a browser's first paint on its data again.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { navigatesAsBrowser } from './pageSsr'

describe('navigatesAsBrowser', () => {
  const from = (headers: Record<string, string>) => navigatesAsBrowser((name) => headers[name])
  it('knows a browser over HTTPS or localhost, and over plain HTTP', () => {
    expect(from({ 'sec-fetch-dest': 'document', 'upgrade-insecure-requests': '1' })).toBe(true)
    expect(from({ 'upgrade-insecure-requests': '1' })).toBe(true)
  })
  it('renders the whole page for fetch() and non-browser clients', () => {
    expect(from({ 'sec-fetch-dest': 'empty' })).toBe(false)
    expect(from({})).toBe(false)
  })
})

const dir = join(import.meta.dirname, '../routes/_layout')
const routes = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))

describe('page routes', () => {
  it('render skeleton first, or only redirect', () => {
    const missing = routes.filter((file) => {
      const source = readFileSync(join(dir, file), 'utf8')
      const renders = /\b(component|pendingComponent|loader):/.test(source)
      return renders && !source.includes('ssr: pageSsr')
    })
    expect(missing).toEqual([])
  })

  // usePageQuery/usePageQueries (lib/query.ts), the combined page reads of
  // data/pageData.ts and the slow panels (components/Deferred.tsx) are
  // orPending over the data cache.
  it('read their data through orPending, so "Loading forever" holds them on their skeleton', () => {
    const direct = routes.filter((file) => {
      const source = readFileSync(join(dir, file), 'utf8')
      return source.includes('ssr: pageSsr') && !/\b(orPending|usePageQuery|usePageQueries|use[A-Z]\w*Page)\(|<Deferred\b/.test(source)
    })
    expect(direct).toEqual([])
  })

  it('have their own skeleton to show while loading, not the generic one', () => {
    const without = routes.filter((file) => {
      const source = readFileSync(join(dir, file), 'utf8')
      return source.includes('ssr: pageSsr') && !/\bpendingComponent:/.test(source)
    })
    expect(without).toEqual([])
  })
})
