import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { entityHref } from '#/lib/entities'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { RecordList } from '#/components/RecordList'
import type { CredEdge, NetworkCampaign } from '#/data/types'
import { apiHref } from '#/lib/apiHref'
import { formatNumber, formatTime } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { networkCampaignsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/campaigns/')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, networkCampaignsQuery()),
  component: CampaignsPage,
  pendingComponent: CampaignsPage,
})

const cidrHref = (cidr: string) => `/campaigns/${encodeURIComponent(cidr)}`

const columns: TableColumn<NetworkCampaign>[] = [
  { key: 'score', header: 'Score', width: pixel(64), align: 'end', renderCell: (row) => <Text weight="semibold">{row.score}</Text> },
  { key: 'cidr', header: 'Network', width: pixel(168), renderCell: (row) => <Link href={cidrHref(row.cidr)}>{row.cidr}</Link> },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
  { key: 'uniqueIps', header: 'IPs', width: pixel(56), align: 'end' },
  { key: 'scan', header: 'Scan', width: pixel(104), renderCell: (row) => (row.scan ? <Token label={row.scan} size="sm" color="orange" /> : null) },
  {
    key: 'sensors',
    header: 'Sensors',
    width: proportional(2),
    renderCell: (row) => row.sensors.slice(0, 3).join(' ') + (row.sensors.length > 3 ? ` +${row.sensors.length - 3}` : ''),
  },
  { key: 'last', header: 'Last', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.last)}</Text> },
]

const credColumns: TableColumn<CredEdge>[] = [
  { key: 'id', header: 'Credential', width: proportional(2), renderCell: (row) => <Text type="code">{`${row.user}:${row.pass}`}</Text> },
  { key: 'uniqueIps', header: 'IPs', width: pixel(64), align: 'end' },
  { key: 'sensors', header: 'Sensors', width: proportional(2), renderCell: (row) => row.sensors.join(' ') },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
  { key: 'last', header: 'Last', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.last)}</Text> },
]


function CampaignsPage() {
  const data = usePageQuery(networkCampaignsQuery())
  const campaigns = data?.campaigns
  const credReuse = data?.credReuse ?? []
  return (
    <RecordList
      title="Correlated campaigns"
      description="Related source networks grouped across sensors over a rolling 7-day window."
      actions={
        <>
          <Text type="supporting"><Pending>{campaigns && `${campaigns.length} active networks`}</Pending></Text>
          <Button
            label="CSV"
            size="sm"
            variant="secondary"
            icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
            href={apiHref('/api/export/campaigns.csv')}
          />
        </>
      }
      summary={
        <VStack gap={4}>
          <Text color="secondary">
            The score combines volume, unique sources, sensor and port spread, reused credentials, captured payloads, and
            IDS alerts. Select a network to see why it was grouped.
          </Text>
          {credReuse.length > 0 && (
            <Panel title="Reused credentials">
              <Text color="secondary">
                Username/password pairs tried by two or more distinct source IPs: a shared-wordlist signal that holds
                across campaigns.
              </Text>
              <Table data={credReuse.slice(0, 8)} columns={credColumns} idKey="id" density="compact" />
            </Panel>
          )}
        </VStack>
      }
      rows={campaigns}
      columns={columns}
      getHref={(row) => entityHref('campaign', row.cidr)!}
      getId={(row) => row.cidr}
      emptyState={{
        title: 'No active campaigns in this window',
        description: 'Campaigns appear once related networks correlate across sensors.',
      }}
    />
  )
}
