import { describe, expect, it } from 'vitest'
import { returnAfterSignIn, safeReturnTo } from './returnTo'

describe('safeReturnTo', () => {
  it('keeps a path on the dashboard', () => {
    expect(safeReturnTo('/events?sensor=cowrie')).toBe('/events?sensor=cowrie')
  })

  it('refuses anything that could leave it', () => {
    for (const value of ['https://example.test/', '//example.test/', '/\\example.test', 'events', '/a\u0000b', undefined, 42]) expect(safeReturnTo(value)).toBe('/')
  })
})

describe('returnAfterSignIn', () => {
  it('keeps the path and its filters', () => {
    expect(returnAfterSignIn('/alerts?range=7d&sensor=cowrie')).toBe('/alerts?range=7d&sensor=cowrie')
    expect(returnAfterSignIn('/events#row-3')).toBe('/events#row-3')
  })

  it('stays on the dashboard', () => {
    expect(returnAfterSignIn('//evil.example.test/')).toBe('/')
  })
})
