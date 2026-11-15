import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { DeadLetterDetail } from '#/components/details/DeadLetter'
import { deadLetterQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

export const Route = createFileRoute('/_layout/dead-letters/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    // The whole document: the list's rows cut the rejected event to a preview.
    const row = await ensure(context, deadLetterQuery(params.id))
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound
      title="Ingest dead letter"
      description="No rejected document has this id; it may have been purged."
    />
  ),
  component: DeadLetterPage,
  pendingComponent: DeadLetterPage,
})

function DeadLetterPage() {
  const { id } = Route.useParams()
  const d = usePageQuery(deadLetterQuery(id))
  return (
    <EntityFrame
      kind="Ingest dead letter"
      title={<Pending width={280}>{d?.index}</Pending>}
      basePath={`/dead-letters/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Rejected', value: d && formatDateTime(d.timestamp) },
        { label: 'Source', value: d?.source },
      ]}
    >
      {d ? <DeadLetterDetail row={d} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
