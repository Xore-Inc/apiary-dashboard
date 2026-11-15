import { pageSsr } from '#/lib/pageSsr'
import { Link } from '@astryxdesign/core/Link'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { CapeRun } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { analysisTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { capeRunsQuery } from '#/data/resources'

// Index leaf so cape/$sha is not swallowed by a parent component.
export const Route = createFileRoute('/_layout/cape/')({
  ssr: pageSsr,
  staticData: { viewTabs: analysisTabs() },
  loader: ({ context }) => ensure(context, capeRunsQuery()),
  component: CapeIndexPage,
  pendingComponent: CapeIndexPage,
})

const columns: TableColumn<CapeRun>[] = [
  { key: 'at', header: 'Analyzed', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.at)}</Text> },
  { key: 'sha', header: 'File', width: proportional(2), renderCell: (row) => <Link href={`/payloads/${row.sha}/cape`}><Text type="code">{`${row.sha.slice(0, 24)}…`}</Text></Link> },
  { key: 'status', header: 'Status', width: pixel(144), renderCell: (row) => <Token size="sm" color={row.status === 'reported' ? 'green' : 'red'} label={row.status} /> },
  { key: 'malscore', header: 'Malscore', width: pixel(96), align: 'end', renderCell: (row) => row.malscore.toFixed(1) },
]

function CapeIndexPage() {
  const runs = usePageQuery(capeRunsQuery())
  return (
    <RecordList
      title="CAPE"
      description="Detonations in CAPE's debugger-instrumented Windows guest, with configuration extraction for payloads that warrant it."
      rows={runs}
      columns={columns}
      getHref={(row) => `/payloads/${row.sha}/cape`}
      getId={(row) => row.sha}
      emptyState={{ title: 'No CAPE runs yet', description: 'Runs appear once the CAPE route detonates a sample.' }}
    />
  )
}
