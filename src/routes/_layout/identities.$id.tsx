import { pageSsr } from '#/lib/pageSsr'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { identityQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/identities/$id')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Attacker identity views', basePath: (params) => `/identities/${encodeURIComponent(params.id)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const identity = await ensure(context, identityQuery(params.id))
    if (!identity) throw notFound()
    return identity
  },
  notFoundComponent: () => <NotFound title="Attacker identity" description="No attacker identity has this id." />,
  component: IdentityLayout,
  pendingComponent: IdentityLayout,
})

function IdentityLayout() {
  const loaded = usePageQuery(identityQuery(Route.useParams().id))
  const { id } = Route.useParams()
  const a = loaded?.identity
  return (
    <EntityFrame
      kind="Attacker identity"
      title={id.slice(0, 8)}
      description="Addresses joined by shared fingerprints, payloads, or credentials. Behavior context only, never actor attribution."
      basePath={`/identities/${encodeURIComponent(id)}`}
      tokens={a && (<>
          {a.scan && <Token size="sm" color="orange" label={`${a.scan} scan`} />}
          {a.verdicts.map((v) => (
            <Token key={v} size="sm" color="purple" label={v} />
          ))}
        </>)}
      facts={[
        { label: 'Member IPs', value: a && (formatNumber(a.ips.length))},
        { label: 'Events', value: a && (formatNumber(a.events))},
        { label: 'First seen', value: a && (formatDateTime(a.first))},
        { label: 'Last seen', value: a && (formatDateTime(a.last))},
        { label: 'Updated', value: a && (formatDateTime(a.updated))},
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'members', label: 'Member IPs' }, { id: 'indicators', label: 'Indicators' }, { id: 'why', label: 'Why merged' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const { identity: a, group, shared } = data
  const indicators = a?.fingerprints.length + a?.payloads.length + a?.credentials.length
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'members', label: 'Member IPs', count: group.members.length },
    { id: 'indicators', label: 'Indicators', count: indicators },
    { id: 'why', label: 'Why merged', count: shared.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
