// The decompiled functions as a call graph on cytoscape (dash#305): callers
// above their callees, in layers from the entry points down. Selecting a
// function keeps it and its direct neighbours lit and dims the rest; the
// filter dims every function whose name does not match. Function names come
// from the sample; cytoscape draws them as canvas text, never as markup.
import { useCallback, useMemo, useState } from 'react'
import type { Core } from 'cytoscape'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { GhidraFunction } from '#/data/types'
import { callGraph, callGraphLit, callGraphStyle } from '#/lib/graphModels'
import { CytoscapeGraph } from '../CytoscapeGraph'

export function CallGraph({ functions, selected, onSelect }: { functions: GhidraFunction[]; selected?: string; onSelect: (name: string) => void }) {
  const [filter, setFilter] = useState('')
  // The layout depends on the functions only; selection is a class.
  const model = useMemo(() => callGraph(functions), [functions])
  const links = useMemo(() => model.links.map((l) => ({ ...l, pressed: l.id === `fn:${selected}` })), [model, selected])
  const focus = selected ? functions.find((f) => f.name === selected) : undefined
  const decorate = useCallback(
    (cy: Core) => {
      const lit = callGraphLit(functions, selected, filter)
      cy.batch(() => {
        cy.nodes().forEach((node) => {
          const name = node.data('name') as string
          node.toggleClass('dim', !lit.has(name))
          node.toggleClass('selected', name === selected)
        })
        cy.edges().forEach((edge) => {
          const [a, b] = [edge.source().data('name') as string, edge.target().data('name') as string]
          const on = lit.has(a) && lit.has(b) && (!selected || a === selected || b === selected)
          edge.toggleClass('dim', !on)
          edge.toggleClass('near', on && !!selected)
        })
      })
    },
    [functions, selected, filter],
  )
  const height = Math.min(720, Math.max(320, functions.length * 28 + 140))
  return (
    <VStack gap={2}>
      <TextInput label="Filter functions" isLabelHidden placeholder="Filter by name" size="sm" width={240} value={filter} onChange={setFilter} />
      <CytoscapeGraph
        model={{ ...model, links }}
        style={callGraphStyle}
        height={height}
        label="Call graph of the decompiled functions"
        decorate={decorate}
        onNodeTap={(id) => onSelect(id.replace(/^fn:/, ''))}
      />
      <Text type="supporting">{focus ? `${focus.name}: called by ${focus.callers.length || 'nothing'}, calls ${focus.callees.length || 'nothing'}. Select another function, or the same one again to clear.` : 'Select a function to see only its callers and callees. Drag to pan, scroll to zoom.'}</Text>
    </VStack>
  )
}
