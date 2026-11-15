import { pageSsr } from '#/lib/pageSsr'
import { Pending } from '#/components/Pending'
import { Text } from '@astryxdesign/core/Text'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { ProblemReport, ProblemStatus } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { healthTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { problemReportsQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/problem-reports/')({
  ssr: pageSsr,
  staticData: { viewTabs: healthTabs },
  loader: ({ context }) => ensure(context, problemReportsQuery()),
  component: ProblemReportsPage,
  pendingComponent: ProblemReportsPage,
})

const STATUS_COLOR = { open: 'orange', triaged: 'blue', fixed: 'green', wontfix: 'gray' } as const satisfies Record<ProblemStatus, string>

const columns: TableColumn<ProblemReport>[] = [
  { key: 'submittedAt', header: 'Submitted', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.submittedAt)}</Text> },
  { key: 'status', header: 'Status', width: pixel(96), renderCell: (row) => <Token size="sm" color={STATUS_COLOR[row.status]} label={row.status} /> },
  { key: 'page', header: 'Page', width: pixel(184), renderCell: (row) => <Text type="code" maxLines={1}>{row.page}</Text> },
  { key: 'actual', header: 'What happened', width: proportional(3) },
  { key: 'consoleErrors', header: 'Console', width: pixel(80), align: 'end', renderCell: (row) => row.consoleErrors.length || '—' },
  { key: 'networkFailures', header: 'Network', width: pixel(80), align: 'end', renderCell: (row) => row.networkFailures.length || '—' },
]

function ProblemReportsPage() {
  const reports = usePageQuery(problemReportsQuery())
  return (
    <RecordList
      title="Problem reports"
      description="Operator-submitted UI problem reports, with the action trail and request context captured at submit time. Admin only: captures can include a DOM snapshot."
      actions={<Text type="supporting"><Pending>{reports && `${reports.filter((r) => r.status === 'open').length} open`}</Pending></Text>}
      rows={reports}
      columns={columns}
      getId={(row) => row.id}
      getHref={(row) => `/problem-reports/${encodeURIComponent(row.id)}`}
      emptyState={{ title: 'No problem reports', description: 'Reports submitted from any page land here.' }}
    />
  )
}
