// Node spacing for a Sankey that fits its height. Recharts lays each column
// out as `height - (n - 1) * nodePadding`, shared by the column's values, so
// a column with more nodes than the padding allows draws negative heights
// (the topology's sensor column: ~30 nodes at 28 px in a 480 px chart).

type Flow = { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }

/** The most nodes in one column, columns placed as Recharts does: a node's
 * depth is its longest path from a node with no incoming link, and nodes
 * with no outgoing link sit in the last column. */
export function widestColumn(flow: Flow): number {
  const n = flow.nodes.length
  if (n === 0) return 0
  const links = flow.links.filter((l) => l.source !== l.target && l.source < n && l.target < n)
  const depth = new Array<number>(n).fill(0)
  // Longest path by relaxation; at most n rounds, so a cycle cannot spin.
  for (let round = 0; round < n; round++) {
    let changed = false
    for (const l of links) {
      if (depth[l.target] < depth[l.source] + 1) {
        depth[l.target] = depth[l.source] + 1
        changed = true
      }
    }
    if (!changed) break
  }
  const last = Math.max(...depth)
  const outgoing = new Set(links.map((l) => l.source))
  const counts = new Map<number, number>()
  depth.forEach((d, i) => {
    const column = outgoing.has(i) ? d : last
    counts.set(column, (counts.get(column) ?? 0) + 1)
  })
  return Math.max(...counts.values())
}

/** `preferred` px between nodes, shrunk so the widest column's gaps take at
 * most half of `innerHeight`, and never below 1 px. */
export function sankeyNodePadding(flow: Flow, innerHeight: number, preferred = 28): number {
  const gaps = widestColumn(flow) - 1
  if (gaps <= 0) return preferred
  return Math.max(1, Math.min(preferred, Math.floor((innerHeight * 0.5) / gaps)))
}
