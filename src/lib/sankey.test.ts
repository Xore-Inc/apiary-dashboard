import { describe, expect, it } from 'vitest'
import { sankeyNodePadding, widestColumn } from './sankey'

const fan = (sinks: number) => ({
  nodes: [{ name: 'traefik' }, ...Array.from({ length: sinks }, (_, i) => ({ name: `sensor-${i}` }))],
  links: Array.from({ length: sinks }, (_, i) => ({ source: 0, target: i + 1, value: 1 })),
})

describe('sankey node padding', () => {
  it('counts the widest column, sinks in the last one', () => {
    expect(widestColumn(fan(30))).toBe(30)
    expect(widestColumn({ nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 0, target: 1, value: 1 }, { source: 1, target: 2, value: 1 }] })).toBe(1)
  })

  it('keeps the preferred padding when the column fits', () => {
    expect(sankeyNodePadding(fan(5), 448)).toBe(28)
  })

  it('shrinks the padding so 30 nodes fit in 448 px with room for their bars', () => {
    const padding = sankeyNodePadding(fan(30), 448)
    expect(padding).toBe(7)
    expect(448 - 29 * padding).toBeGreaterThan(0)
  })

  it('survives a cycle and a self-link', () => {
    const flow = { nodes: [{ name: 'a' }, { name: 'b' }], links: [{ source: 0, target: 1, value: 1 }, { source: 1, target: 0, value: 1 }, { source: 0, target: 0, value: 1 }] }
    expect(widestColumn(flow)).toBeGreaterThan(0)
  })
})
