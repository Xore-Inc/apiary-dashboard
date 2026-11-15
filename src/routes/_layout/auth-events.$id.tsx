import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { Pending } from '#/components/Pending'
import { ensure, usePageQuery } from '#/lib/query'
import type { ResourceData } from '#/lib/query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { AuthInspector } from '#/components/details/AuthFailure'
import { authEventsQuery } from '#/data/resources'
import { EntityFrame } from '#/components/EntityFrame'
import { NotFound } from '#/components/NotFound'
import { formatDateTime } from '#/lib/format'

/** The failure the page is about, from the list's read. */
const pick = (data: ResourceData<typeof authEventsQuery>, id: string) => data.events.find((e) => e.id === id)

export const Route = createFileRoute('/_layout/auth-events/$id')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const row = pick(await ensure(context, authEventsQuery()), params.id)
    if (!row) throw notFound()
    return row
  },
  notFoundComponent: () => (
    <NotFound title="Auth failure" description="No auth failure has this id." />
  ),
  component: AuthFailurePage,
  pendingComponent: AuthFailurePage,
})

function AuthFailurePage() {
  const { id } = Route.useParams()
  const list = usePageQuery(authEventsQuery())
  const d = list && pick(list, id)
  return (
    <EntityFrame
      kind="Auth failure"
      title={<Pending width={280}>{d?.type}</Pending>}
      basePath={`/auth-events/${encodeURIComponent(id)}`}
      facts={[
        { label: 'Time', value: d && formatDateTime(d.timestamp) },
        { label: 'Client', value: d?.clientId },
        { label: 'Realm', value: d?.realm },
      ]}
    >
      {d ? <AuthInspector event={d} /> : <SkeletonPanels />}
    </EntityFrame>
  )
}
