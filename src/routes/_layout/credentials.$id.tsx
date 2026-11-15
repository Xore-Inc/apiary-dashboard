import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { CredentialInspector } from '#/components/details/BaitCredential'
import { credentialsQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

/** The credential the page is about, with the tokens it can link to, from the list's read. */
const pick = (data: ResourceData<typeof credentialsQuery>, id: string) => {
  const credential = data.credentials.find((c) => c.id === id)
  return credential && { ...credential, tokens: data.tokens }
}

export const Route = createFileRoute('/_layout/credentials/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const row = pick(await ensure(context, credentialsQuery()), params.id)
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound
      title="Bait credential"
      description="No bait credential has this id."
    />
  ),
  component: BaitCredentialPage,
  pendingComponent: BaitCredentialPage,
})

function BaitCredentialPage() {
  const { id } = Route.useParams()
  const list = usePageQuery(credentialsQuery())
  const d = list && pick(list, id)
  return (
    <EntityFrame
      kind="Bait credential"
      title={<Pending width={280}>{d && `${d.username} @ ${d.target}`}</Pending>}
      basePath={`/credentials/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Planted', value: d && formatDateTime(d.createdAt) },
        { label: 'Path', value: d?.path },
        { label: 'Template', value: d?.template },
      ]}
    >
      {d ? <CredentialInspector key={d.id} credential={d} tokens={d.tokens} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
