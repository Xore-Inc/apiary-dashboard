import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ReportInspector } from '#/components/details/ProblemReport'
import { problemReportsQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

/** The report the page is about, from the list's read. */
const pick = (data: ResourceData<typeof problemReportsQuery>, id: string) => data.find((r) => r.id === id)

export const Route = createFileRoute('/_layout/problem-reports/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const row = pick(await ensure(context, problemReportsQuery()), params.id)
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound
      title="Problem report"
      description="No problem report has this id."
    />
  ),
  component: ProblemReportPage,
  pendingComponent: ProblemReportPage,
})

function ProblemReportPage() {
  const { id } = Route.useParams()
  const list = usePageQuery(problemReportsQuery())
  const d = list && pick(list, id)
  return (
    <EntityFrame
      kind="Problem report"
      title={<Pending width={280}>{d && `Problem on ${d.page}`}</Pending>}
      basePath={`/problem-reports/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Submitted', value: d && formatDateTime(d.submittedAt) },
        { label: 'By', value: d?.submittedBy },
        { label: 'Status', value: d?.status },
      ]}
    >
      {d ? <ReportInspector key={d.id} report={d} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
