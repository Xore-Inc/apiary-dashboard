import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { pixel, proportional } from '@astryxdesign/core/Table'
import { clusterHref } from '#/lib/entities'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { InfraCluster } from '#/data/types'
import { apiHref } from '#/lib/apiHref'
import { formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { infraClustersQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/clusters/')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, infraClustersQuery()),
  component: ClustersPage,
  pendingComponent: ClustersPage,
})

const rowHref = (row: InfraCluster) => clusterHref(row.kind, row.value)

const columns: TableColumn<InfraCluster>[] = [
  { key: 'kind', header: 'Cluster type', width: pixel(120), renderCell: (row) => <Token label={row.kind} size="sm" /> },
  {
    key: 'value',
    header: 'Shared value',
    width: proportional(3),
    renderCell: (row) => (
      <Link href={rowHref(row)}>
        <Text type="code">{row.value}</Text>
      </Link>
    ),
  },
  { key: 'sources', header: 'Source IPs', width: pixel(96), align: 'end' },
  { key: 'events', header: 'Events', width: pixel(88), align: 'end', renderCell: (row) => formatNumber(row.events) },
  { key: 'sensors', header: 'Sensors', width: pixel(96), align: 'end', renderCell: (row) => row.sensors.length },
]


function ClustersPage() {
  const clusters = usePageQuery(infraClustersQuery())
  return (
    <RecordList
      title="Infrastructure clusters"
      description="Fingerprints, payloads, autonomous systems, and providers shared by multiple source IPs."
      actions={
        <>
          <Text type="supporting"><Pending>{clusters && `${clusters.length} shared pivots`}</Pending></Text>
          <Button
            label="CSV"
            size="sm"
            variant="secondary"
            icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
            href={apiHref('/api/export/clusters.csv')}
          />
        </>
      }
      rows={clusters}
      columns={columns}
      getHref={rowHref}
      getId={(row) => row.id}
      emptyState={{
        title: 'No shared pivots in the current window',
        description: 'Clusters appear once two or more source IPs share a strong signal.',
      }}
    />
  )
}
