// conditionsFrom must survive the readings production actually delivered on
// 2026-10-31: a source-health serverFn that failed upstream resolved to
// nothing, and the shell crashed with "reading 'feeds'" (dash#237).
import { describe, expect, it } from 'vitest'
import { conditionsFrom } from './healthConditions'
import type { SourceHealth } from '#/data/types'

describe('conditionsFrom', () => {
  it('reports nothing for a missing reading instead of throwing', () => {
    expect(conditionsFrom(undefined)).toEqual([])
    expect(conditionsFrom(null)).toEqual([])
  })

  it('reports nothing for a partial reading', () => {
    expect(conditionsFrom({} as SourceHealth)).toEqual([])
    expect(conditionsFrom({ feeds: [] } as unknown as SourceHealth)).toEqual([])
  })

  it('still reports a silent sensor from a whole reading', () => {
    const health = {
      feeds: [{ sensor: 'cowrie', state: 'silent', documents: 0, lastSeen: null }],
      ingest: { state: 'fresh' },
      pipeline: { state: 'running' },
      clusterStatus: 'green',
      deadLetters: 0,
    } as unknown as SourceHealth
    expect(conditionsFrom(health).map((c) => c.key)).toEqual(['sensor:cowrie'])
  })
})
