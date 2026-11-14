// What each node graph draws (dash#305): the elements, the cytoscape style
// from the resolved theme, the layout, and where each node leads. Pure, so
// the graphs are tested without a canvas; components/CytoscapeGraph.tsx
// paints them.
import type { ElementDefinition, LayoutOptions, StylesheetJson } from 'cytoscape'
import type { GhidraFunction, RelatedGroup } from '#/data/types'
import { ENTITIES, entityHref } from '#/lib/entities'
import type { EntityKind } from '#/lib/entities'
import { PALETTE, TOKENS } from './chartTheme'
import type { ChartTheme } from './chartTheme'

/** A node a keyboard reaches too: the graph's links, beside the canvas. */
export type GraphLink = { id: string; label: string; href?: string; pressed?: boolean }

export type GraphModel = {
  elements: ElementDefinition[]
  layout: LayoutOptions
  /** The nodes as links or buttons, in reading order. */
  links: GraphLink[]
}

/** Lines that must read on the card in both modes, as the SVG graphs drew them. */
const EMPHASIZED = 'var(--color-border-emphasized, var(--color-border))'

const short = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

/** Shared node and edge looks: labels in the theme's text colours and font,
 * hover and dimming by class. */
function baseStyle(t: ChartTheme): StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        color: t.c(TOKENS.textSecondary),
        'font-family': t.fontFamily,
        'font-size': 10,
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-background-color': t.c(TOKENS.card),
        'text-background-opacity': 0.75,
        'text-background-padding': '1px',
        'border-color': t.c(TOKENS.card),
        'border-width': 2,
        ...(t.animate ? { 'transition-property': 'opacity, border-color', 'transition-duration': 150 } : {}),
      },
    },
    { selector: 'node[href]', style: { 'overlay-padding': 4 } },
    { selector: 'node.hover', style: { 'border-color': t.c(TOKENS.text), color: t.c(TOKENS.text), 'font-weight': 600, 'z-index': 10 } },
    { selector: 'edge', style: { width: 1, 'line-color': t.c(EMPHASIZED), 'curve-style': 'straight' } },
    { selector: 'edge.hover', style: { width: 2, 'line-color': t.c(TOKENS.textSecondary) } },
    { selector: '.dim', style: { opacity: 0.2 } },
  ]
}

// ---- Attacker identity ------------------------------------------------------

export const MAX_SPOKES = 24

/** One identity as a hub and its member addresses as spokes; past the cap
 * the rest fold into one "+N more" node that opens the member list. */
export function attackerGraph(id: string, ips: string[], membersHref: string): GraphModel {
  const shown = ips.slice(0, MAX_SPOKES)
  const overflow = ips.length - shown.length
  const links: GraphLink[] = [
    ...shown.map((ip) => ({ id: `ip:${ip}`, label: `Source ${ip}`, href: `/sources/${encodeURIComponent(ip)}` })),
    ...(overflow > 0 ? [{ id: 'overflow', label: `+${overflow} more members`, href: membersHref }] : []),
  ]
  const elements: ElementDefinition[] = [
    { data: { id: 'hub', label: id.slice(0, 8), kind: 'hub' } },
    ...shown.map((ip) => ({ data: { id: `ip:${ip}`, label: ip, kind: 'spoke', href: `/sources/${encodeURIComponent(ip)}` } })),
    ...(overflow > 0 ? [{ data: { id: 'overflow', label: `+${overflow} more`, kind: 'overflow', href: membersHref } }] : []),
    ...links.map((l) => ({ data: { id: `e:${l.id}`, source: 'hub', target: l.id } })),
  ]
  return {
    elements,
    links,
    // The hub in the middle, the members on rings around it.
    layout: { name: 'concentric', concentric: (node) => (node.data('kind') === 'hub' ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 40, animate: false, padding: 24 },
  }
}

export function attackerStyle(t: ChartTheme): StylesheetJson {
  return [
    ...baseStyle(t),
    { selector: 'node[kind = "spoke"]', style: { 'background-color': t.c(PALETTE[0]), width: 18, height: 18, 'font-family': 'monospace' } },
    { selector: 'node[kind = "overflow"]', style: { 'background-color': t.c(TOKENS.muted), 'border-color': t.c(TOKENS.border), width: 30, height: 30 } },
    {
      selector: 'node[kind = "hub"]',
      style: { 'background-color': t.c(TOKENS.text), color: t.c(TOKENS.card), 'text-valign': 'center', 'text-margin-y': 0, 'text-background-opacity': 0, 'font-size': 11, 'font-weight': 600, 'font-family': 'monospace', width: 60, height: 60 },
    },
  ]
}

// ---- Ghidra call graph ------------------------------------------------------

/** The decompiled functions, callers above their callees (a breadth-first
 * layered layout from the entry points), each a button that selects it. */
export function callGraph(functions: GhidraFunction[], selected?: string): GraphModel {
  const names = new Set(functions.map((f) => f.name))
  const roots = functions.filter((f) => f.callers.every((c) => !names.has(c))).map((f) => `fn:${f.name}`)
  return {
    elements: [
      ...functions.map((f) => ({ data: { id: `fn:${f.name}`, name: f.name, label: short(f.name, 18) } })),
      ...functions.flatMap((f) => f.callees.filter((c) => names.has(c)).map((c) => ({ data: { id: `call:${f.name}->${c}`, source: `fn:${f.name}`, target: `fn:${c}` } }))),
    ],
    links: functions.map((f) => ({ id: `fn:${f.name}`, label: `Function ${f.name}`, pressed: f.name === selected })),
    layout: { name: 'breadthfirst', directed: true, roots: roots.length ? roots : undefined, spacingFactor: 1, padding: 16, animate: false },
  }
}

/** Which functions stay lit: the selected one and its direct neighbours, and
 * of those, the ones whose name matches the filter. */
export function callGraphLit(functions: GhidraFunction[], selected: string | undefined, filter: string): Set<string> {
  const focus = selected ? functions.find((f) => f.name === selected) : undefined
  const near = focus ? new Set([focus.name, ...focus.callers, ...focus.callees]) : undefined
  const needle = filter.trim().toLowerCase()
  return new Set(functions.filter((f) => (!near || near.has(f.name)) && (!needle || f.name.toLowerCase().includes(needle))).map((f) => f.name))
}

export function callGraphStyle(t: ChartTheme): StylesheetJson {
  return [
    ...baseStyle(t),
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: 132,
        height: 26,
        'background-color': t.c(TOKENS.muted),
        'border-color': t.c(TOKENS.border),
        'border-width': 1,
        color: t.c(TOKENS.text),
        'text-valign': 'center',
        'text-margin-y': 0,
        'text-background-opacity': 0,
        'font-size': 11,
        'font-family': 'monospace',
      },
    },
    { selector: 'node.selected', style: { 'background-color': t.c(PALETTE[0]), 'border-color': t.c(PALETTE[0]), color: t.c(TOKENS.card) } },
    { selector: 'node.hover', style: { 'border-color': t.c(TOKENS.text), 'border-width': 2 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': t.c(EMPHASIZED), 'arrow-scale': 0.8, 'line-color': t.c(EMPHASIZED) } },
    { selector: 'edge.near', style: { width: 2, 'line-color': t.c(TOKENS.textSecondary), 'target-arrow-color': t.c(TOKENS.textSecondary) } },
  ]
}

// ---- Related entities -------------------------------------------------------

const isKind = (kind: string): kind is EntityKind => kind in ENTITIES

/** Groups past the fifth colour fall back to neutral. */
export const groupColor = (index: number) => PALETTE[index] ?? TOKENS.textSecondary

/** The entity in the middle, everything related around it, one colour per
 * kind and each kind kept together; every node opens its page. Six per kind,
 * like the list. */
export function relatedGraph(center: string, groups: RelatedGroup[]): GraphModel {
  const shown = groups.map((group) => ({ ...group, items: group.items.slice(0, 6) }))
  const nodes = shown.flatMap((group, g) =>
    group.items.map((item) => {
      const href = isKind(group.kind) ? (entityHref(group.kind, item.id) ?? ENTITIES[group.kind].events?.(item.id)) : undefined
      return { id: `n:${group.kind}:${item.id}`, label: item.label ?? item.id, title: `${group.label}: ${item.id}${item.note ? ` (${item.note})` : ''}`, g, href }
    }),
  )
  return {
    elements: [
      { data: { id: 'center', label: short(center, 30), kind: 'center' } },
      ...nodes.map((n) => ({ data: { id: n.id, label: short(n.label, 18), group: n.g, ...(n.href ? { href: n.href } : {}) } })),
      ...nodes.map((n) => ({ data: { id: `e:${n.id}`, source: 'center', target: n.id, group: n.g } })),
    ],
    links: nodes.map((n) => ({ id: n.id, label: n.title, href: n.href })),
    // Kinds stay together around the ring: concentric places nodes in
    // element order, and the elements are grouped.
    layout: { name: 'concentric', concentric: (node) => (node.data('kind') === 'center' ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 30, animate: false, padding: 24 },
  }
}

export function relatedStyle(t: ChartTheme, groupCount: number): StylesheetJson {
  return [
    ...baseStyle(t),
    { selector: 'node', style: { width: 14, height: 14, 'font-size': 11, color: t.c(TOKENS.text) } },
    ...Array.from({ length: groupCount }, (_, g) => [
      { selector: `node[group = ${g}]`, style: { 'background-color': t.c(groupColor(g)) } },
      { selector: `edge[group = ${g}]`, style: { 'line-color': t.c(groupColor(g)), 'line-opacity': 0.45, width: 1.5 } },
    ]).flat(),
    { selector: 'node[kind = "center"]', style: { 'background-color': t.c(TOKENS.text), width: 22, height: 22, 'font-size': 13, 'font-weight': 600, 'text-valign': 'top', 'text-margin-y': -6 } },
  ]
}
