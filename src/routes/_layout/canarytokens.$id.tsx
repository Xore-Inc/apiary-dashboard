import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { TokenInspector } from '#/components/details/Canary'
import { canarytokensQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

/** The token the page is about, with every trigger, from the list's read. */
const pick = (data: ResourceData<typeof canarytokensQuery>, id: string) => {
  const token = data.tokens.find((t) => t.id === id)
  return token && { ...token, triggers: data.triggers }
}

export const Route = createFileRoute('/_layout/canarytokens/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const row = pick(await ensure(context, canarytokensQuery()), params.id)
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound title="Canarytoken" description="No canarytoken has this id." />
  ),
  component: CanaryTokenPage,
  pendingComponent: CanaryTokenPage,
})

function CanaryTokenPage() {
  const { id } = Route.useParams()
  const list = usePageQuery(canarytokensQuery())
  const d = list && pick(list, id)
  return (
    <EntityFrame
      kind="Canarytoken"
      title={<Pending width={280}>{d?.memo}</Pending>}
      basePath={`/canarytokens/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Type', value: d?.type },
        { label: 'Created', value: d && formatDateTime(d.createdAt) },
        { label: 'By', value: d?.createdBy },
      ]}
    >
      {d ? <TokenInspector token={d} triggers={d.triggers} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
