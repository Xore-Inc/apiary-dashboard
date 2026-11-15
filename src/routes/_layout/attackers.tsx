import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { HStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { AttackerEntity } from '#/data/types'
import { entityHref } from '#/lib/entities'
import { formatNumber, formatTime } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { attackersQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/attackers')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, attackersQuery()),
  component: AttackersPage,
  pendingComponent: AttackersPage,
})

const columns: TableColumn<AttackerEntity>[] = [
  {
    key: 'id',
    header: 'Entity',
    width: pixel(112),
    renderCell: (row) => (
      <Text type="code" hasTruncateTooltip>
        {row.id.slice(0, 8)}
      </Text>
    ),
  },
  { key: 'ips', header: 'IPs', width: pixel(56), align: 'end', renderCell: (row) => row.ips.length },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
  {
    key: 'sensors',
    header: 'Sensors',
    width: proportional(3),
    renderCell: (row) => (
      <HStack gap={1} vAlign="center">
        {row.sensors.slice(0, 2).map((sensor) => (
          <Token key={sensor} label={sensor} size="sm" />
        ))}
        {row.sensors.length > 2 && <Text type="supporting">+{row.sensors.length - 2}</Text>}
      </HStack>
    ),
  },
  { key: 'last', header: 'Last', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.last)}</Text> },
  {
    key: 'verdicts',
    header: 'Flags',
    width: pixel(152),
    renderCell: (row) => (
      <HStack gap={1}>
        {row.verdicts.length > 0 && <Token label="verdict" size="sm" color="purple" />}
        {row.scan && <Token label={row.scan} size="sm" color="orange" />}
      </HStack>
    ),
  },
]

function AttackersPage() {
  const attackers = usePageQuery(attackersQuery())
  const merged = attackers?.filter((a) => a.ips.length > 1).length
  return (
    <RecordList
      title="Attacker identities"
      description="Durable entities merged across IP churn by shared fingerprint, payload, and credential signals."
      actions={
        <>
          <Text type="supporting"><Pending>{attackers && `${attackers.length} identities`}</Pending></Text>
          <Token label={`${merged} merged across >1 IP`} size="sm" />
        </>
      }
      rows={attackers}
      columns={columns}
      getId={(row) => row.id}
      getHref={(row) => entityHref('identity', row.id)!}
      emptyState={{
        title: 'No attacker entities yet',
        description: 'IPs sharing two or more strong signals merge into durable entities as traffic accumulates.',
      }}
    />
  )
}
