import { describe, expect, it } from 'vitest'
import { conformanceSeries } from './conformance'

describe('conformanceSeries', () => {
  it('draws one line per protocol the points carry, busiest first', () => {
    const points = [
      { time: '2026-11-13T00:00:00Z', '(none)': 24, http: 3 },
      { time: '2026-11-13T01:00:00Z', '(none)': 30, smb: 40 },
    ]
    expect(conformanceSeries(points)).toEqual([
      { key: '(none)', label: 'No app protocol' },
      { key: 'smb', label: 'SMB' },
      { key: 'http', label: 'HTTP' },
    ])
  })

  it('has no lines for no points', () => {
    expect(conformanceSeries([])).toEqual([])
  })
})
