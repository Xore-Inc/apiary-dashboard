import { pageSsr } from '#/lib/pageSsr'
import { Link } from '@astryxdesign/core/Link'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { RevDeckRun } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { analysisTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { revDeckRunsQuery } from '#/data/resources'

// An index leaf, not revdeck.tsx: a parent route with a component would
// swallow revdeck/$sha.
export const Route = createFileRoute('/_layout/revdeck/')({
  ssr: pageSsr,
  staticData: { viewTabs: analysisTabs() },
  loader: ({ context }) => ensure(context, revDeckRunsQuery()),
  component: RevDeckIndexPage,
  pendingComponent: RevDeckIndexPage,
})

const columns: TableColumn<RevDeckRun>[] = [
  { key: 'at', header: 'Analyzed', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.at)}</Text> },
  { key: 'sha', header: 'SHA-256', width: proportional(2), renderCell: (row) => <Link href={`/payloads/${row.sha}/revdeck`}><Text type="code">{`${row.sha.slice(0, 24)}…`}</Text></Link> },
  { key: 'status', header: 'Status', width: pixel(112), renderCell: (row) => <Token size="sm" color={row.status === 'completed' ? 'green' : 'red'} label={row.status} /> },
  { key: 'verdict', header: 'Verdict', width: proportional(1) },
]

function RevDeckIndexPage() {
  const runs = usePageQuery(revDeckRunsQuery())
  return (
    <RecordList
      title="RevDeck"
      description="Reverse-engineering deck runs: deep binary walkthroughs produced by the Ghidra worker's drain queue."
      rows={runs}
      columns={columns}
      getHref={(row) => `/payloads/${row.sha}/revdeck`}
      getId={(row) => row.sha}
      emptyState={{ title: 'No RevDeck runs yet', description: 'Runs appear once the Ghidra worker drains its queue.' }}
    />
  )
}
