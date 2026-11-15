import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { CountTable, Panel, StatTile, windowTitle } from '#/components/DashboardBlocks'
import { RecordList } from '#/components/RecordList'
import type { AuthFailure } from '#/data/types'
import { formatTime } from '#/lib/format'
import { SourceIp } from '#/components/details/AuthFailure'
import { ensure, usePageQuery } from '#/lib/query'
import { authEventsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/auth-events/')({
  ssr: pageSsr,
  loader: ({ context }) => ensure(context, authEventsQuery()),
  component: AuthEventsPage,
  pendingComponent: AuthEventsPage,
})

const columns: TableColumn<AuthFailure>[] = [
  { key: 'timestamp', header: 'Time', width: pixel(96), renderCell: (row) => <Text type="supporting">{formatTime(row.timestamp)}</Text> },
  { key: 'type', header: 'Type', width: pixel(176), renderCell: (row) => <Token label={row.type} size="sm" color="orange" /> },
  { key: 'ip', header: 'Source IP', width: pixel(144), renderCell: (row) => <SourceIp ip={row.ip} /> },
  { key: 'error', header: 'Error', width: proportional(2), renderCell: (row) => <Text type="code">{row.error}</Text> },
  { key: 'username', header: 'Username tried', width: pixel(136), renderCell: (row) => row.username ?? '—' },
  { key: 'clientId', header: 'Client', width: pixel(152) },
]

function AuthEventsPage() {
  const data = usePageQuery(authEventsQuery())
  return (
    <RecordList
      title="Auth-failure events"
      description="Failed logins against Keycloak, across every gateway-fronted app and the dashboard's own sign-in. Redacted: never tokens, codes, or cookies."
      actions={<Text type="supporting"><Pending>{data && `${data.events.length} events`}</Pending></Text>}
      summary={
        <VStack gap={4}>
          <Grid columns={{ minWidth: 200, repeat: 'fit' }} gap={4}>
            <StatTile label="Failed logins, 24h" value={data?.failed24h} />
          </Grid>
          <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
            <Panel title={windowTitle('Failures by client, 24h', data?.breakdownRows)}>
              <CountTable header="Client" rows={data?.byClient} countHeader="Failures" />
            </Panel>
            <Panel title={windowTitle('Top source IPs, 24h', data?.breakdownRows)}>
              <CountTable header="Source IP" rows={data?.topSources} countHeader="Failures" />
            </Panel>
          </Grid>
        </VStack>
      }
      rows={data?.events}
      columns={columns}
      getId={(row) => row.id}
      getHref={(row) => `/auth-events/${encodeURIComponent(row.id)}`}
      emptyState={{
        title: 'No failed logins recorded yet',
        description: 'auth-events-worker records every rejected credential attempt as it happens.',
      }}
    />
  )
}
