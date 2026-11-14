import { describe, expect, it } from 'vitest'
import { entityTabs } from './ViewTabs'

const tabs = () => [
  { id: 'overview', label: 'Overview' },
  { id: 'breakdown', label: 'Breakdown' },
]
const model = (pathname: string, aliases?: Record<string, string>) =>
  entityTabs({ label: 'Source IP views', basePath: (params) => `/sources/${params.ip}`, tabs, aliases })({ params: { ip: '203.0.113.42' }, pathname, search: {}, data: undefined })

describe('entityTabs aliases (#299)', () => {
  it('selects the tab a folded old path redirects to, as the client does after the redirect', () => {
    expect(model('/sources/203.0.113.42/alerts', { alerts: 'breakdown' }).value).toBe('breakdown')
  })

  it('without an alias an unknown path still falls back to the first tab', () => {
    expect(model('/sources/203.0.113.42/alerts').value).toBe('overview')
    expect(model('/sources/203.0.113.42/breakdown', { alerts: 'breakdown' }).value).toBe('breakdown')
  })
})
