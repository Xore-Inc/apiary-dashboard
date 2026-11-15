import { pageSsr } from '#/lib/pageSsr'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { createFileRoute } from '@tanstack/react-router'
import { CountTable, Panel, StatTile } from '#/components/DashboardBlocks'
import { RecordList } from '#/components/RecordList'
import { WorldMap } from '#/components/WorldMap'
import type { SourceProfile } from '#/data/types'
import { entityHref } from '#/lib/entities'
import { apiHref } from '#/lib/apiHref'
import { formatNumber, formatTime } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { sourceProfilesQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/ips')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, sourceProfilesQuery()),
  component: SourcesPage,
  pendingComponent: SourcesPage,
})

const columns: TableColumn<SourceProfile>[] = [
  { key: 'ip', header: 'Source IP', width: pixel(152), renderCell: (row) => <Text weight="semibold">{row.ip}</Text> },
  { key: 'country', header: 'Country', width: pixel(88), renderCell: (row) => <Token size="sm" color="blue" label={row.country} /> },
  { key: 'org', header: 'Provider', width: proportional(2) },
  { key: 'events', header: 'Events', width: pixel(80), align: 'end', renderCell: (row) => formatNumber(row.events) },
  { key: 'logins', header: 'Logins', width: pixel(72), align: 'end' },
  { key: 'sessions', header: 'Sessions', width: pixel(88), align: 'end' },
  { key: 'sensors', header: 'Sensors', width: pixel(80), align: 'end', renderCell: (row) => row.sensors.length },
  { key: 'last', header: 'Last seen', width: pixel(104), renderCell: (row) => <Text type="supporting">{formatTime(row.last)}</Text> },
]

/** Where attacks come from, then every source as one scannable row that
 * opens its page. */
function SourcesPage() {
  const data = usePageQuery(sourceProfilesQuery())
  const sources = data?.sources
  const mapPoints = data?.mapPoints
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const rows = sources?.filter((s) => !needle || s.ip.includes(needle) || s.org.toLowerCase().includes(needle) || s.country.toLowerCase() === needle)

  return (
    <RecordList
      title="Attack sources"
      description="Every source address the sensors observed, with event volume, location, and activity window."
      actions={
        <Button
          label="CSV"
          size="sm"
          variant="secondary"
          icon={<Icon icon={ArrowDownTrayIcon} size="sm" />}
          href={apiHref('/api/export/ips.csv')}
        />
      }
      summary={
        <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
          <Panel title="Attack origins" action={<Text type="supporting">Click a country to see its events</Text>}>
            <WorldMap points={mapPoints ?? []} />
          </Panel>
          <VStack gap={4}>
            <Grid columns={{ minWidth: 150, repeat: 'fit' }} gap={3}>
              <StatTile label="Unique source IPs" value={sources?.length} />
              <StatTile label="Countries" value={mapPoints?.length} />
              <StatTile label="Sessions" value={sources?.reduce((n, s) => n + s.sessions, 0)} />
              <StatTile label="Login attempts" value={sources?.reduce((n, s) => n + s.logins, 0)} href="/events?kind=login" />
            </Grid>
            <Panel title="By country">
              <CountTable
                header="Country"
                countHeader="Events"
                rows={mapPoints && [...mapPoints].sort((a, b) => b.events - a.events).slice(0, 8).map((p) => ({ id: p.country, label: p.country, count: p.events }))}
                linkTo={(c) => `/events?country=${c}`}
              />
            </Panel>
          </VStack>
        </Grid>
      }
      toolbar={<TextInput label="Filter sources" isLabelHidden size="sm" width={320} placeholder="Filter by IP, provider, or country code" value={filter} onChange={setFilter} />}
      rows={rows}
      columns={columns}
      getId={(row) => row.ip}
      getHref={(row) => entityHref('source', row.ip)!}
      emptyState={{ title: 'No sources match', description: 'Clear the filter to see every source address.' }}
    />
  )
}
