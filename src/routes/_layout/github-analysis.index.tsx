import { pageSsr } from '#/lib/pageSsr'
import { Link } from '@astryxdesign/core/Link'
import { pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute } from '@tanstack/react-router'
import { RecordList } from '#/components/RecordList'
import type { GithubAnalysis, GithubStatus } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { analysisTabs } from '#/lib/navFamilies'
import { ensure, usePageQuery } from '#/lib/query'
import { githubAnalysesQuery } from '#/data/resources'

// Index leaf so github-analysis/$sha is not swallowed by a parent component.
export const Route = createFileRoute('/_layout/github-analysis/')({
  ssr: pageSsr,
  staticData: { viewTabs: analysisTabs() },
  loader: ({ context }) => ensure(context, githubAnalysesQuery()),
  component: GithubIndexPage,
  pendingComponent: GithubIndexPage,
})

const STATUS_COLOR = { published: 'green', dry_run: 'gray', denylist_blocked: 'orange', quota_exceeded: 'red' } as const satisfies Record<GithubStatus, string>

const columns: TableColumn<GithubAnalysis>[] = [
  { key: 'at', header: 'Analyzed', width: pixel(184), renderCell: (row) => <Text type="supporting">{formatDateTime(row.at)}</Text> },
  { key: 'sha', header: 'File', width: proportional(2), renderCell: (row) => <Link href={`/payloads/${row.sha}/github`}><Text type="code">{`${row.sha.slice(0, 24)}…`}</Text></Link> },
  { key: 'status', header: 'Status', width: pixel(152), renderCell: (row) => <Token size="sm" color={STATUS_COLOR[row.status]} label={row.status} /> },
  { key: 'detections', header: 'Detections', width: pixel(104), align: 'end', renderCell: (row) => `${row.detections}/${row.engines}` },
  { key: 'family', header: 'Family', width: pixel(112), renderCell: (row) => row.family ?? '—' },
]

function GithubIndexPage() {
  const rows = usePageQuery(githubAnalysesQuery())
  return (
    <RecordList
      title="GitHub analysis"
      description="Multi-engine verdicts for captured payloads published to the analysis repository."
      rows={rows}
      columns={columns}
      getHref={(row) => `/payloads/${row.sha}/github`}
      getId={(row) => row.sha}
      emptyState={{ title: 'Nothing published yet', description: 'Results appear once a sample is published and scanned.' }}
    />
  )
}
