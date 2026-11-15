import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { TriggerInspector } from '#/components/details/Canary'
import { canarytokensQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

/** The trigger the page is about, from the tokens' read. */
const pick = (data: ResourceData<typeof canarytokensQuery>, id: string) => data.triggers.find((t) => t.id === id)

export const Route = createFileRoute('/_layout/canarytokens/triggers/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const row = pick(await ensure(context, canarytokensQuery()), params.id)
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound
      title="Canarytoken trigger"
      description="No canarytoken trigger has this id."
    />
  ),
  component: CanaryTriggerPage,
  pendingComponent: CanaryTriggerPage,
})

function CanaryTriggerPage() {
  const { id } = Route.useParams()
  const list = usePageQuery(canarytokensQuery())
  const d = list && pick(list, id)
  return (
    <EntityFrame
      kind="Canarytoken trigger"
      title={<Pending width={280}>{d && `${d.memo} fired`}</Pending>}
      basePath={`/canarytokens/triggers/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Fired', value: d && formatDateTime(d.triggeredAt) },
        { label: 'From', value: d?.srcIp },
        { label: 'Location', value: d?.location },
      ]}
    >
      {d ? <TriggerInspector trigger={d} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
