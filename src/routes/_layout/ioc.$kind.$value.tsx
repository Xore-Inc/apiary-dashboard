import { pageSsr } from '#/lib/pageSsr'
import { Token } from '@astryxdesign/core/Token'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { NotFound } from '#/components/NotFound'
import { formatDateTime, formatNumber } from '#/lib/format'
import { ensure, usePageQuery } from '#/lib/query'
import { iocQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/ioc/$kind/$value')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Indicator views', basePath: (params) => `/ioc/${params.kind}/${encodeURIComponent(params.value)}`, tabs: tabsFor }) },
  loader: async ({ params, context }) => {
    const ioc = await ensure(context, iocQuery(params.kind, params.value))
    if (!ioc) throw notFound()
    return ioc
  },
  notFoundComponent: () => <NotFound title="Indicator" description="No captured event carries this value." />,
  component: IocLayout,
  pendingComponent: IocLayout,
})

const NOUN: Record<string, string> = {
  domain: 'Domain',
  url: 'URL',
  credential: 'Credential pair',
  command: 'Command',
  fingerprint: 'Fingerprint',
  cve: 'CVE',
  signature: 'IDS signature',
  username: 'Username',
  password: 'Password',
  hash: 'Payload hash',
}

/** One indicator and everything that carried it (epic #25). */
function IocLayout() {
  const ioc = usePageQuery(iocQuery(Route.useParams().kind, Route.useParams().value))
  // The kind and the value are in the address.
  const { kind, value } = Route.useParams()
  return (
    <EntityFrame
      kind={`Indicator · ${(NOUN as Record<string, string | undefined>)[kind] ?? kind}`}
      title={value.length > 80 ? `${value.slice(0, 79)}…` : value}
      basePath={`/ioc/${kind}/${encodeURIComponent(value)}`}
      tokens={ioc && <Token size="sm" label={ioc.kind} />}
      facts={[
        { label: 'Events', value: ioc && formatNumber(ioc.events.length) },
        { label: 'Source IPs', value: ioc && formatNumber(ioc.group.members.length) },
        { label: 'Sessions', value: ioc && formatNumber(ioc.sessions.length) },
        { label: 'First seen', value: ioc && (ioc.events.length ? formatDateTime(ioc.events.at(-1)!.timestamp) : '—') },
        { label: 'Last seen', value: ioc && (ioc.events.length ? formatDateTime(ioc.events[0].timestamp) : '—') },
      ]}
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  if (!loaded) return [{ id: 'overview', label: 'Overview' }, { id: 'breakdown', label: 'Breakdown' }, { id: 'sources', label: 'Sources' }, { id: 'sessions', label: 'Sessions' }, { id: 'events', label: 'Events' }, { id: 'payloads', label: 'Payloads' }, { id: 'timeline', label: 'Timeline' }]
  const data = loaded as ReturnType<typeof Route.useLoaderData>
  const ioc = data
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'sources', label: 'Sources', count: ioc?.group.members.length },
    { id: 'sessions', label: 'Sessions', count: ioc?.sessions.length },
    { id: 'events', label: 'Events', count: ioc?.events.length },
    { id: 'payloads', label: 'Payloads', count: ioc?.payloads.length },
    { id: 'timeline', label: 'Timeline' },
  ]
}
