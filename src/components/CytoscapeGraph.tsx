// One node graph on cytoscape (dash#305), as the old dashboard drew its
// attacker and call graphs. The server renders an empty box; on the client
// this loads cytoscape (its own chunk), lays the model out, and styles it
// from the theme's resolved colours, restyling in place when the theme
// changes. Drag pans, the wheel zooms, nodes drag.
//
// The canvas is no use to a keyboard or a screen reader, so every node is
// also a link or button in a list beside it, which shows itself when a
// keyboard reaches it. The div cytoscape draws into is never one React
// renders children into.
import { useEffect, useRef, useState } from 'react'
import type { Core, NodeSingular, StylesheetJson } from 'cytoscape'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { canvasWorks, domResolver, onThemeChange } from '#/lib/chartTheme'
import type { ChartTheme } from '#/lib/chartTheme'
import type { GraphLink, GraphModel } from '#/lib/graphModels'
import { usePreferences } from '#/lib/prefs'

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const

/** The graph's nodes for a keyboard: hidden until one of them has focus,
 * then a row under the graph. */
function GraphLinks({ label, links, onActivate }: { label: string; links: GraphLink[]; onActivate?: (id: string) => void }) {
  const [focused, setFocused] = useState(false)
  return (
    <nav
      aria-label={label}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
      style={focused ? undefined : HIDDEN}
    >
      <HStack gap={2} wrap="wrap">
        {links.map((link) =>
          link.href ? (
            <Link key={link.id} href={link.href}>
              <Text type="supporting">{link.label}</Text>
            </Link>
          ) : (
            <Button key={link.id} label={link.label} size="sm" variant={link.pressed ? 'primary' : 'secondary'} aria-pressed={link.pressed} onClick={() => onActivate?.(link.id)} />
          ),
        )}
      </HStack>
    </nav>
  )
}

export function CytoscapeGraph({
  model,
  style,
  height,
  label,
  onNodeTap,
  decorate,
}: {
  model: GraphModel
  /** The stylesheet from the resolved theme. */
  style: (theme: ChartTheme) => StylesheetJson
  height: number
  /** What the graph shows, for screen readers. */
  label: string
  /** A click on a node, or Enter on its button in the list. */
  onNodeTap?: (id: string, node?: NodeSingular) => void
  /** Classes from state (selection, filter), applied after each change. */
  decorate?: (cy: Core) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const reduced = usePreferences()?.motion === 'on'
  const latest = useRef({ style, onNodeTap, decorate, reduced })
  latest.current = { style, onNodeTap, decorate, reduced }
  const [cy, setCy] = useState<Core | null>(null)

  useEffect(() => {
    const box = boxRef.current
    const host = hostRef.current
    if (!box || !host || !canvasWorks()) return
    const life = { disposed: false }
    let instance: Core | null = null
    let unsubscribe = () => {}
    let observer: ResizeObserver | null = null
    const theme = (): ChartTheme => ({ c: domResolver(host), fontFamily: getComputedStyle(host).fontFamily, animate: !latest.current.reduced })
    void (async () => {
      const cytoscape = (await import('cytoscape')).default
      if (life.disposed) return
      const g = cytoscape({
        container: box,
        elements: model.elements,
        style: latest.current.style(theme()),
        layout: model.layout,
        minZoom: 0.25,
        maxZoom: 4,
        boxSelectionEnabled: false,
      })
      instance = g
      g.on('tap', 'node', (e) => latest.current.onNodeTap?.(e.target.id(), e.target as NodeSingular))
      g.on('mouseover', 'node', (e) => {
        const node = e.target as NodeSingular
        node.addClass('hover')
        node.connectedEdges().addClass('hover')
        box.style.cursor = latest.current.onNodeTap ? 'pointer' : ''
      })
      g.on('mouseout', 'node', (e) => {
        const node = e.target as NodeSingular
        node.removeClass('hover')
        node.connectedEdges().removeClass('hover')
        box.style.cursor = ''
      })
      // The card settles at its width after the graph is built, and changes
      // it with the window: keep the graph fitted.
      // Fitted, but never blown up past 1.25x: a small graph stays its size.
      observer = new ResizeObserver(() => {
        g.resize()
        g.fit(undefined, 24)
        if (g.zoom() > 1.25) {
          g.zoom(1.25)
          g.center()
        }
      })
      observer.observe(box)
      unsubscribe = onThemeChange(() => g.style().fromJson(latest.current.style(theme())).update())
      setCy(g)
    })()
    return () => {
      life.disposed = true
      observer?.disconnect()
      unsubscribe()
      instance?.destroy()
      setCy(null)
    }
    // The links (the keyboard list) may change without a new layout.
  }, [model.elements, model.layout])

  useEffect(() => {
    if (cy) decorate?.(cy)
  }, [cy, decorate])

  return (
    <div>
      <div ref={hostRef} style={{ position: 'relative', height }}>
        <div ref={boxRef} role="img" aria-label={label} style={{ position: 'absolute', inset: 0 }} />
      </div>
      <GraphLinks label={`${label}: every node`} links={model.links} onActivate={(id) => onNodeTap?.(id)} />
    </div>
  )
}
