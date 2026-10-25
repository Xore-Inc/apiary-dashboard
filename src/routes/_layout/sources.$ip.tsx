import { pageSsr } from '#/lib/pageSsr'
import { orPending } from '#/lib/pending'
import { ActionLink } from '#/components/ActionLink'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { BlockControl } from '#/components/BlockControl'
import { EntityFrame } from '#/components/EntityFrame'
import { entityTabs } from '#/components/ViewTabs'
import type { ViewTab } from '#/components/ViewTabs'
import { EntityLink } from '#/components/EntityLink'
import { NotFound } from '#/components/NotFound'
import { getIpProfile } from '#/data/queries'
import { formatAs, formatDateTime, formatNumber } from '#/lib/format'

export const Route = createFileRoute('/_layout/sources/$ip')({
  ssr: pageSsr,
  staticData: { viewTabs: entityTabs({ label: 'Source IP views', basePath: (params) => `/sources/${encodeURIComponent(params.ip)}`, tabs: tabsFor }) },
  loader: async ({ params }) => {
    const profile = await getIpProfile(params.ip)
    if (!profile) throw notFound()
    return profile
  },
  notFoundComponent: () => <NotFound title="Source IP" description="No events from this address." />,
  component: SourceLayout,
  pendingComponent: SourceLayout,
})

function SourceLayout() {
  const p = orPending(Route.useLoaderData())
  const { ip } = Route.useParams()

  return (
    <EntityFrame
      kind="Source IP"
      title={ip}
      basePath={`/sources/${ip}`}
      tokens={
        p && (
        <>
          <EntityLink kind="country" id={p.source.country}>
            <Token size="sm" color="blue" label={p.source.country} />
          </EntityLink>
          {p.source.tags.map((tag) => (
            <Token key={tag} size="sm" color="orange" label={tag} />
          ))}
          {p.blocked && <Token size="sm" color="red" label="blocked" />}
          {/* Only when true: most sources are hostile and simply never
              turned up in an analysed sample, so absence is not "benign". */}
          {p.confirmedMalicious && (
            <Tooltip content="A sandbox detonation of a sample that references this address actually connected to it: two independent pipelines agree. Informational; blocking does not depend on it." focusTrigger="always">
              <Token size="sm" color="red" label="confirmed malicious (sandbox)" />
            </Tooltip>
          )}
        </>
        )
      }
      facts={[
        { label: 'Network', value: p && (p.source.asn ? <EntityLink kind="asn" id={p.source.asn}>{formatAs(p.source.asn, p.source.org)}</EntityLink> : (p.source.org || '—')) },
        { label: 'First seen', value: p && formatDateTime(p.source.first) },
        { label: 'Last seen', value: p && formatDateTime(p.source.last) },
        { label: 'Events', value: p && formatNumber(p.source.events) },
        { label: 'Risk score', value: p && String(p.source.riskScore) },
        ...(p?.block ? [{ label: 'Blocked', value: `by ${p.block.by}, ${formatDateTime(p.block.at)}${p.block.expiresAt ? `, expires ${formatDateTime(p.block.expiresAt)}` : ', until lifted'}` }] : []),
      ]}
      actions={
        <>
          <ActionLink href={`/recordings?ip=${ip}`}>Recordings</ActionLink>
          {p && <BlockControl ip={ip} blocked={p.blocked} />}
        </>
      }
    >
      <Outlet />
    </EntityFrame>
  )
}

/** The top-bar tabs: static until the loader data arrives, then with counts. */
function tabsFor(loaded: unknown): ViewTab[] {
  const p = loaded as ReturnType<typeof Route.useLoaderData> | undefined
  return [
    { id: 'overview', label: 'Overview' },
    { id: 'behavior', label: 'Behavior', count: p?.techniques.length },
    { id: 'breakdown', label: 'Breakdown' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'events', label: 'Events', count: p?.source.events },
    { id: 'sessions', label: 'Sessions', count: p?.source.sessions },
    { id: 'payloads', label: 'Payloads', count: p?.payloads.length },
    { id: 'network', label: 'Network' },
    { id: 'identity', label: 'Identity' },
  ]
}
