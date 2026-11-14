import { describe, expect, it } from 'vitest'
import type { GhidraFunction, RelatedGroup } from '#/data/types'
import type { ChartTheme } from './chartTheme'
import { MAX_SPOKES, attackerGraph, attackerStyle, callGraph, callGraphLit, callGraphStyle, relatedGraph, relatedStyle } from './graphModels'

const T: ChartTheme = { c: (css) => `<${css}>`, fontFamily: 'Figtree', animate: false }
const ips = (n: number) => Array.from({ length: n }, (_, i) => `198.51.100.${i + 1}`)
const fn = (name: string, callers: string[], callees: string[]): GhidraFunction => ({ name, callers, callees, address: '0x0', decompiled: '' }) as unknown as GhidraFunction
const nodes = (els: Array<{ data: Record<string, unknown> }>) => els.filter((e) => !('source' in e.data))
const edges = (els: Array<{ data: Record<string, unknown> }>) => els.filter((e) => 'source' in e.data)

describe('attacker graph', () => {
  it('draws a hub and every member of a small identity, each linking to its source page', () => {
    const g = attackerGraph('0123456789abcdef', ips(5), '#members')
    expect(nodes(g.elements)).toHaveLength(6)
    expect(edges(g.elements).every((e) => e.data.source === 'hub')).toBe(true)
    expect(g.links[0]).toEqual({ id: 'ip:198.51.100.1', label: 'Source 198.51.100.1', href: '/sources/198.51.100.1' })
    expect(g.layout.name).toBe('concentric')
  })

  it('caps the spokes and folds the rest into one node that opens the member list', () => {
    const g = attackerGraph('0123456789abcdef', ips(30), '#members')
    expect(nodes(g.elements).filter((n) => n.data.kind === 'spoke')).toHaveLength(MAX_SPOKES)
    expect(g.links.at(-1)).toEqual({ id: 'overflow', label: '+6 more members', href: '#members' })
  })

  it('styles from the theme tokens', () => {
    const json = JSON.stringify(attackerStyle(T))
    expect(json).toContain('<var(--color-data-categorical-blue)>')
    expect(json).toContain('Figtree')
    expect(json).not.toMatch(/#[0-9a-f]{6}/i)
  })
})

describe('call graph', () => {
  const functions = [fn('entry', [], ['parse', 'send']), fn('parse', ['entry'], ['memcpy']), fn('send', ['entry'], []), fn('orphan', [], [])]

  it('lays callers above callees from the entry points, skipping callees it does not know', () => {
    const g = callGraph(functions)
    expect(g.layout).toMatchObject({ name: 'breadthfirst', directed: true, roots: ['fn:entry', 'fn:orphan'] })
    expect(edges(g.elements).map((e) => e.data.id)).toEqual(['call:entry->parse', 'call:entry->send'])
  })

  it('is a button per function for the keyboard, the selected one pressed', () => {
    expect(callGraph(functions, 'parse').links.find((l) => l.pressed)?.label).toBe('Function parse')
  })

  it('keeps the selected function and its neighbours lit, then narrows by the filter', () => {
    expect([...callGraphLit(functions, 'parse', '')].sort()).toEqual(['entry', 'parse'])
    expect([...callGraphLit(functions, undefined, 'se')].sort()).toEqual(['parse', 'send'])
    expect(callGraphLit(functions, undefined, '').size).toBe(4)
  })

  it('arrows its edges and marks the selection from the palette', () => {
    const json = JSON.stringify(callGraphStyle(T))
    expect(json).toContain('"target-arrow-shape":"triangle"')
    expect(json).toContain('node.selected')
  })
})

describe('related graph', () => {
  const groups: RelatedGroup[] = [
    { kind: 'source', label: 'Sources', items: Array.from({ length: 8 }, (_, i) => ({ id: `203.0.113.${i}` })) },
    { kind: 'not-a-kind', label: 'Other', items: [{ id: 'x', note: 'n' }] },
  ]

  it('puts the entity in the middle, six per kind, kinds kept together, each opening its page', () => {
    const g = relatedGraph('198.51.100.7', groups)
    const ns = nodes(g.elements).filter((n) => n.data.kind !== 'center')
    expect(ns).toHaveLength(7)
    expect(ns.map((n) => n.data.group)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(g.links[0].href).toBe('/sources/203.0.113.0')
    // An unknown kind has no page: no link target, still a node.
    expect(g.links[6]).toMatchObject({ label: 'Other: x (n)', href: undefined })
  })

  it('colours each kind from the palette', () => {
    const json = JSON.stringify(relatedStyle(T, 2))
    expect(json).toContain('node[group = 1]')
    expect(json).toContain('<var(--color-data-categorical-orange)>')
  })
})
