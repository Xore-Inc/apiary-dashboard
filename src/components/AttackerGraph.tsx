// One attacker identity as a hub and its member addresses as spokes, on
// cytoscape (dash#305): how wide the thing is at a glance. Spokes open the
// address; past the cap, the rest fold into one "+N more" node that opens the
// member list.
import { useMemo } from 'react'
import { Text } from '@astryxdesign/core/Text'
import { useNavigate } from '@tanstack/react-router'
import { attackerGraph, attackerStyle } from '#/lib/graphModels'
import { CytoscapeGraph } from './CytoscapeGraph'

export function AttackerGraph({ id, ips, membersHref }: { id: string; ips: string[]; membersHref: string }) {
  const navigate = useNavigate()
  const model = useMemo(() => attackerGraph(id, ips, membersHref), [id, ips, membersHref])
  const overflow = model.links.some((l) => l.id === 'overflow')
  return (
    <div>
      <CytoscapeGraph
        model={model}
        style={attackerStyle}
        height={420}
        label={`Attacker identity ${id.slice(0, 8)} and its ${ips.length} member addresses`}
        onNodeTap={(nodeId) => {
          const href = model.links.find((l) => l.id === nodeId)?.href
          if (!href) return
          // The member list is on this page: scroll to it.
          if (href.startsWith('#')) document.getElementById(href.slice(1))?.scrollIntoView({ block: 'start' })
          else void navigate({ href })
        }}
      />
      <Text type="supporting">{`${ips.length} member ${ips.length === 1 ? 'address' : 'addresses'}. Open one for its own page${overflow ? '; the rest are in the member list' : ''}. Drag to pan, scroll to zoom.`}</Text>
    </div>
  )
}
