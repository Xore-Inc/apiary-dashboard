import { Skeleton } from '@astryxdesign/core/Skeleton'
import { useState } from 'react'
import { Grid } from '@astryxdesign/core/Grid'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useNavigate } from '@tanstack/react-router'
import type { RelatedGroup } from '#/data/types'
import { ENTITIES, entityHref } from '#/lib/entities'
import type { EntityKind } from '#/lib/entities'
import { isBackendGap } from '#/lib/backendGap'
import type { BackendGap } from '#/lib/backendGap'
import { Panel } from './DashboardBlocks'
import { EntityLink } from './EntityLink'
import { PanelBackendGap } from './PanelBackendGap'

// Validated categorical order; groups past the fifth fall back to neutral.
const COLORS = [
  'var(--color-data-categorical-blue)',
  'var(--color-data-categorical-orange)',
  'var(--color-data-categorical-teal)',
  'var(--color-data-categorical-purple)',
  'var(--color-data-categorical-pink)',
]
const colorOf = (index: number) => COLORS[index] ?? 'var(--color-text-secondary)'
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

const W = 800
const H = 520
const HALO = { paintOrder: 'stroke', stroke: 'var(--color-background-card)', strokeWidth: 4, strokeLinejoin: 'round' } as const

/** The entity in the middle, everything related around it on spokes, one
 * colour per kind with a gap between kinds. Labels run along their spoke so
 * neighbours never collide. Every node opens its page. */
function RelationGraph({ center, groups }: { center: string; groups: RelatedGroup[] }) {
  const navigate = useNavigate()
  const shown = groups.map((group) => ({ ...group, items: group.items.slice(0, 6) }))
  // One empty slot between groups keeps each kind visually separate.
  const slots = shown.reduce((n, g) => n + g.items.length, 0) + shown.length
  let slot = 0
  const nodes = shown.flatMap((group, g) => {
    const placed = group.items.map((item) => ({ group, g, item, slot: slot++ }))
    slot++
    return placed
  })
  const cx = W / 2
  const cy = H / 2
  return (
    <VStack gap={2}>
      {/* Capped like the identity graph, so its labels do not grow with wide screens. */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 720, display: 'block', margin: '0 auto' }} role="group" aria-label={`Relationships of ${center}`}>
        {nodes.map(({ group, g, item, slot: at }) => {
          const angle = (at / slots) * 2 * Math.PI - Math.PI / 2
          const x = cx + Math.cos(angle) * 190
          const y = cy + Math.sin(angle) * 130
          const href = isKind(group.kind) ? (entityHref(group.kind, item.id) ?? ENTITIES[group.kind].events?.(item.id)) : undefined
          const label = item.label ?? item.id
          const deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI
          const left = Math.abs(deg) > 90
          return (
            <g key={`${group.kind}-${item.id}`}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={colorOf(g)} strokeOpacity={0.45} strokeWidth={1.5} />
              <a
                href={href}
                onClick={(event) => {
                  // Modified clicks open a tab the browser's way.
                  if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                  event.preventDefault()
                  void navigate({ href })
                }}
              >
                <title>{`${group.label}: ${item.id}${item.note ? ` (${item.note})` : ''}`}</title>
                <circle cx={x} cy={y} r={7} fill={colorOf(g)} stroke="var(--color-background-card)" strokeWidth={2} />
                <text
                  x={x}
                  y={y}
                  dx={left ? -11 : 11}
                  dy={4}
                  fontSize={12}
                  textAnchor={left ? 'end' : 'start'}
                  transform={`rotate(${left ? deg + 180 : deg} ${x} ${y})`}
                  fill="var(--color-text-primary)"
                  style={HALO}
                >
                  {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                </text>
              </a>
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={11} fill="var(--color-text-primary)" />
        <text x={cx} y={cy - 20} fontSize={13} fontWeight={600} textAnchor="middle" fill="var(--color-text-primary)" style={HALO}>
          {center.length > 30 ? `${center.slice(0, 29)}…` : center}
        </text>
      </svg>
      <HStack gap={3} wrap="wrap">
        {shown.map((group, g) => (
          <HStack key={`${group.kind}-${group.label}`} gap={1} vAlign="center">
            <svg width={10} height={10} aria-hidden>
              <circle cx={5} cy={5} r={5} fill={colorOf(g)} />
            </svg>
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
