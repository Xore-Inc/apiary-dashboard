import { describe, expect, it } from 'vitest'
import { FOLDED_TAB_ROUTES, foldedTabRedirect } from './foldedTabs'

describe('folded tab redirects (#299)', () => {
  it('sends each folded source tab to Breakdown with a 301, keeping the query', () => {
    for (const pattern of ['/sources/:ip/alerts', '/sources/:ip/commands', '/sources/:ip/credentials']) {
      const target = FOLDED_TAB_ROUTES[pattern]({ ip: '2001:db8::1' })
      const response = foldedTabRedirect(new Request('https://dash.test/sources/2001%3Adb8%3A%3A1/alerts?range=7d'), target)
      expect(response.status).toBe(301)
      expect(response.headers.get('location')).toBe('/sources/2001%3Adb8%3A%3A1/breakdown?range=7d')
    }
    // Whether Bun hands the parameter over decoded or not, it is encoded once.
    expect(FOLDED_TAB_ROUTES['/sources/:ip/alerts']({ ip: '2001%3Adb8%3A%3A1' })).toBe('/sources/2001%3Adb8%3A%3A1/breakdown')
  })
})
