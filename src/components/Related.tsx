import { Skeleton } from '@astryxdesign/core/Skeleton'
import { useCallback, useMemo, useState } from 'react'
import { Grid } from '@astryxdesign/core/Grid'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useNavigate } from '@tanstack/react-router'
import type { RelatedGroup } from '#/data/types'
import { ENTITIES } from '#/lib/entities'
import type { EntityKind } from '#/lib/entities'
import { isBackendGap } from '#/lib/backendGap'
import type { BackendGap } from '#/lib/backendGap'
import type { ChartTheme } from '#/lib/chartTheme'
import { groupColor, relatedGraph, relatedStyle } from '#/lib/graphModels'
import { Panel } from './DashboardBlocks'
import { EntityLink } from './EntityLink'
import { PanelBackendGap } from './PanelBackendGap'
import { CytoscapeGraph } from './CytoscapeGraph'

const isKind = (kind: string): kind is EntityKind => kind in ENTITIES

function RelatedList({ groups }: { groups: RelatedGroup[] }) {
  return (
    <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={4}>
      {groups.map((group) => (
        <VStack key={`${group.kind}-${group.label}`} gap={1}>
          <Text type="label" color="secondary">
            {group.label}
          </Text>
          {group.items.map((item) => (
            <HStack key={item.id} gap={2} vAlign="center">
              {isKind(group.kind) ? <EntityLink kind={group.kind} id={item.id}>{item.label}</EntityLink> : <Text>{item.label ?? item.id}</Text>}
              {item.note && <Text type="supporting">{item.note}</Text>}
            </HStack>
          ))}
        </VStack>
      ))}
    </Grid>
  )
}

/** The entity in the middle, everything related around it, one colour per
 * kind, each kind kept together, on cytoscape (dash#305). Every node opens
 * its page. */
function RelationGraph({ center, groups }: { center: string; groups: RelatedGroup[] }) {
  const navigate = useNavigate()
  const model = useMemo(() => relatedGraph(center, groups), [center, groups])
  const style = useCallback((t: ChartTheme) => relatedStyle(t, groups.length), [groups.length])
  return (
    <VStack gap={2}>
      <CytoscapeGraph
        model={model}
        style={style}
        height={460}
        label={`Relationships of ${center}`}
        onNodeTap={(id) => {
          const href = model.links.find((l) => l.id === id)?.href
          if (href) void navigate({ href })
        }}
      />
      <HStack gap={3} wrap="wrap">
        {groups.map((group, g) => (
          <HStack key={`${group.kind}-${group.label}`} gap={1} vAlign="center">
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: groupColor(g) }} />
            <Text type="supporting">{group.label}</Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  )
}

/** The live backend relates over its default 7-day window (data/api.ts
 * `RELATED_RANGE`). */
const RELATED_TITLE = 'Related, last 7 days'

/** Everything else this entity touches, as a list or a graph. */
export function RelatedPanel({ center, groups }: { center: string; groups: RelatedGroup[] | BackendGap | undefined }) {
  const [view, setView] = useState<'list' | 'graph'>('list')
  if (isBackendGap(groups))
    return (
      <Panel title={RELATED_TITLE}>
        <PanelBackendGap detail={groups.gap} />
      </Panel>
    )
  if (!groups)
    return (
      <Panel title={RELATED_TITLE}>
        <Skeleton height={160} />
      </Panel>
    )
  if (groups.length === 0) return null
  return (
    <Panel
      title={RELATED_TITLE}
      action={
        <SegmentedControl label="Related view" size="sm" value={view} onChange={(value) => setView(value as 'list' | 'graph')}>
          <SegmentedControlItem value="list" label="List" />
          <SegmentedControlItem value="graph" label="Graph" />
        </SegmentedControl>
      }
    >
      {view === 'list' ? <RelatedList groups={groups} /> : <RelationGraph center={center} groups={groups} />}
    </Panel>
  )
}
